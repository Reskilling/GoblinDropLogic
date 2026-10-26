/**
 * @file audit_rates.js
 * Checks every drop rate in js/drops.js against the OSRS Wiki's drop database, so the data can be
 * re-checked after game updates. It changes nothing; it prints the items that need a human look.
 * Command: npm run audit-rates
 *
 * An item passes when any Wiki drop row for it matches one of our numbers (within 2%): the stored rate,
 * the rate the boss's adjuster gives at default settings, the per-piece rate of a duplicate-protected
 * pool, the effective rate of a 3-roll vestige, or for raid uniques the weight's share of its table.
 * Bosses in DERIVED_RATES are compared against what their rates are calculated from.
 * Items that fail often have a known reason (a drop that only some settings allow, a rate that scales
 * with points), so read each one against the Wiki before changing anything.
 */

import { BOSS_ITEMS } from './js/data.js';
import { getBossDefinition, getDefaultState } from './js/bosses.js';

const API = 'https://oldschool.runescape.wiki/api.php';
const HEADERS = { 'User-Agent': 'DropLogic-Audit/1.0 (+https://github.com/Reskilling/GoblinDropLogic)' };
const BATCH_SIZE = 25;
const TOLERANCE = 0.02;

const pause = () => new Promise(resolve => setTimeout(resolve, 300)); // be nice to the Wiki server

/** Gets every Wiki drop row for the given item names from the Wiki's "dropsline" Bucket table. */
async function fetchWikiDrops(names) {
    const rows = [];
    for (let i = 0; i < names.length; i += BATCH_SIZE) {
        const conditions = names.slice(i, i + BATCH_SIZE).map(name => `{'item_name',${JSON.stringify(name)}}`);
        const where = conditions.length === 1 ? conditions[0] : `bucket.Or(${conditions.join(',')})`;
        const query = `bucket('dropsline').select('page_name','item_name','drop_json').where(${where}).limit(5000).run()`;
        const response = await (await fetch(`${API}?action=bucket&format=json&query=${encodeURIComponent(query)}`, { headers: HEADERS })).json();
        if (response.error) throw new Error(`Wiki query failed: ${response.error}`);

        for (const { page_name: page, item_name: item, drop_json: json } of response.bucket) {
            const drop = JSON.parse(json);
            rows.push({ page, item: item.toLowerCase(), rarity: drop['Rarity'], alt: drop['Alt Rarity'] || '' });
        }
        await pause();
    }
    return rows;
}

/** Turns a Wiki rarity like "1/1,365", "~2/128" or "Always" into a number; null for "Varies" and the like. */
function parseRarity(rarity) {
    const text = String(rarity ?? '').replace(/,/g, '').replace(/[~≈]/g, '').trim();
    if (/^always$/i.test(text)) return 1;
    const match = text.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
    return match ? Number(match[1]) / Number(match[2]) : null;
}

// Bosses whose rates are derived from the Wiki's rows rather than copied: each turns the item's Wiki rates
// into what drops.js should hold
const DERIVED_RATES = {
    // The Sire's uniques come from the Unsired, which drops once per 100 kills
    abyssal_sire: (wikiRates) => wikiRates.map(rate => rate / 100),
    // One Colosseum "kill" is a full run: the chance of at least one drop across every wave's chest,
    // and for the Sunfire set, of any of its pieces
    fortis_colosseum: (wikiRates, poolSize) => {
        const miss = wikiRates.reduce((product, rate) => product * (1 - rate), 1);
        return [1 - miss, 1 - miss ** poolSize];
    }
};

const formatRate = (rate) => (rate ? `1/${+(1 / rate).toFixed(2)}` : String(rate));

/** The numbers a Wiki row could show for this item, given how drops.js models it. */
function expectedRates(item, items, effectiveRate) {
    if (item.weight !== undefined) {
        const tableWeight = items.filter(i => i.weight !== undefined).reduce((sum, i) => sum + i.weight, 0);
        return [item.weight / tableWeight];
    }
    const poolSize = item.pool ? items.filter(i => i.pool === item.pool).length : 1;
    const rolls = /vestige/i.test(item.name) && item.pieces > 1 ? item.pieces : 1;
    return [item.rate, effectiveRate, item.rate / poolSize, effectiveRate / poolSize, item.rate / rolls]
        .filter(rate => typeof rate === 'number' && rate > 0);
}

const names = [...new Set(Object.values(BOSS_ITEMS).flat().map(item => item.name))];
console.log(`Fetching Wiki drop rows for ${names.length} items...`);
const wikiRows = await fetchWikiDrops(names);

const needsLook = [];
const noRows = [];
let passed = 0;

for (const [bossKey, items] of Object.entries(BOSS_ITEMS)) {
    const definition = getBossDefinition(bossKey);
    const effective = definition.adjust ? definition.adjust(items, getDefaultState(definition)) : items;

    for (const item of items) {
        const rows = wikiRows.filter(row => row.item === item.name.toLowerCase());
        if (!rows.length) {
            noRows.push(`${bossKey}: ${item.name}`);
            continue;
        }
        const poolSize = item.pool ? items.filter(i => i.pool === item.pool).length : 1;
        const rawWikiRates = rows.flatMap(row => [parseRarity(row.rarity), parseRarity(row.alt)]).filter(Boolean);
        const wikiRates = DERIVED_RATES[bossKey] ? DERIVED_RATES[bossKey](rawWikiRates, poolSize) : rawWikiRates;
        const effectiveRate = effective.find(e => e.name === item.name)?.rate;
        const matches = expectedRates(item, items, effectiveRate).some(ours => wikiRates.some(wiki => Math.abs(ours - wiki) / wiki < TOLERANCE));

        if (matches) passed++;
        else needsLook.push({
            boss: bossKey,
            item: item.name,
            ours: item.weight !== undefined ? `weight ${item.weight}` : `${formatRate(item.rate)} (default settings: ${formatRate(effectiveRate)})`,
            wiki: rows.map(row => `${row.page}: ${row.rarity}${row.alt ? ` (alt ${row.alt})` : ''}`).join(' | ')
        });
    }
}

console.log(`\n${passed} items match the Wiki.`);
if (needsLook.length) {
    console.log(`\n${needsLook.length} need a look:`);
    for (const { boss, item, ours, wiki } of needsLook) console.log(`- ${boss} / ${item}\n    ours: ${ours}\n    wiki: ${wiki}`);
}
if (noRows.length) {
    console.log(`\n${noRows.length} have no Wiki drop rows (guaranteed rewards, or listed under another name):`);
    for (const entry of noRows) console.log(`- ${entry}`);
}
