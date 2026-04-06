import { RAW_BOSS_DATA } from './drops.js';

const DEFAULT_SORT_ORDER = 99;

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
 */
const parseBossItems = (items) => {
    // I swapped the clunky `for...in` loop back to `Object.entries`. 
    // While `for...in` saves a tiny allocation, this dataset is tiny. 
    // The V8 engine optimizes standard array methods incredibly well, and removing the 
    // boilerplate prototype checks makes this significantly cleaner and less error-prone.
    return Object.entries(items).map(([id, { name, rate, type, order, pieces, pool, hidden }]) => ({
        id, 
        name,
        rate,
        type,
        // Using nullish coalescing ensures an explicit '0' order isn't overwritten by falsy fallback
        order: order ?? DEFAULT_SORT_ORDER,
        pieces,
        pool,
        hidden: Boolean(hidden)
    }));
};

const buildBossConfig = (rawData) => {
    try {
        // Object.fromEntries is perfectly suited for this kind of structural mapping.
        // It lets us keep the transformation purely declarative without mutating a temporary object.
        return Object.fromEntries(
            Object.entries(rawData).map(([bossKey, rawItems]) => [
                bossKey,
                {
                    rolls: SPECIAL_ROLLS[bossKey] ?? 1,
                    items: parseBossItems(rawItems)
                }
            ])
        );
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
    
    // Check our manual overrides list first, otherwise fallback to standard Wiki file formatting
    const filename = IMAGE_OVERRIDES[name] ?? `${name.replaceAll(' ', '_')}.png`;
    
    return `assets/items/${filename}`;
}