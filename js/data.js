/**
 * @file data.js
 * Normalised item lists for every boss, and where each item's icon lives.
 */

import { RAW_BOSS_DATA } from './drops.js';

const DEFAULT_SORT_ORDER = 99;

// Items whose wiki image name differs from "<Item_name>.png"
const IMAGE_OVERRIDES = {
    "Ikkle hydra": "Ikkle_hydra_(serpentine).png",
    "Gull": "Gull_(pet).png",
    "Muphin": "Muphin_(ranged).png"
};

const parseBossItems = (items) => Object.entries(items).map(([id, item]) => ({
    ...item,
    id,
    order: item.order ?? DEFAULT_SORT_ORDER,
    hidden: Boolean(item.hidden)
}));

/** Item list per boss key, keyed like RAW_BOSS_DATA. */
export const BOSS_ITEMS = Object.fromEntries(
    Object.entries(RAW_BOSS_DATA).map(([bossKey, rawItems]) => [bossKey, parseBossItems(rawItems)])
);

export function getItemImageFilename(name) {
    return IMAGE_OVERRIDES[name] ?? `${name.replaceAll(' ', '_')}.png`;
}

export function getItemImagePath(name) {
    return `assets/items/${getItemImageFilename(name)}`;
}

export function getItemWikiImageUrl(name) {
    return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${encodeURIComponent(getItemImageFilename(name))}?width=120`;
}
