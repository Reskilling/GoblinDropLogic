import { RAW_BOSS_DATA } from './drops.js';

export let BOSS_CONFIG = {};

/**
 * Maps bosses that grant multiple standard loot rolls per kill.
 * Note: Moons of Peril is excluded here because it uses siloed independent 
 * pools (handled by createMoonsMatrix) rather than multi-rolling a shared table.
 */
const SPECIAL_MECHANICS = {
    "zulrah": { rolls: 2 },
    "barrows_chests": { rolls: 6 },
    "phantom_muspah": { rolls: 2 }
};

/**
 * Initializes the boss configuration on load.
 * Items are scoped strictly to their respective boss object to prevent data 
 * collisions across shared items (e.g., Dragon pickaxe having different rates 
 * at different Wilderness bosses).
 */
try {
    for (const [bossKey, items] of Object.entries(RAW_BOSS_DATA)) {
        const bossItems = [];
        
        for (const [id, details] of Object.entries(items)) {
            bossItems.push({
                id: id,
                name: details.name,
                rate: details.rate,
                type: details.type,
                order: details.order || 99,
                pieces: details.pieces,
                pool: details.pool
            });
        }

        BOSS_CONFIG[bossKey] = {
            rolls: SPECIAL_MECHANICS[bossKey]?.rolls || 1, 
            items: bossItems
        };
    }
} catch (error) {
    console.error("Critical Error Loading Scoped Data:", error);
}

/**
 * Formats a raw dictionary key into a presentable UI string.
 * @param {string} str - Raw boss key (e.g., "commander_zilyana")
 * @returns {string} Title-cased UI string (e.g., "Commander Zilyana")
 */
export function formatBossName(str) {
    if (!str) return "";
    return str.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** * Maps in-game names to Wiki file names for items with disambiguation tags. 
 */
const IMAGE_OVERRIDES = {
    "Ikkle hydra": "Ikkle_hydra_(serpentine).png",
    "Gull": "Gull_(pet).png",
    "Muphin": "Muphin_(ranged).png"
};

/**
 * Generates the direct URL for a 120px Wiki inventory sprite.
 * @param {string} name - The exact in-game name of the item.
 * @returns {string} Direct URL to the Wiki image redirect service.
 */
export function getWikiUrl(name) {
    if (!name) return "";
    
    const filename = IMAGE_OVERRIDES[name] || name.replace(/ /g, '_') + '.png';
    
    return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${filename}?width=120`;
}