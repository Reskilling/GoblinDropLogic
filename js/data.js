import { RAW_BOSS_DATA } from './drops.js';

const DEFAULT_SORT_ORDER = 99;

// Flattened the mechanics object to avoid nested property lookups later
const SPECIAL_ROLLS = {
    "zulrah": 2,
    "barrows_chests": 6,
    "phantom_muspah": 2,
    "grotesque_guardians": 2
};

const IMAGE_OVERRIDES = {
    "Ikkle hydra": "Ikkle_hydra_(serpentine).png",
    "Gull": "Gull_(pet).png",
    "Muphin": "Muphin_(ranged).png"
};

/**
 * Maps raw item dictionaries into normalized structures.
 * Switched to a traditional `for...in` loop to avoid the heavy array-of-tuples 
 * allocation overhead that comes with `Object.entries().map()`.
 */
const parseBossItems = (items) => {
    const parsed = [];
    
    for (const id in items) {
        // Protect against prototype pollution/injection when using for...in
        if (!Object.prototype.hasOwnProperty.call(items, id)) continue;

        const { name, rate, type, order, pieces, pool, hidden } = items[id];
        
        parsed.push({
            id, 
            name,
            rate,
            type,
            // Using nullish coalescing (??) prevents bugs if an item 
            // legitimately has a sorted order of 0.
            order: order ?? DEFAULT_SORT_ORDER,
            pieces,
            pool,
            hidden: Boolean(hidden)
        });
    }
    
    return parsed;
};

const buildBossConfig = (rawData) => {
    try {
        const config = {};
        
        // Pre-allocating the object directly bypasses the need to create 
        // nested arrays just to feed `Object.fromEntries()`.
        for (const bossKey in rawData) {
            if (!Object.prototype.hasOwnProperty.call(rawData, bossKey)) continue;

            config[bossKey] = {
                rolls: SPECIAL_ROLLS[bossKey] ?? 1,
                items: parseBossItems(rawData[bossKey])
            };
        }
        
        return config;
    } catch (error) {
        console.error("Critical Error Loading Scoped Data:", error);
        return {}; 
    }
};

export const BOSS_CONFIG = buildBossConfig(RAW_BOSS_DATA);

export function formatBossName(str) {
    if (!str) return "";
    
    return str.toLowerCase()
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function getWikiUrl(name) {
    if (!name) return "";
    
    const filename = IMAGE_OVERRIDES[name] ?? `${name.replaceAll(' ', '_')}.png`;
    return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${filename}?width=120`;
}