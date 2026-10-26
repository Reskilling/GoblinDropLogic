import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { BOSS_ITEMS, getItemImagePath, getBossImagePath } from '../js/data.js';
import { DEFINED_BOSS_KEYS, getBossDefinition, getDefaultState } from '../js/bosses.js';

const bossKeys = Object.keys(BOSS_ITEMS);

test('every boss definition refers to a boss with a drop table', () => {
    const unknown = DEFINED_BOSS_KEYS.filter(key => !BOSS_ITEMS[key]);
    assert.deepEqual(unknown, []);
});

test('every item has a local icon', () => {
    const missing = bossKeys.flatMap(key => BOSS_ITEMS[key])
        .filter(item => !existsSync(new URL(`../${getItemImagePath(item.name)}`, import.meta.url)))
        .map(item => item.name);
    assert.deepEqual([...new Set(missing)], []);
});

test('every boss has a local portrait', () => {
    const missing = bossKeys.filter(key => !existsSync(new URL(`../${getBossImagePath(key)}`, import.meta.url)));
    assert.deepEqual(missing, []);
});

// Main items are outcomes of one shared roll, so their chances can't add up past 100%.
// Bosses with an adjust function store weights or base rates that the adjuster rescales.
test('main-table rates never add up to more than one roll', () => {
    const overfull = bossKeys.filter(key => !getBossDefinition(key).adjust).filter(key => {
        const seenPools = new Set();
        const total = BOSS_ITEMS[key]
            .filter(item => item.type === 'main')
            .filter(item => !item.pool || (!seenPools.has(item.pool) && seenPools.add(item.pool)))
            .reduce((sum, item) => sum + item.rate, 0);
        return total > 1 + 1e-9;
    });
    assert.deepEqual(overfull, []);
});

test('every adjusted boss produces valid rates from its default settings', () => {
    bossKeys.map(key => [key, getBossDefinition(key)]).filter(([, def]) => def.adjust).forEach(([key, def]) => {
        const adjusted = def.adjust(BOSS_ITEMS[key], getDefaultState(def));
        adjusted.forEach(item => {
            assert.ok(Number.isFinite(item.rate) && item.rate >= 0 && item.rate <= 1, `${key}: ${item.name} rate ${item.rate}`);
        });
    });
});

test('number setting defaults sit inside their own limits', () => {
    bossKeys.flatMap(key => getBossDefinition(key).settings.map(setting => [key, setting]))
        .filter(([, setting]) => setting.type === 'number')
        .forEach(([key, { key: settingKey, default: value, min = -Infinity, max = Infinity }]) => {
            assert.ok(value >= min && value <= max, `${key}.${settingKey} default ${value} outside ${min}..${max}`);
        });
});

const allItemNames = new Set(bossKeys.flatMap(key => BOSS_ITEMS[key].map(item => item.name)));

// Modifiers single out items by name; a typo would silently stop the adjustment applying
test('every item name used in modifiers.js exists in a drop table', () => {
    const source = readFileSync(new URL('../js/modifiers.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    const quoted = [...source.matchAll(/["']([A-Z][^"'\n]*?)["']\s*[:,)\]]/g)].map(m => m[1]);
    const unknown = [...new Set(quoted)].filter(name => !allItemNames.has(name));
    assert.ok(quoted.length > 30, `expected to find item names, found ${quoted.length}`);
    assert.deepEqual(unknown, []);
});

test('every item a setting can lock to exists in that boss', () => {
    bossKeys.map(key => [key, getBossDefinition(key)]).filter(([, def]) => def.lockItems).forEach(([key, def]) => {
        const toggles = def.settings.filter(s => s.type === 'toggle');
        // Try every combination of toggle options
        const states = toggles.reduce((acc, t) => acc.flatMap(state => t.options.map(o => ({ ...state, [t.key]: o.value }))), [getDefaultState(def)]);
        const names = new Set(BOSS_ITEMS[key].map(item => item.name));

        states.forEach(state => (def.lockItems(state) ?? []).forEach(name => assert.ok(names.has(name), `${key} locks to unknown item ${name}`)));
    });
});

test('raid uniques use a weight, not a rate', () => {
    ['chambers_of_xeric', 'theatre_of_blood', 'tombs_of_amascut'].forEach(key => {
        BOSS_ITEMS[key].filter(item => item.type === 'main').forEach(item => {
            assert.ok(item.weight > 0 && item.rate === undefined, `${key}: ${item.name}`);
        });
    });
});

test('display names are readable', () => {
    const name = (key) => getBossDefinition(key).name;
    assert.equal(name('theatre_of_blood'), 'Theatre of Blood');
    assert.equal(name('kree_arra'), "Kree'arra");
    assert.equal(name('the_whisperer'), 'The Whisperer');
    bossKeys.forEach(key => assert.ok(!name(key).includes('_'), key));
});
