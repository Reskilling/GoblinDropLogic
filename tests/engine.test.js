import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMasterMatrix, createMoonsMatrix, createBarrowsMatrix } from '../js/matrix.js';
import { runSimulation, buildChartData } from '../js/solvers.js';

const item = (overrides) => ({ name: 'Item', rate: 1 / 100, type: 'main', pieces: 1, ...overrides });
const simulate = (items, rolls = 1) => runSimulation(createMasterMatrix(items, rolls));
const assertClose = (actual, expected, tolerance, label) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ~${expected}, got ${actual}`);

test('a single 1/100 drop averages 100 KC with a median of 69', () => {
    const result = simulate([item()]);
    assertClose(result.mean, 100, 0.5, 'mean');
    assert.equal(result.median, 69);
    assert.equal(result.modeKC, 1);
});

test('three identical independent drops follow the coupon collector expectation', () => {
    const result = simulate([item({ name: 'A' }), item({ name: 'B' }), item({ name: 'C' })]);
    assertClose(result.mean, 100 * (1 + 1 / 2 + 1 / 3), 0.5, 'mean');
});

test('a duplicate-protected pool awards a new piece on every hit', () => {
    const pool = ['A', 'B', 'C'].map(name => item({ name, pool: 'set' }));
    assertClose(simulate(pool).mean, 300, 0.5, 'mean');
});

test('a multi-piece item needs that many separate drops', () => {
    assertClose(simulate([item({ pieces: 3 })]).mean, 300, 0.5, 'mean');
});

test('two rolls per kill halve the expected KC for a single drop', () => {
    assertClose(simulate([item()], 2).mean, 50.25, 0.5, 'mean');
});

test('tertiary drops roll independently of the main table', () => {
    const guaranteed = item({ name: 'Cape', rate: 1, type: 'tertiary' });
    const echo = item({ name: 'Echo', rate: 1 / 12.44, type: 'tertiary' });
    assertClose(simulate([guaranteed, echo]).mean, simulate([echo]).mean, 0.01, 'mean');
});

test('one Moons of Peril set of four at 1/56 averages 224 chests', () => {
    const set = ['A', 'B', 'C', 'D'].map(name => item({ name, rate: 1 / 56, pool: 'blood' }));
    assertClose(runSimulation(createMoonsMatrix(set)).mean, 224, 0.5, 'mean');
});

test('a full Barrows set averages about 1,321 chests', () => {
    const result = runSimulation(createBarrowsMatrix(24));
    assertClose(result.mean, 1321, 1, 'mean');
});

test('chart data includes the milestone KCs in order', () => {
    const result = simulate([item({ rate: 1 / 5000 })]);
    const data = buildChartData(result.historyPMF, result.historyCDF, result.finalKC, 777, result.modeKC, result.median);
    const xs = data.map(d => d.x);

    assert.ok(xs.includes(777) && xs.includes(result.median));
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
});
