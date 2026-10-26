/**
 * @file app.js
 * Entry point, and the DropLogic calculator: boss selection, boss settings and results.
 */

import { createMasterMatrix, createBarrowsMatrix } from './matrix.js';
import { BOSS_ITEMS, getBossImagePath } from './data.js';
import { getBossDefinition, groupBossesByCategory, getPortraitId } from './bosses.js';
import { renderSettings, readSettings, clampNumberInput, syncDisabledSettings } from './settings.js';
import { initItemGrid, renderItemGrid, getSelectedItems, setAllItems, lockItems, getSelection, restoreSelection } from './item-grid.js';
import { runSimulation, buildChartData, KC_LIMIT } from './solvers.js';
import { renderChart, loadChartLibrary } from './chart.js';
import { showToast } from './toast.js';
import { initNavigation } from './nav.js';
import { initChecklist } from './checklist.js';
import { initCopyButtons } from './copy-code.js';

const MATRIX_BUILDERS = {
    master: (items, definition) => createMasterMatrix(items, definition.rolls),
    barrows: (items) => createBarrowsMatrix(items.length)
};

// Some bosses take ~100ms per calculation, so wait for a pause in typing
const SETTINGS_INPUT_DELAY_MS = 150;

let activeBoss = null; // { key, definition }
let simulationCache = { hash: null, rawResults: null };
let settingsInputTimer = null;

const DOM = {
    bossSelect: document.getElementById('boss-select'),
    bossPortrait: document.getElementById('boss-portrait'),
    bossImage: document.getElementById('boss-image'),
    bossPreview: document.getElementById('boss-preview'),
    settings: document.getElementById('boss-settings'),
    kcInput: document.getElementById('target-kc'),
    kcResetBtn: document.getElementById('kc-reset'),
    selectAllBtn: document.getElementById('select-all'),
    selectNoneBtn: document.getElementById('select-none'),
    calcBtn: document.getElementById('calculate-btn'),
    resultsSection: document.getElementById('results'),
    resultsTitle: document.getElementById('res-name'),
    resultsAnnouncer: document.getElementById('results-announcer'),
    resultPeek: document.getElementById('result-peek'),
    resultsMessage: document.getElementById('results-message'),
    statChance: document.getElementById('stat-chance'),
    statChanceLabel: document.getElementById('stat-chance-label'),
    phraseMode: document.getElementById('phrase-mode'),
    phraseMedian: document.getElementById('phrase-median'),
    phraseMean: document.getElementById('phrase-mean'),
    phraseUser: document.getElementById('phrase-user'),
    chartCanvas: document.getElementById('distributionChart'),
    milestones: document.getElementById('milestones')
};

// ==========================================
// BOSS SELECTION & SETTINGS
// ==========================================

function populateBossSelect() {
    const groups = groupBossesByCategory(Object.keys(BOSS_ITEMS)).map(([category, bosses]) =>
        `<optgroup label="${category}">${bosses.map(b => `<option value="${b.key}">${b.name}</option>`).join('')}</optgroup>`
    );
    DOM.bossSelect.innerHTML = '<option value="">Choose a boss…</option>' + groups.join('');
}

// The portrait fades in once its image has loaded, and stays hidden if it can't load.
// `portraitId` is a boss key, or a variant like "royal_titans-eldric" that follows a setting.
let shownPortraitId = null;

function showBossPortrait(portraitId) {
    if (portraitId === shownPortraitId) return;
    shownPortraitId = portraitId;
    DOM.bossPortrait.hidden = !portraitId;
    DOM.bossImage.classList.remove('is-loaded');
    if (portraitId) DOM.bossImage.src = getBossImagePath(portraitId);
}

function initBossPortrait() {
    DOM.bossImage.addEventListener('load', () => DOM.bossImage.classList.add('is-loaded'));
    DOM.bossImage.addEventListener('error', () => { DOM.bossPortrait.hidden = true; });
}

function handleBossSelection() {
    const key = DOM.bossSelect.value;
    DOM.kcInput.value = 0;

    if (!key) {
        showBossPortrait(null);
        activeBoss = null;
        DOM.bossPreview.classList.add('hidden');
        setResultsVisible(false);
        return;
    }

    loadChartLibrary(); // start the download now, so it's ready by the time Calculate is pressed
    activeBoss = { key, definition: getBossDefinition(key) };
    renderSettings(DOM.settings, activeBoss.definition.settings);
    showBossPortrait(getPortraitId(key, readBossState()));
    renderItemGrid(BOSS_ITEMS[key]);
    DOM.bossPreview.classList.remove('hidden');
    refreshResults();
}

// A blur after switching bosses can fire `change` for the previous boss's input, so match by key first
const findSetting = (key) => activeBoss?.definition.settings.find(s => s.key === key);
const readBossState = () => readSettings(DOM.settings, activeBoss.definition.settings);

function handleSettingsChanged() {
    clearTimeout(settingsInputTimer);
    const state = readBossState();
    syncDisabledSettings(DOM.settings, activeBoss.definition.settings, state);
    lockItems(activeBoss.definition.lockItems?.(state) ?? null);
    showBossPortrait(getPortraitId(activeBoss.key, state));
    refreshResults();
}

function bindSettingsEvents() {
    // Number fields recalculate after a pause in typing; toggles (radio groups) on `change` below
    DOM.settings.addEventListener('input', (e) => {
        if (findSetting(e.target.dataset.setting)?.type !== 'number') return;
        clearTimeout(settingsInputTimer);
        settingsInputTimer = setTimeout(handleSettingsChanged, SETTINGS_INPUT_DELAY_MS);
    });
    DOM.settings.addEventListener('change', (e) => {
        // A blur while switching bosses can fire `change` on the previous boss's removed input
        if (!e.target.isConnected) return;
        const setting = findSetting(e.target.dataset.setting);
        if (!setting) return;
        if (setting.type === 'number') clampNumberInput(e.target, setting);
        handleSettingsChanged();
    });
}

// ==========================================
// CALCULATION
// ==========================================

function updateKC(amount) {
    setKC(Math.max(0, readKC() + amount));
}

// Used by the KC buttons, which change the field without the user looking at it, so it briefly highlights
function setKC(kc) {
    DOM.kcInput.value = kc;
    DOM.kcInput.classList.remove('is-bumped');
    void DOM.kcInput.offsetWidth; // restart the highlight animation
    DOM.kcInput.classList.add('is-bumped');
    refreshResults();
}

// Once results are showing they follow every input, so the Calculate button is only needed before that
function setResultsVisible(isVisible) {
    DOM.resultsSection.classList.toggle('hidden', !isVisible);
    DOM.calcBtn.classList.toggle('hidden', isVisible);
    updateResultPeek();
}

// On narrow screens the results sit far below the inputs, so a bar shows the headline while
// it's scrolled out of view (CSS only displays the bar in the single-column layout)
let isResultHeadlineOnScreen = false;

function updateResultPeek() {
    // False while the results, the calculator section or the whole main view is hidden
    const areResultsRendered = DOM.resultsSection.getClientRects().length > 0;
    const shouldShow = areResultsRendered && !isResultHeadlineOnScreen;

    DOM.resultPeek.hidden = !shouldShow;
    document.body.classList.toggle('has-result-peek', shouldShow);
}

function initResultPeek() {
    new IntersectionObserver(([entry]) => {
        isResultHeadlineOnScreen = entry.isIntersecting;
        updateResultPeek();
    }).observe(DOM.resultsSection.querySelector('.result-header'));

    DOM.resultPeek.addEventListener('click', () => DOM.resultsSection.scrollIntoView({ behavior: 'smooth' }));

    // Leaving the calculator doesn't change whether an already off-screen headline intersects
    document.addEventListener('sectionchange', updateResultPeek);
}

// Keeps an already-visible chart in sync with the inputs; does nothing before the first calculation
function refreshResults() {
    if (DOM.resultsSection.classList.contains('hidden')) return;

    if (getSelectedItems().length === 0) {
        setResultsVisible(false);
    } else {
        handleCalculation();
    }
}

// Whole kills only, never negative; number inputs also accept forms like "1e3"
function readKC() {
    const kc = Math.floor(Number(DOM.kcInput.value));
    return Number.isFinite(kc) && kc > 0 ? kc : 0;
}

function handleCalculation({ scrollToResults = false } = {}) {
    const selectedItems = getSelectedItems();

    if (!selectedItems.length) {
        showToast('Select at least one item from the collection log.');
        return;
    }

    const currentKC = readKC();
    const results = executeSimulation(selectedItems, currentKC);

    if (results) displayResults(results, currentKC);
    else displayImpossible();

    if (scrollToResults) DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function generateStateHash(bossKey, items) {
    return JSON.stringify({
        bossKey,
        items: items.map(i => `${i.name}|${i.rate}|${i.pieces}|${i.pool}|${i.type}`).sort()
    });
}

function executeSimulation(selectedItems, currentKC) {
    const { key, definition } = activeBoss;
    const adjustedItems = definition.adjust ? definition.adjust(selectedItems, readBossState()) : selectedItems;
    const validItems = adjustedItems.filter(item => item.rate > 0);

    if (validItems.length === 0) return null;

    const hash = generateStateHash(key, validItems);
    if (simulationCache.hash !== hash) {
        const matrix = MATRIX_BUILDERS[definition.matrix](validItems, definition);
        simulationCache = { hash, rawResults: runSimulation(matrix) };
    }

    const { rawResults } = simulationCache;
    const targetP = rawResults.historyCDF[currentKC] ?? (currentKC >= rawResults.finalKC ? 1 : 0);
    const curveData = buildChartData(rawResults.historyPMF, rawResults.historyCDF, rawResults.finalKC, currentKC, rawResults.modeKC, rawResults.median);

    return { ...rawResults, targetP, curveData };
}

const statRowHtml = (label, description, value) =>
    `<span class="stat-label">${label}</span> <span class="stat-desc">${description}</span> ` +
    `<b class="stat-value">${value} <span class="stat-unit">KC</span></b>`;

const COUNT_UP_MS = 700;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let countUpFrame = 0;

/** Counts the headline up from zero with an expo-out curve, then settles on the exact text. */
function countUp(element, { to, format }, finalText) {
    if (prefersReducedMotion.matches) {
        element.textContent = finalText;
        return;
    }

    const start = performance.now();
    const step = (now) => {
        const t = Math.min((now - start) / COUNT_UP_MS, 1);
        element.textContent = t < 1 ? format(to * (1 - Math.pow(2, -10 * t))) : finalText;
        if (t < 1) countUpFrame = requestAnimationFrame(step);
    };
    step(start);
}

/**
 * Shows the headline everywhere it appears: the card, the phone bar and the screen-reader announcement.
 * Pass `count` ({ to, format }) to count the card's number up; only the first reveal does, not live updates.
 */
function setHeadline(value, label, count = null) {
    const bossName = activeBoss.definition.name;

    DOM.resultsTitle.textContent = bossName;
    cancelAnimationFrame(countUpFrame);
    if (count) countUp(DOM.statChance, count, value);
    else DOM.statChance.textContent = value;
    DOM.statChanceLabel.textContent = label;
    DOM.resultsAnnouncer.textContent = `${bossName}: ${label}, ${value}.`;
    DOM.resultPeek.querySelector('.peek-boss').textContent = bossName;
    DOM.resultPeek.querySelector('.peek-value').textContent = value;
    DOM.resultPeek.querySelector('.peek-label').textContent = label;
}

// Two decimals would show a slim but real chance as "0.00%", and a near-certainty as "100.00%"
function formatChance(percent) {
    if (percent > 0 && percent < 0.01) return '<0.01%';
    if (percent > 99.99 && percent < 100) return '>99.99%';
    return `${percent.toFixed(2)}%`;
}

/** Replaces the chart and stats with an explanation when they would be meaningless, or restores them. */
function setResultsMessage(message) {
    DOM.resultsMessage.textContent = message ?? '';
    DOM.resultsMessage.hidden = !message;
    DOM.resultsSection.classList.toggle('is-message', Boolean(message));
}

function displayImpossible() {
    setResultsVisible(true);
    setHeadline('—', 'None of these items can drop');
    setResultsMessage('With these settings, none of the selected items can drop. Change a setting or pick different items.');
}

function displayResults(results, currentKC) {
    const isFirstReveal = DOM.resultsSection.classList.contains('hidden');
    setResultsVisible(true);
    const limit = KC_LIMIT.toLocaleString();

    if (results.reachedLimit && results.median === 0) {
        setHeadline(`${limit}+ KC`, 'Typical KC to finish');
        setResultsMessage(`Too unlikely to chart: more than half of players still wouldn't be finished after ${limit} kills.`);
        return;
    }
    if (results.historyCDF[1] > 1 - 1e-9) {
        setHeadline('1 KC', 'Guaranteed on your first kill');
        setResultsMessage('Every selected item is guaranteed on your first kill or completion.');
        return;
    }
    setResultsMessage(null);

    // At 0 KC the chance is always 0%, so lead with the typical finish instead
    if (currentKC === 0) {
        const count = isFirstReveal ? { to: results.median, format: n => `${Math.round(n).toLocaleString()} KC` } : null;
        setHeadline(`${results.median.toLocaleString()} KC`, 'Typical KC to finish', count);
    } else {
        const percent = results.targetP * 100;
        const value = formatChance(percent);
        // A capped value like "<0.01%" has nothing meaningful to count through
        const count = isFirstReveal && !/^[<>]/.test(value) ? { to: percent, format: n => `${n.toFixed(2)}%` } : null;
        setHeadline(value, `Chance you'd be done by ${currentKC.toLocaleString()} KC`, count);
    }

    // Past the KC limit the mean only counts unfinished players at the limit, so it's a lower bound
    const mean = `${Math.round(results.mean).toLocaleString()}${results.reachedLimit ? '+' : ''}`;

    DOM.phraseMode.innerHTML = statRowHtml('Mode', 'Most likely single KC to finish on', results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = statRowHtml('Median', 'Half of players finish at or before', results.median.toLocaleString());
    DOM.phraseMean.innerHTML = statRowHtml('Mean', 'Expected KC, pulled up by unlucky players', mean);
    DOM.phraseUser.innerHTML = statRowHtml('Current', 'Your current progress in the log', currentKC.toLocaleString());
    renderMilestones(results);

    loadChartLibrary().then(isLoaded => {
        if (!isLoaded || !renderChart(DOM.chartCanvas, results.curveData, results, currentKC)) {
            showToast("The chart couldn't load. The numbers below are still correct.");
        }
    });
}

const MILESTONES = [0.25, 0.5, 0.75, 0.9, 0.99];

/** "Players finished by": the KC by which each share of players is done; the chart's answer as text. */
function renderMilestones({ historyCDF }) {
    const limit = `${KC_LIMIT.toLocaleString()}+`;
    DOM.milestones.innerHTML = MILESTONES.map(share => {
        const kc = historyCDF.findIndex(p => p >= share);
        return `<div class="milestone"><dt>${share * 100}%</dt><dd>${kc === -1 ? limit : kc.toLocaleString()}</dd></div>`;
    }).join('');
}

// Clearing also hides the results, so it offers an Undo that brings both back
function clearSelection() {
    if (!getSelectedItems().length) return;

    const selection = getSelection();
    const hadResults = !DOM.resultsSection.classList.contains('hidden');
    setAllItems(false);
    showToast('Selection cleared.', {
        tone: 'info',
        action: {
            label: 'Undo',
            onClick: () => {
                // Refused when the grid was rebuilt or re-locked since, e.g. by a boss switch or a sacrifice setting
                if (!restoreSelection(selection)) {
                    showToast("Can't undo: the boss or its settings changed since you cleared.", { tone: 'info' });
                    return;
                }
                if (hadResults) handleCalculation();
            }
        }
    });
}

// ==========================================
// INIT
// ==========================================

function bindEvents() {
    DOM.bossSelect.addEventListener('change', handleBossSelection);
    bindSettingsEvents();

    document.querySelectorAll('.kc-btn[data-add]').forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });
    DOM.kcInput.addEventListener('input', refreshResults);
    DOM.kcInput.addEventListener('change', () => { DOM.kcInput.value = readKC(); });
    DOM.kcResetBtn.addEventListener('click', () => setKC(0));

    DOM.selectAllBtn.addEventListener('click', () => setAllItems(true));
    DOM.selectNoneBtn.addEventListener('click', clearSelection);
    DOM.calcBtn.addEventListener('click', () => handleCalculation({ scrollToResults: true }));
}

initItemGrid({
    gridElement: document.getElementById('item-grid'),
    captionElement: document.getElementById('item-caption'),
    onSelectionChange: refreshResults
});
populateBossSelect();
initBossPortrait();
bindEvents();
initResultPeek();
initNavigation();
initChecklist();
initCopyButtons();
