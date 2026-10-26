/**
 * @file download_icons.js
 * Run this script using Node.js to auto-download item icons and boss portraits from the OSRS Wiki.
 * Files that already exist are skipped, so it only fetches what's new.
 *
 * Boss portraits are standardised so they read as one set: each Wiki image is trimmed, scaled to the
 * same visual weight (within size limits) and placed standing on a shared floor line on one canvas.
 * The Wiki originals are kept in .cache/bosses, so the processing can be re-run without downloading.
 *
 * Command: node download_icons.js            (needs `npm install` once, for sharp)
 *          node download_icons.js --rebuild  (re-process every portrait from the cached originals)
 */

import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import sharp from 'sharp';
import { RAW_BOSS_DATA } from './js/drops.js';
import { getItemImageFilename, getItemWikiImageUrl, getBossImagePath } from './js/data.js';
import { getBossDefinition, getBossWikiImage } from './js/bosses.js';

const ITEMS_DIR = './assets/items';
const BOSSES_DIR = './assets/bosses';
const BOSS_CACHE_DIR = './.cache/bosses';
const WIKI = 'https://oldschool.runescape.wiki';
const API_BATCH_SIZE = 50; // the most titles the Wiki API takes per request
const REBUILD = process.argv.includes('--rebuild');

// Portrait canvas, twice the size it's shown at so it stays sharp on high-density screens
const PORTRAIT = {
    sourceWidth: 600,                      // width requested from the Wiki, before processing
    width: 480,
    height: 320,
    maxFigureWidth: 440,
    maxFigureHeight: 296,
    floorMargin: 12,                       // space under the figure for the page's floor shadow
    targetWeight: 0.22 * 480 * 320,        // opaque pixels each figure aims for, so tall and wide bosses balance
    alphaThreshold: 24                     // pixels fainter than this count as background
};

// The Wiki requires a descriptive User-Agent to prevent anonymous spam
const HEADERS = { 'User-Agent': 'DropLogic-Asset-Builder/1.0 (+https://github.com/Reskilling/GoblinDropLogic)' };

for (const dir of [ITEMS_DIR, BOSSES_DIR, BOSS_CACHE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const pause = () => new Promise(resolve => setTimeout(resolve, 200)); // be nice to the Wiki server

async function download(url, localPath) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`Status ${response.status}`);
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

const cachedOriginal = (key) => `${BOSS_CACHE_DIR}/${key}`;

/** Fetches the Wiki originals that aren't cached yet (any format the Wiki serves; sharp reads them all). */
async function cacheBossOriginals(bossKeys) {
    const missing = bossKeys.filter(key => !fs.existsSync(cachedOriginal(key)));
    if (!missing.length) return;

    console.log(`Downloading ${missing.length} boss images from the Wiki...`);
    const pageImages = await findBossPageImages(missing.filter(key => !getBossWikiImage(key)));

    for (const key of missing) {
        const file = getBossWikiImage(key) ?? pageImages[key];
        if (!file) {
            console.error(`[ERROR] No Wiki image found for ${key}; add one to WIKI_IMAGE_OVERRIDES in js/bosses.js`);
            continue;
        }
        try {
            await download(`${WIKI}/w/Special:Redirect/file/${encodeURIComponent(file)}?width=${PORTRAIT.sourceWidth}`, cachedOriginal(key));
            console.log(`[OK] ${key} <- ${file}`);
            await pause();
        } catch (err) {
            console.error(`[ERROR] Failed to download ${key} (${file}):`, err.message);
        }
    }
}

/** Finds the box around the visible figure and how many of its pixels are opaque. */
function measureFigure({ data, info }) {
    let left = info.width, top = info.height, right = -1, bottom = -1, opaque = 0;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * 4 + 3] <= PORTRAIT.alphaThreshold) continue;
            opaque++;
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
    }
    return { left, top, width: right - left + 1, height: bottom - top + 1, opaque };
}

/** Trims, scales and places one figure on the shared portrait canvas, standing on the floor line. */
async function standardisePortrait(sourcePath, outputPath) {
    // GIFs and animated images use their first frame
    const raw = await sharp(sourcePath, { pages: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const figure = measureFigure(raw);

    // Equal visual weight, except where that would break the size limits (very tall or very wide figures)
    const scale = Math.min(
        Math.sqrt(PORTRAIT.targetWeight / figure.opaque),
        PORTRAIT.maxFigureWidth / figure.width,
        PORTRAIT.maxFigureHeight / figure.height
    );
    const width = Math.round(figure.width * scale);
    const height = Math.round(figure.height * scale);

    const trimmed = await sharp(raw.data, { raw: raw.info })
        .extract({ left: figure.left, top: figure.top, width: figure.width, height: figure.height })
        .resize(width, height, { kernel: 'lanczos3' })
        .png()
        .toBuffer();

    await sharp({ create: { width: PORTRAIT.width, height: PORTRAIT.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{
            input: trimmed,
            left: Math.round((PORTRAIT.width - width) / 2),
            top: PORTRAIT.height - PORTRAIT.floorMargin - height
        }])
        .webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(outputPath);
}

async function downloadBossImages() {
    const bossKeys = Object.keys(RAW_BOSS_DATA);
    await cacheBossOriginals(bossKeys);

    const toBuild = bossKeys.filter(key => fs.existsSync(cachedOriginal(key)) && (REBUILD || !fs.existsSync(getBossImagePath(key))));
    console.log(`Standardising ${toBuild.length} boss portraits...`);

    for (const key of toBuild) {
        try {
            await standardisePortrait(cachedOriginal(key), getBossImagePath(key));
        } catch (err) {
            console.error(`[ERROR] Failed to process ${key}:`, err.message);
        }
    }
}

await downloadIcons();
await downloadBossImages();
console.log('Download sequence complete!');
