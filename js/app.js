/**
 * @file app.js
 * Entry point, and the DropLogic calculator: boss selection, the item grid, boss settings and results.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_ITEMS, getItemImagePath, getItemWikiImageUrl } from './data.js';
import { getBossDefinition, groupBossesByCategory } from './bosses.js';
import { renderSettings, readSettings, cycleToggle, clampNumberInput, syncDisabledSettings } from './settings.js';
import { runSimulation, buildChartData } from './solvers.js';
import { renderChart } from './chart.js';
import { showToast } from './toast.js';
import { initNavigation } from './nav.js';
import { initChecklist } from './checklist.js';

const MATRIX_BUILDERS = {
    master: (items, definition) => createMasterMatrix(items, definition.rolls),
    moons: (items) => createMoonsMatrix(items),
    barrows: (items) => createBarrowsMatrix(items.length)
};

let activeBoss = null; // { key, definition }
let itemsLocked = false;
let simulationCache = { hash: null, rawResults: null };

const DOM = {
    bossSelect: document.getElementById('boss-select'),
    bossPreview: document.getElementById('boss-preview'),
    settings: document.getElementById('boss-settings'),
    itemGrid: document.getElementById('item-grid'),
    itemCaption: document.getElementById('item-caption'),
    kcInput: document.getElementById('target-kc'),
    kcResetBtn: document.getElementById('kc-reset'),
    selectAllBtn: document.getElementById('select-all'),
    selectNoneBtn: document.getElementById('select-none'),
    calcBtn: document.getElementById('calculate-btn'),
    resultsSection: document.getElementById('results'),
    resultsTitle: document.getElementById('res-name'),
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
    itemsLocked = false;

    if (!key) {
        activeBoss = null;
        DOM.bossPreview.classList.add('hidden');
        DOM.resultsSection.classList.add('hidden');
        return;
    }

    activeBoss = { key, definition: getBossDefinition(key) };
    renderSettings(DOM.settings, activeBoss.definition.settings);
    renderItemGrid(BOSS_ITEMS[key]);
    DOM.bossPreview.classList.remove('hidden');
    refreshResults();
}

const findSetting = (key) => activeBoss?.definition.settings.find(s => s.key === key);
const readBossState = () => readSettings(DOM.settings, activeBoss.definition.settings);

function handleSettingsChanged() {
    const state = readBossState();
    syncDisabledSettings(DOM.settings, activeBoss.definition.settings, state);
    applyItemLock(activeBoss.definition.lockItems?.(state) ?? null);
    refreshResults();
}

// A blur after switching bosses can fire `change` for the previous boss's input, so match by key first
function bindSettingsEvents() {
    DOM.settings.addEventListener('click', (e) => {
        const button = e.target.closest('.setting-toggle');
        const setting = button && findSetting(button.dataset.setting);
        if (!setting) return;
        cycleToggle(button, setting);
        handleSettingsChanged();
    });
    DOM.settings.addEventListener('input', (e) => {
        if (findSetting(e.target.dataset.setting)) handleSettingsChanged();
    });
    DOM.settings.addEventListener('change', (e) => {
        const setting = findSetting(e.target.dataset.setting);
        if (!setting || setting.type !== 'number') return;
        clampNumberInput(e.target, setting);
        handleSettingsChanged();
    });
}

// ==========================================
// ITEM GRID
// ==========================================

function itemTileHtml(item) {
    const maxPieces = item.pieces || 1;
    const startPieces = item.defaultPieces ?? maxPieces;
    const badge = maxPieces > 1 ? `<span class="item-badge" aria-hidden="true">${startPieces}/${maxPieces}</span>` : '';

    return `
        <button type="button" class="item-box selected" aria-pressed="true" title="${item.name}"
            data-name="${item.name}" data-rate="${item.rate}" data-type="${item.type}" data-pool="${item.pool || ''}"
            data-max-pieces="${maxPieces}" data-default-pieces="${startPieces}" data-selected-pieces="${startPieces}">
            <img src="${getItemImagePath(item.name)}" data-fallback="${getItemWikiImageUrl(item.name)}" alt="">
            ${badge}
        </button>`;
}

function renderItemGrid(items) {
    DOM.itemGrid.innerHTML = items
        .filter(item => !item.hidden)
        .sort((a, b) => a.order - b.order)
        .map(itemTileHtml)
        .join('');

    DOM.itemGrid.querySelectorAll('.item-box').forEach(updateTileLabel);
    showDefaultCaption();
}

// Swap a missing local icon for the wiki's copy, once
function handleIconError(e) {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.fallback) return;
    img.src = img.dataset.fallback;
    delete img.dataset.fallback;
}

function setTilePieces(box, pieces) {
    box.dataset.selectedPieces = pieces;
    const badge = box.querySelector('.item-badge');
    if (badge) badge.textContent = `${pieces}/${box.dataset.maxPieces}`;
}

function updateTileLabel(box) {
    const isSelected = box.classList.contains('selected');
    const max = Number(box.dataset.maxPieces);
    const count = max > 1 && isSelected ? `, need ${box.dataset.selectedPieces} of ${max}` : '';

    box.setAttribute('aria-pressed', String(isSelected));
    box.setAttribute('aria-label', `${box.dataset.name}${count}`);
}

function describeTile(box) {
    const name = box.dataset.name;
    const max = Number(box.dataset.maxPieces);
    const pieces = Number(box.dataset.selectedPieces);

    if (box.disabled) return `${name}: not available with the current settings.`;
    if (!box.classList.contains('selected')) return `${name}: not counted. Tap to include it.`;
    if (max === 1) return `${name}: counted. Tap to leave it out.`;
    return pieces > 1
        ? `${name}: need ${pieces} of ${max}. Tap to need ${pieces - 1}.`
        : `${name}: need 1 of ${max}. Tap to leave it out, then again to need all ${max}.`;
}

function showDefaultCaption() {
    const tiles = DOM.itemGrid.querySelectorAll('.item-box');
    const counted = DOM.itemGrid.querySelectorAll('.item-box.selected').length;
    DOM.itemCaption.textContent = `${counted} of ${tiles.length} items counted. Hover or tap an item to see what it is.`;
}

// Multi-piece tiles step down N/N -> ... -> 1/N -> off -> N/N
function toggleItemSelection(e) {
    const box = e.target.closest('.item-box');
    if (!box || box.disabled) return;

    const maxPieces = Number(box.dataset.maxPieces) || 1;

    if (!box.classList.contains('selected')) {
        box.classList.add('selected');
        setTilePieces(box, maxPieces);
    } else if (maxPieces > 1 && Number(box.dataset.selectedPieces) > 1) {
        setTilePieces(box, Number(box.dataset.selectedPieces) - 1);
    } else {
        box.classList.remove('selected');
    }

    updateTileLabel(box);
    DOM.itemCaption.textContent = describeTile(box);
    refreshResults();
}

function setAllItemsSelection(select) {
    DOM.itemGrid.querySelectorAll('.item-box:not(:disabled)').forEach(box => {
        box.classList.toggle('selected', select);
        if (select) setTilePieces(box, Number(box.dataset.defaultPieces));
        updateTileLabel(box);
    });

    showDefaultCaption();
    refreshResults();
}

function applyItemLock(allowedNames) {
    const shouldLock = allowedNames !== null;
    if (shouldLock === itemsLocked) return;
    itemsLocked = shouldLock;

    DOM.itemGrid.querySelectorAll('.item-box').forEach(box => {
        if (shouldLock) {
            box.dataset.wasSelected = box.classList.contains('selected');
            const isAllowed = allowedNames.includes(box.dataset.name);
            box.classList.toggle('selected', isAllowed);
            box.disabled = !isAllowed;
        } else {
            box.classList.toggle('selected', box.dataset.wasSelected === 'true');
            delete box.dataset.wasSelected;
            box.disabled = false;
        }
        updateTileLabel(box);
    });

    showDefaultCaption();
}

function getSelectedItems() {
    return Array.from(DOM.itemGrid.querySelectorAll('.item-box.selected'), box => ({
        name: box.dataset.name,
        rate: parseFloat(box.dataset.rate),
        type: box.dataset.type,
        pieces: Number(box.dataset.selectedPieces) || 1,
        pool: box.dataset.pool
    }));
}

// ==========================================
// CALCULATION
// ==========================================

function updateKC(amount) {
    const current = parseInt(DOM.kcInput.value, 10) || 0;
    DOM.kcInput.value = Math.max(0, current + amount);
    refreshResults();
}

// Keeps an already-visible chart in sync with the inputs; does nothing before the first calculation
function refreshResults() {
    if (DOM.resultsSection.classList.contains('hidden')) return;

    if (getSelectedItems().length === 0) {
        DOM.resultsSection.classList.add('hidden');
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
    DOM.resultsSection.classList.remove('hidden');
    DOM.resultsTitle.textContent = activeBoss.definition.name;

    // At 0 KC the chance is always 0%, so lead with the typical finish instead
    if (currentKC === 0) {
        DOM.statChance.textContent = `${results.median.toLocaleString()} KC`;
        DOM.statChanceLabel.textContent = 'Typical KC to finish';
    } else {
        DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
        DOM.statChanceLabel.textContent = `Chance you'd be done by ${currentKC.toLocaleString()} KC`;
    }

    DOM.phraseMode.innerHTML = statRowHtml('Mode', 'Most likely single KC to finish on', results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = statRowHtml('Median', 'Half of players finish at or before', results.median.toLocaleString());
    DOM.phraseMean.innerHTML = statRowHtml('Mean', 'Expected KC, pulled up by unlucky players', Math.round(results.mean).toLocaleString());
    DOM.phraseUser.innerHTML = statRowHtml('Current', 'Your current progress in the log', currentKC.toLocaleString());

    renderChart(DOM.chartCanvas, results.curveData, results, currentKC);

    if (scrollToResults) DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// INIT
// ==========================================

function bindEvents() {
    DOM.bossSelect.addEventListener('change', handleBossSelection);
    bindSettingsEvents();

    DOM.itemGrid.addEventListener('click', toggleItemSelection);
    DOM.itemGrid.addEventListener('error', handleIconError, true);
    DOM.itemGrid.addEventListener('pointerover', (e) => {
        const box = e.target.closest('.item-box');
        if (box) DOM.itemCaption.textContent = describeTile(box);
    });
    DOM.itemGrid.addEventListener('focusin', (e) => {
        const box = e.target.closest('.item-box');
        if (box) DOM.itemCaption.textContent = describeTile(box);
    });
    DOM.itemGrid.addEventListener('pointerleave', showDefaultCaption);
    DOM.itemGrid.addEventListener('focusout', (e) => {
        if (!DOM.itemGrid.contains(e.relatedTarget)) showDefaultCaption();
    });

    document.querySelectorAll('.kc-btn[data-add]').forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });
    DOM.kcInput.addEventListener('input', refreshResults);
    DOM.kcResetBtn.addEventListener('click', () => {
        DOM.kcInput.value = 0;
        refreshResults();
    });

    DOM.selectAllBtn.addEventListener('click', () => setAllItemsSelection(true));
    DOM.selectNoneBtn.addEventListener('click', () => setAllItemsSelection(false));
    DOM.calcBtn.addEventListener('click', () => handleCalculation({ scrollToResults: true }));
}

populateBossSelect();
bindEvents();
initNavigation();
initChecklist();
