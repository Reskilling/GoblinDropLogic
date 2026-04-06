/**
 * @file download_icons.js
 * Run this script using Node.js to auto-download all item images from the OSRS Wiki.
 * Command: node download_icons.js
 */

import fs from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { RAW_BOSS_DATA } from './js/drops.js';

// We duplicate this here so the scraper knows the exact filenames to request
const IMAGE_OVERRIDES = {
    "Ikkle hydra": "Ikkle_hydra_(serpentine).png",
    "Gull": "Gull_(pet).png",
    "Muphin": "Muphin_(ranged).png"
};

const ASSETS_DIR = './assets/items';

// Create the directory if it doesn't exist
if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
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
        const filename = IMAGE_OVERRIDES[name] ?? `${name.replaceAll(' ', '_')}.png`;
        const url = `https://oldschool.runescape.wiki/w/Special:Redirect/file/${filename}?width=120`;
        const localPath = `${ASSETS_DIR}/${filename}`;

        // Skip if we already downloaded it
        if (fs.existsSync(localPath)) {
            console.log(`[SKIP] ${filename} already exists.`);
            continue;
        }

        try {
            // The Wiki requires a descriptive User-Agent to prevent anonymous spam
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'DropLogic-Asset-Builder/1.0 (Contact:)'
                }
            });

            if (!response.ok) throw new Error(`Status ${response.status}`);

            const dest = fs.createWriteStream(localPath);
            await finished(Readable.fromWeb(response.body).pipe(dest));
            console.log(`[OK] Downloaded: ${filename}`);
            
            // Be nice to the wiki server: wait 200ms between requests
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (err) {
            console.error(`[ERROR] Failed to download ${filename}:`, err.message);
        }
    }
    
    console.log("Download sequence complete!");
}

downloadIcons();