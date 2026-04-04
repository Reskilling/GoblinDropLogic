import { RAW_BOSS_DATA } from './drops.js';

const DEFAULT_SORT_ORDER = 99;

const SPECIAL_MECHANICS = {
    "zulrah": { rolls: 2 },
    "barrows_chests": { rolls: 6 },
    "phantom_muspah": { rolls: 2 },
    "grotesque_guardians": { rolls: 2 }
};

const IMAGE_OVERRIDES = {
    "Ikkle hydra": "Ikkle_hydra_(serpentine).png",
    "Gull": "Gull_(pet).png",
    "Muphin": "Muphin_(ranged).png"
};

/**
 * Maps raw item dictionaries into normalized array structures.
 * Destructuring the item object here explicitly documents our expected data schema.
 */
const parseBossItems = (items) => {
    return Object.entries(items).map(([id, { name, rate, type, order, pieces, pool, hidden }]) => ({
        id, 
        name,
        rate,
        type,
        order: order || DEFAULT_SORT_ORDER,
        pieces,
        pool,
        hidden: Boolean(hidden) // Explicit boolean cast guarantees type safety
    }));
};

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
    const filename = IMAGE_OVERRIDES[name] || `${name.replaceAll(' ', '_')}.png`;
    return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${filename}?width=120`;
}