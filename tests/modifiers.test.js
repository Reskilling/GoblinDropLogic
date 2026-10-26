import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as modifiers from '../js/modifiers.js';
import { BOSS_ITEMS } from '../js/data.js';

const rateOf = (items, name) => items.find(i => i.name === name).rate;
const assertClose = (actual, expected, relTolerance, label) =>
    assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relTolerance, `${label}: expected ~${expected}, got ${actual}`);

test('ToB gives a personal chance: a five-player team member gets a fifth of a solo chance', () => {
    const items = BOSS_ITEMS.theatre_of_blood;
    const solo = rateOf(modifiers.adjustRatesForTob(items, { size: 1, deaths: 0 }), 'Scythe of Vitur (uncharged)');
    const fiveMan = rateOf(modifiers.adjustRatesForTob(items, { size: 5, deaths: 0 }), 'Scythe of Vitur (uncharged)');

    assertClose(solo, (1 / 9.1) / 19, 1e-9, 'solo scythe');
    assertClose(fiveMan, solo / 5, 1e-9, 'five-man scythe');
});

test('CoX unique chance stops growing at 570,000 points', () => {
    const items = BOSS_ITEMS.chambers_of_xeric;
    const atCap = rateOf(modifiers.adjustRatesForCox(items, { points: 570000 }), 'Twisted bow');
    const pastCap = rateOf(modifiers.adjustRatesForCox(items, { points: 900000 }), 'Twisted bow');

    assert.equal(pastCap, atCap);
    assertClose(atCap, (570000 / 867600) * (2 / 60), 1e-9, 'twisted bow at cap');
});

test('ToA unique chance is capped at 55%', () => {
    const adjusted = modifiers.adjustRatesForToa(BOSS_ITEMS.tombs_of_amascut, { level: 500, points: 10_000_000 });
    const total = adjusted.filter(i => i.type === 'main').reduce((sum, i) => sum + i.rate, 0);
    assertClose(total, 0.55, 1e-9, 'total unique chance');
});

test("ToA's pet uses its own raid-level scaling, capped at level 550", () => {
    const pet = rateOf(modifiers.adjustRatesForToa(BOSS_ITEMS.tombs_of_amascut, { level: 600, points: 30000 }), "Tumeken's guardian");
    assertClose(pet, (30000 - 5000) / (100 * (350000 - 700 * 450)), 1e-9, 'pet');
});

test("ToA loot ignores the 5,000 points every player starts with", () => {
    const atStart = rateOf(modifiers.adjustRatesForToa(BOSS_ITEMS.tombs_of_amascut, { level: 300, points: 5000 }), "Tumeken's shadow (uncharged)");
    assert.equal(atStart, 0);
});

test("Each Royal Titan locks only the other titan's own items", () => {
    const branda = modifiers.titanItemsFor('branda', BOSS_ITEMS.royal_titans);
    assert.ok(branda.includes('Fire element staff crown') && branda.includes('Giantsoul amulet (uncharged)'));
    assert.ok(!branda.includes('Ice element staff crown') && !branda.includes('Deadeye prayer scroll'));
});

test('Doom uniques unlock at their own delve levels', () => {
    assert.deepEqual(modifiers.doomItemsAvailableAt(2), ['Mokhaiotl cloth']);
    assert.deepEqual(modifiers.doomItemsAvailableAt(4), ['Mokhaiotl cloth', 'Eye of Ayak (uncharged)', 'Avernic treads']);
    assert.equal(modifiers.doomItemsAvailableAt(6), null);
});

test("Nightmare's jar keeps its flat rate whatever the team size", () => {
    const solo = rateOf(modifiers.adjustRatesForNightmare(BOSS_ITEMS.the_nightmare, { variant: 'standard', teamSize: 1 }), 'Jar of Dreams');
    const team = rateOf(modifiers.adjustRatesForNightmare(BOSS_ITEMS.the_nightmare, { variant: 'standard', teamSize: 5 }), 'Jar of Dreams');
    assert.equal(solo, 1 / 2000);
    assert.equal(team, 1 / 2000);
});

test('Yama tallow matches the wiki overall rate of 5/95.11', () => {
    const tallow = rateOf(modifiers.adjustRatesForYama(BOSS_ITEMS.yama, { contrib: 100 }), 'Barrel of demonic tallow (full)');
    assertClose(tallow, 5 / 95.11, 0.005, 'tallow');
});

test('Nightmare pet is 1/(800 x team) up to five players, then 1/4000', () => {
    const pet = (teamSize) => rateOf(modifiers.adjustRatesForNightmare(BOSS_ITEMS.the_nightmare, { variant: 'standard', teamSize }), 'Little Nightmare');
    assertClose(pet(3), 1 / 2400, 1e-9, 'team of 3');
    assertClose(pet(10), 1 / 4000, 1e-9, 'team of 10');
});

test("Royal Titans: Branda never drops Eldric's scroll", () => {
    const adjusted = modifiers.adjustRatesForTitans(BOSS_ITEMS.royal_titans, { target: 'branda', action: 'loot', contrib: 100 });
    assert.equal(rateOf(adjusted, 'Deadeye prayer scroll'), 0);
    assert.ok(rateOf(adjusted, 'Mystic vigour prayer scroll') > 0);
});
