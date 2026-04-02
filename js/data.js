import { RAW_BOSS_DATA } from './drops.js';

// Fallback order for items missing an explicit sort order so they drop to the bottom of the UI list
const DEFAULT_SORT_ORDER = 99;

// We exclude Moons of Peril here because it uses siloed independent pools 
// (handled by createMoonsMatrix) rather than multi-rolling a shared table.
const SPECIAL_MECHANICS = {
    "zulrah": { rolls: 2 },
    "barrows_chests": { rolls: 6 },
    "phantom_muspah": { rolls: 2 }
};

// Maps in-game names to Wiki file names for items with disambiguation tags.
const IMAGE_OVERRIDES = {
    "Ikkle hydra": "Ikkle_hydra_(serpentine).png",
    "Gull": "Gull_(pet).png",
    "Muphin": "Muphin_(ranged).png"
};

/**
 * Normalizes the raw item dictionaries into predictable arrays.
 */
const parseBossItems = (items) => {
    return Object.entries(items).map(([id, details]) => ({
        id, // Using ES6 shorthand property
        name: details.name,
        rate: details.rate,
        type: details.type,
        order: details.order || DEFAULT_SORT_ORDER,
        pieces: details.pieces,
        pool: details.pool
    }));
};

/**
 * Builds our main configuration object.
 * We scope items strictly to their respective bosses to avoid collisions 
 * (e.g., Dragon pickaxe having different rates at different Wildy bosses).
 */
const buildBossConfig = (rawData) => {
    try {
        return Object.fromEntries(
            Object.entries(rawData).map(([bossKey, items]) => [
                bossKey,
                {
                    rolls: SPECIAL_MECHANICS[bossKey]?.rolls || 1,
                    items: parseBossItems(items)
                }
            ])
        );
    } catch (error) {
        console.error("Critical Error Loading Scoped Data:", error);
        return {}; // Return a safe empty state so the app doesn't crash completely
    }
};

// Exporting as a constant to prevent accidental mutations downstream
export const BOSS_CONFIG = buildBossConfig(RAW_BOSS_DATA);

/**
 * Formats a raw dictionary key into a presentable UI string.
 * @param {string} str - Raw boss key (e.g., "commander_zilyana")
 * @returns {string} Title-cased UI string (e.g., "Commander Zilyana")
 */
export function formatBossName(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Generates the direct URL for a 120px Wiki inventory sprite.
 * @param {string} name - The exact in-game name of the item.
 * @returns {string} Direct URL to the Wiki image redirect service.
 */
export function getWikiUrl(name) {
    if (!name) return "";
    
    // Using replaceAll instead of a global regex for cleaner readability
    const filename = IMAGE_OVERRIDES[name] || `${name.replaceAll(' ', '_')}.png`;
    
    return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${filename}?width=120`;
}