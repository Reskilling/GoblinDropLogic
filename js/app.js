/**
 * @file app.js
 * Entry point, and the DropLogic calculator: boss selection, boss settings and results.
 */

import { createMasterMatrix, createBarrowsMatrix } from './matrix.js';
import { BOSS_ITEMS } from './data.js';
import { getBossDefinition, groupBossesByCategory } from './bosses.js';
import { renderSettings, readSettings, cycleToggle, clampNumberInput, syncDisabledSettings } from './settings.js';
import { initItemGrid, renderItemGrid, getSelectedItems, setAllItems, lockItems } from './item-grid.js';
import { runSimulation, buildChartData } from './solvers.js';
import { renderChart } from './chart.js';
import { showToast } from './toast.js';
import { initNavigation } from './nav.js';
import { initChecklist } from './checklist.js';

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
    statChance: document.getElementById('stat-chance'),
    statChanceLabel: document.getElementById('stat-chance-label'),
    phraseMode: document.getElementById('phrase-mode'),
    phraseMedian: document.getElementById('phrase-median'),
    phraseMean: document.getElementById('phrase-mean'),
    phraseUser: document.getElementById('phrase-user'),
    chartCanvas: document.getElementById('distributionChart')
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

function handleBossSelection() {
    const key = DOM.bossSelect.value;
    DOM.kcInput.value = 0;

    if (!key) {
        activeBoss = null;
        DOM.bossPreview.classList.add('hidden');
        setResultsVisible(false);
        return;
    }

    activeBoss = { key, definition: getBossDefinition(key) };
    renderSettings(DOM.settings, activeBoss.definition.settings);
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
    refreshResults();
}

function bindSettingsEvents() {
    DOM.settings.addEventListener('click', (e) => {
        const button = e.target.closest('.setting-toggle');
        const setting = button && findSetting(button.dataset.setting);
        if (!setting) return;
        cycleToggle(button, setting);
        handleSettingsChanged();
    });
    DOM.settings.addEventListener('input', (e) => {
        if (!findSetting(e.target.dataset.setting)) return;
        clearTimeout(settingsInputTimer);
        settingsInputTimer = setTimeout(handleSettingsChanged, SETTINGS_INPUT_DELAY_MS);
    });
    DOM.settings.addEventListener('change', (e) => {
        const setting = findSetting(e.target.dataset.setting);
        if (!setting || setting.type !== 'number') return;
        clampNumberInput(e.target, setting);
        handleSettingsChanged();
    });
}

// ==========================================
// CALCULATION
// ==========================================

function updateKC(amount) {
    const current = parseInt(DOM.kcInput.value, 10) || 0;
    DOM.kcInput.value = Math.max(0, current + amount);
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

function handleCalculation({ scrollToResults = false } = {}) {
    const selectedItems = getSelectedItems();

    if (!selectedItems.length) {
        showToast('Select at least one item from the collection log.');
        return;
    }

    const currentKC = parseInt(DOM.kcInput.value, 10) || 0;
    const results = executeSimulation(selectedItems, currentKC);

    if (results) displayResults(results, currentKC, scrollToResults);
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

    if (validItems.length === 0) {
        showToast('With these settings, none of the selected items can drop.');
        return null;
    }

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

function displayResults(results, currentKC, scrollToResults) {
    setResultsVisible(true);
    DOM.resultsTitle.textContent = activeBoss.definition.name;

    // At 0 KC the chance is always 0%, so lead with the typical finish instead
    if (currentKC === 0) {
        DOM.statChance.textContent = `${results.median.toLocaleString()} KC`;
        DOM.statChanceLabel.textContent = 'Typical KC to finish';
    } else {
        DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
        DOM.statChanceLabel.textContent = `Chance you'd be done by ${currentKC.toLocaleString()} KC`;
    }
    DOM.resultsAnnouncer.textContent = `${activeBoss.definition.name}: ${DOM.statChanceLabel.textContent}, ${DOM.statChance.textContent}.`;
    DOM.resultPeek.querySelector('.peek-boss').textContent = activeBoss.definition.name;
    DOM.resultPeek.querySelector('.peek-value').textContent = DOM.statChance.textContent;
    DOM.resultPeek.querySelector('.peek-label').textContent = DOM.statChanceLabel.textContent;

    DOM.phraseMode.innerHTML = statRowHtml('Mode', 'Most likely single KC to finish on', results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = statRowHtml('Median', 'Half of players finish at or before', results.median.toLocaleString());
    DOM.phraseMean.innerHTML = statRowHtml('Mean', 'Expected KC, pulled up by unlucky players', Math.round(results.mean).toLocaleString());
    DOM.phraseUser.innerHTML = statRowHtml('Current', 'Your current progress in the log', currentKC.toLocaleString());

    if (!renderChart(DOM.chartCanvas, results.curveData, results, currentKC)) {
        showToast("The chart couldn't load. The numbers below are still correct.");
    }

    if (scrollToResults) DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
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
    DOM.kcResetBtn.addEventListener('click', () => {
        DOM.kcInput.value = 0;
        refreshResults();
    });

    DOM.selectAllBtn.addEventListener('click', () => setAllItems(true));
    DOM.selectNoneBtn.addEventListener('click', () => setAllItems(false));
    DOM.calcBtn.addEventListener('click', () => handleCalculation({ scrollToResults: true }));
}

initItemGrid({
    gridElement: document.getElementById('item-grid'),
    captionElement: document.getElementById('item-caption'),
    onSelectionChange: refreshResults
});
populateBossSelect();
bindEvents();
initResultPeek();
initNavigation();
initChecklist();
