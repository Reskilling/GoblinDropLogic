/**
 * @file data.js
 * Normalised item lists for every boss, and where each item's icon lives.
 */

import { RAW_BOSS_DATA } from './drops.js';

const DEFAULT_SORT_ORDER = 99;

// Items whose wiki image name differs from "<Item_name>.png"
const IMAGE_OVERRIDES = {
    "Ikkle Hydra": "Ikkle_hydra_(serpentine).png",
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

const MINOR_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

/**
 * Gets an item's name for display in title case: "Abyssal whip" -> "Abyssal Whip", "(inert)" -> "(Inert)".
 * The data keeps the Wiki's spelling, which icon paths and Wiki links depend on.
 */
export function formatItemName(name) {
    return name.split(' ').map((word, i) => {
        const [, lead, rest] = word.match(/^(\W*)(.*)$/); // keeps a leading "(" in place
        if (i > 0 && MINOR_WORDS.has(rest)) return word;
        return lead + rest.charAt(0).toUpperCase() + rest.slice(1);
    }).join(' ');
}

export function getItemImageFilename(name) {
    return IMAGE_OVERRIDES[name] ?? `${name.replaceAll(' ', '_')}.png`;
}

export function getItemImagePath(name) {
    return `assets/items/${getItemImageFilename(name)}`;
}

/** Gets the path of a boss's portrait, downloaded from the Wiki and standardised by download_icons.js. */
export function getBossImagePath(bossKey) {
    return `assets/bosses/${bossKey}.webp`;
}

export function getItemWikiImageUrl(name) {
    return `https://oldschool.runescape.wiki/w/Special:Redirect/file/${encodeURIComponent(getItemImageFilename(name))}?width=120`;
}
