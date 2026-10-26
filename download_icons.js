/**
 * @file download_icons.js
 * Run this script using Node.js to auto-download item icons and boss portraits from the OSRS Wiki.
 * Files that already exist are skipped, so it only fetches what's new.
 * Command: node download_icons.js
 */

import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { RAW_BOSS_DATA } from './js/drops.js';
import { getItemImageFilename, getItemWikiImageUrl, getBossImagePath } from './js/data.js';
import { getBossDefinition, getBossWikiImage } from './js/bosses.js';

const ITEMS_DIR = './assets/items';
const BOSSES_DIR = './assets/bosses';
const WIKI = 'https://oldschool.runescape.wiki';
const BOSS_IMAGE_WIDTH = 300;
const API_BATCH_SIZE = 50; // the most titles the Wiki API takes per request

// The Wiki requires a descriptive User-Agent to prevent anonymous spam
const HEADERS = { 'User-Agent': 'DropLogic-Asset-Builder/1.0 (+https://github.com/Reskilling/GoblinDropLogic)' };

for (const dir of [ITEMS_DIR, BOSSES_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const pause = () => new Promise(resolve => setTimeout(resolve, 200)); // be nice to the Wiki server

/** Downloads `url` to `localPath`; returns false (writing nothing) when the response isn't the expected type. */
async function download(url, localPath, expectedType = null) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`Status ${response.status}`);

    const type = response.headers.get('content-type') ?? '';
    if (expectedType && !type.startsWith(expectedType)) {
        await response.body?.cancel();
        throw new Error(`Got ${type}, expected ${expectedType}; choose a PNG in WIKI_IMAGE_OVERRIDES (js/bosses.js)`);
    }

    await finished(Readable.fromWeb(response.body).pipe(fs.createWriteStream(localPath)));
}

async function downloadIcons() {
    // Use a Set to prevent downloading the same item twice if it drops from multiple bosses
    const uniqueItems = new Set();

    for (const boss in RAW_BOSS_DATA) {
        for (const itemId in RAW_BOSS_DATA[boss]) {
            uniqueItems.add(RAW_BOSS_DATA[boss][itemId].name);
        }
    }

    console.log(`Found ${uniqueItems.size} unique items. Starting download...`);

    for (const name of uniqueItems) {
        const filename = getItemImageFilename(name);
        const localPath = `${ITEMS_DIR}/${filename}`;

        // Skip if we already downloaded it
        if (fs.existsSync(localPath)) {
            console.log(`[SKIP] ${filename} already exists.`);
            continue;
        }

        try {
            await download(getItemWikiImageUrl(name), localPath);
            console.log(`[OK] Downloaded: ${filename}`);
            await pause();
        } catch (err) {
            console.error(`[ERROR] Failed to download ${filename}:`, err.message);
        }
    }
}

/** Gets each boss's Wiki page image filename, following the page redirects the Wiki uses for some names. */
async function findBossPageImages(bossKeys) {
    const files = {};

    for (let i = 0; i < bossKeys.length; i += API_BATCH_SIZE) {
        const batch = bossKeys.slice(i, i + API_BATCH_SIZE);
        const titles = batch.map(key => getBossDefinition(key).name);
        const url = `${WIKI}/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(titles.join('|'))}`;
        const { query } = await (await fetch(url, { headers: HEADERS })).json();

        const renamed = Object.fromEntries([...(query.normalized ?? []), ...(query.redirects ?? [])].map(r => [r.from, r.to]));
        const imageByTitle = Object.fromEntries(Object.values(query.pages).map(page => [page.title, page.pageimage]));

        batch.forEach((key, index) => {
            let title = titles[index];
            while (renamed[title]) title = renamed[title];
            files[key] = imageByTitle[title] ?? null;
        });
        await pause();
    }
    return files;
}

async function downloadBossImages() {
    const missing = Object.keys(RAW_BOSS_DATA).filter(key => !fs.existsSync(getBossImagePath(key)));
    console.log(`${missing.length} boss portraits to download...`);
    if (!missing.length) return;

    const pageImages = await findBossPageImages(missing.filter(key => !getBossWikiImage(key)));

    for (const key of missing) {
        const file = getBossWikiImage(key) ?? pageImages[key];
        if (!file) {
            console.error(`[ERROR] No Wiki image found for ${key}; add one to WIKI_IMAGE_OVERRIDES in js/bosses.js`);
            continue;
        }

        try {
            await download(`${WIKI}/w/Special:Redirect/file/${encodeURIComponent(file)}?width=${BOSS_IMAGE_WIDTH}`, getBossImagePath(key), 'image/png');
            console.log(`[OK] ${key} <- ${file}`);
            await pause();
        } catch (err) {
            console.error(`[ERROR] Failed to download ${key} (${file}):`, err.message);
        }
    }
}

await downloadIcons();
await downloadBossImages();
console.log('Download sequence complete!');
