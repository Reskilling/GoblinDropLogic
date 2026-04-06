/**
 * @file app.js
 * Main UI Controller for DropLogic.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation, buildChartData } from './solvers.js';

const CHART_FONT = "'Inter', sans-serif";
const CHART_TEXT_COLOR = '#a8a29e';
const COLORS = { mode: '#ef4444', progress: '#3b82f6', mean: '#f97316', user: '#22c55e' };
const X_AXIS_POWER = 0.4;
const DT2_BOSSES = ['vardorvis', 'duke_sucellus', 'the_whisperer', 'the_leviathan'];

let activeBossKey = "";
let chartInstance = null;

const DOM = {
    bossSelect: document.getElementById("boss-select"),
    itemGrid: document.getElementById("item-grid"),
    kcInput: document.getElementById("target-kc"),
    bossPreview: document.getElementById("boss-preview"),
    resultsSection: document.getElementById("results"),
    statChance: document.getElementById("stat-chance"),
    phraseMode: document.getElementById("phrase-mode"),
    phraseMedian: document.getElementById("phrase-median"),
    phraseMean: document.getElementById("phrase-mean"),
    phraseUser: document.getElementById("phrase-user"),
    chartCanvas: document.getElementById('distributionChart'),
    kcResetBtn: document.getElementById("kc-reset"),
    selectAllBtn: document.getElementById("select-all"),
    selectNoneBtn: document.getElementById("select-none"),
    calcBtn: document.getElementById("calculate-btn"),
    mobileBtn: document.getElementById('mobile-sections-btn'),
    mobileMenu: document.getElementById('mobile-dropdown')
};

// ==========================================
// SIMULATION CACHE
// ==========================================
let activeSimulationCache = {
    hash: null,
    rawResults: null
};

function generateStateHash(bossKey, items, state) {
    return JSON.stringify({
        bossKey,
        state,
        items: items.map(i => `${i.name}|${i.rate}|${i.pieces}|${i.pool}`).sort()
    });
}

function initApp() {
    setupChartDefaults();
    populateBossSelect();
    bindEvents();
    initGoalTracking();
}

function setupChartDefaults() {
    Chart.defaults.font.family = CHART_FONT;
    Chart.defaults.color = CHART_TEXT_COLOR;
}

function populateBossSelect() {
    const defaultOption = '<option value="">Select Boss Intel...</option>';
    const bossOptions = Object.keys(BOSS_CONFIG)
        .sort()
        .map(key => `<option value="${key}">${formatBossName(key)}</option>`)
        .join('');
    DOM.bossSelect.innerHTML = defaultOption + bossOptions;
}

// --- DYNAMIC UI INJECTOR ---
const BOSS_UI_INJECTORS = {
    'chambers_of_xeric': (container) => {
        container.innerHTML = `<div class="input-group"><label>Average Team Points</label><input type="number" id="raid-cox-pts" value="30000" min="0"></div>`;
    },
    'theatre_of_blood': (container) => {
        container.innerHTML = `<div class="input-row" style="margin-bottom: 0;"><div class="input-group"><label>Team Size</label><input type="number" id="raid-tob-size" value="3" min="1" max="5"></div><div class="input-group"><label>Team Deaths</label><input type="number" id="raid-tob-deaths" value="0" min="0"></div></div>`;
    },
    'tombs_of_amascut': (container) => {
        container.innerHTML = `<div class="input-row" style="margin-bottom: 0;"><div class="input-group"><label>Raid Level</label><input type="number" id="raid-toa-level" value="150" min="0"></div><div class="input-group"><label>Team Points</label><input type="number" id="raid-toa-pts" value="15000" min="0"></div></div>`;
    },
    'doom_of_mokhaiotl': (container) => {
        container.innerHTML = `<div class="input-group"><label>Delve Level (Max 15)</label><input type="number" id="doom-delve-level" value="9" min="2" max="15"></div>`;
        document.getElementById('doom-delve-level').addEventListener('change', (e) => {
            let val = parseInt(e.target.value, 10);
            e.target.value = isNaN(val) || val < 2 ? 2 : Math.min(val, 15);
        });
    },
    'fortis_colosseum': (container) => {
        container.innerHTML = `<button type="button" id="colo-sacrifice-btn" value="false" class="unified-btn" style="width:100%; margin-top:8px;">Keep Quivers (Standard)</button>`;
        document.getElementById('colo-sacrifice-btn').addEventListener('click', function() {
            const isSacrificing = this.value === 'true';
            this.value = isSacrificing ? 'false' : 'true';
            this.innerText = isSacrificing ? 'Keep Quivers (Standard)' : 'Sacrifice Quivers for Pet Chance';
            this.style.borderColor = isSacrificing ? 'var(--border)' : 'var(--accent-orange)';
            this.style.color = isSacrificing ? 'var(--text)' : 'var(--accent-orange)';
        });
    },
    'the_nightmare': (container) => {
        container.innerHTML = `<div class="input-row" style="margin-bottom: 0;"><div class="input-group"><button type="button" id="nightmare-variant-btn" value="standard" class="unified-btn" style="width:100%; padding:14px;">Standard Mode</button></div><div class="input-group"><label>Team Size</label><input type="number" id="nightmare-team-size" value="5" min="1" max="80"></div></div>`;
        document.getElementById('nightmare-variant-btn').addEventListener('click', function() {
            const isPhosani = this.value === 'phosani';
            const teamInput = document.getElementById('nightmare-team-size');
            if (isPhosani) {
                this.value = 'standard'; this.innerText = 'Standard Mode'; teamInput.disabled = false;
            } else {
                this.value = 'phosani'; this.innerText = "Phosani's Variant"; teamInput.value = 1; teamInput.disabled = true;
            }
        });
    },
    'yama': (container) => {
        container.innerHTML = `<div class="input-group"><label>Contribution %</label><input type="number" id="yama-contribution" value="100" min="0" max="100"></div>`;
    },
    'tempoross': (container) => {
        container.innerHTML = `<div class="input-group"><label>Points per Game</label><input type="number" id="tempoross-points" value="4000" min="0"></div>`;
    },
    'wintertodt': (container) => {
        container.innerHTML = `<div class="input-group"><label>Points per Game</label><input type="number" id="wintertodt-points" value="750" min="500"></div>`;
    },
    'zalcano': (container) => {
        container.innerHTML = `<div class="input-group"><label>Contribution %</label><input type="number" id="zalcano-contribution" value="100" min="0" max="100"></div>`;
    },
    'royal_titans': (container) => {
        container.innerHTML = `<div class="input-row" style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"><button type="button" id="titan-target-btn" value="branda" class="unified-btn" style="border-color:#ef4444; color:#ef4444;">Target: Branda</button><button type="button" id="titan-action-btn" value="loot" class="unified-btn">Loot: Standard</button></div><div class="input-group"><label>Contribution %</label><input type="number" id="titan-contribution" value="100" min="0" max="100"></div>`;
        document.getElementById('titan-target-btn').addEventListener('click', function() {
            this.value = this.value === 'branda' ? 'eldric' : 'branda';
            this.innerText = this.value === 'branda' ? 'Target: Branda' : 'Target: Eldric';
            this.style.borderColor = this.style.color = (this.value === 'branda' ? '#ef4444' : '#3b82f6');
        });
        document.getElementById('titan-action-btn').addEventListener('click', function() {
            this.value = this.value === 'loot' ? 'sacrifice' : 'loot';
            this.innerText = this.value === 'loot' ? 'Loot: Standard' : 'Loot: Sacrifice';
            if (this.value === 'sacrifice') forceItemSelection(["Bran"]); else unlockItemSelection();
        });
    },
    'araxxor': (container) => {
        container.innerHTML = `<button type="button" id="araxxor-sacrifice-btn" value="false" class="unified-btn" style="width:100%; margin-bottom:12px;">Loot Egg Sac (Standard)</button>`;
        document.getElementById('araxxor-sacrifice-btn').addEventListener('click', function() {
            const newState = this.value === 'false'; this.value = newState ? 'true' : 'false';
            if (newState) { this.innerText = 'Smash Egg Sac (2x Pet)'; forceItemSelection(["Nid"]); } else { this.innerText = 'Loot Egg Sac (Standard)'; unlockItemSelection(); }
        });
    }
};

DT2_BOSSES.forEach(boss => {
    BOSS_UI_INJECTORS[boss] = (container) => {
        container.innerHTML = `<button type="button" id="dt2-awakened-btn" value="false" class="unified-btn" style="width:100%; margin-top:8px;">Standard Variant</button>`;
        document.getElementById('dt2-awakened-btn').addEventListener('click', function() {
            const active = this.value === 'false'; this.value = active ? 'true' : 'false';
            this.innerText = active ? 'Awakened Variant (3x Uniques)' : 'Standard Variant';
        });
    };
});

function renderDynamicSettings(bossKey) {
    let container = document.getElementById('dynamic-raid-settings') || document.createElement('div');
    if (!container.id) { container.id = 'dynamic-raid-settings'; container.style.marginBottom = '24px'; DOM.bossPreview.insertBefore(container, document.querySelector('.collection-header')); }
    const injector = BOSS_UI_INJECTORS[bossKey];
    if (injector) injector(container); else container.innerHTML = ''; 
}

function bindEvents() {
    if (DOM.bossSelect) DOM.bossSelect.addEventListener('change', handleBossSelection);
    if (DOM.itemGrid) DOM.itemGrid.addEventListener('click', toggleItemSelection);
    
    // Quick Add KC buttons silently update the chart (skipScroll = true)
    document.querySelectorAll(".kc-btn[data-add]").forEach(btn => btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10))));
    
    // Reset KC silently updates
    if (DOM.kcResetBtn) DOM.kcResetBtn.addEventListener('click', () => { if (DOM.kcInput) DOM.kcInput.value = 0; handleCalculation(true); });
    
    // Typing in the KC box silently updates
    if (DOM.kcInput) DOM.kcInput.addEventListener('input', () => handleCalculation(true));
    
    // Changing items silently updates
    if (DOM.selectAllBtn) DOM.selectAllBtn.addEventListener('click', (e) => { e.preventDefault(); setAllItemsSelection(true); });
    if (DOM.selectNoneBtn) DOM.selectNoneBtn.addEventListener('click', (e) => { e.preventDefault(); setAllItemsSelection(false); });
    
    // The main Simulate Grind button is the ONLY one that forces a scroll down (skipScroll = false)
    if (DOM.calcBtn) DOM.calcBtn.addEventListener('click', () => handleCalculation(false));
    
    if (DOM.mobileBtn && DOM.mobileMenu) { 
        DOM.mobileBtn.addEventListener('click', (e) => { e.stopPropagation(); DOM.mobileMenu.classList.toggle('hidden'); }); 
        document.addEventListener('click', () => { DOM.mobileMenu.classList.add('hidden'); }); 
    }
}

function setupGoalCard(card) {
    const wrapper = card.querySelector('.check-all-wrapper'), checkAllBox = card.querySelector('.check-all-box'), goalCheckboxes = card.querySelectorAll('.goal-item input[type="checkbox"]');
    if (!wrapper || !checkAllBox || goalCheckboxes.length === 0) return;
    const getStorageKey = (name) => `goal-${name.trim().replace(/\s+/g, '-')}`;
    const updateMasterVisuals = () => {
        const checkedCount = card.querySelectorAll('.goal-item input[type=\"checkbox\"]:checked').length;
        wrapper.classList.remove('is-checked', 'is-indeterminate');
        checkAllBox.checked = checkedCount === goalCheckboxes.length;
        checkAllBox.indeterminate = checkedCount > 0 && checkedCount < goalCheckboxes.length;
        if (checkAllBox.checked) wrapper.classList.add('is-checked'); else if (checkAllBox.indeterminate) wrapper.classList.add('is-indeterminate');
    };
    goalCheckboxes.forEach(cb => {
        const nameEl = cb.closest('.goal-item').querySelector('.goal-name');
        if (!nameEl) return;
        const saveKey = getStorageKey(nameEl.textContent);
        cb.checked = localStorage.getItem(saveKey) === 'true';
        cb.addEventListener('change', () => { localStorage.setItem(saveKey, cb.checked); updateMasterVisuals(); });
    });
    checkAllBox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        goalCheckboxes.forEach(cb => { cb.checked = isChecked; const nameEl = cb.closest('.goal-item').querySelector('.goal-name'); if (nameEl) localStorage.setItem(getStorageKey(nameEl.textContent), isChecked); });
        updateMasterVisuals();
    });
    updateMasterVisuals();
}

function initGoalTracking() { document.querySelectorAll('#ironman-goals .card').forEach(setupGoalCard); }

function handleBossSelection(e) {
    activeBossKey = e.target.value;
    if (!activeBossKey) { DOM.bossPreview.classList.add("hidden"); return; }
    renderItemGrid(BOSS_CONFIG[activeBossKey].items);
    renderDynamicSettings(activeBossKey);
    DOM.bossPreview.classList.remove("hidden");
    
    // Automatically render the chart for a new boss, but don't yank the camera down
    handleCalculation(true);
}

function updateKC(amount) { 
    const currentVal = parseInt(DOM.kcInput.value || '0', 10);
    DOM.kcInput.value = Math.max(0, currentVal + amount); 
    handleCalculation(true); // skipScroll = true
}

function toggleItemSelection(e) { 
    const box = e.target.closest(".item-box"); 
    if (!box || isSacrificeModeActive()) return;
    box.classList.toggle("selected"); 
    handleCalculation(true); // skipScroll = true
}

function setAllItemsSelection(select) { 
    if (isSacrificeModeActive()) return;
    const action = select ? 'add' : 'remove'; 
    DOM.itemGrid.querySelectorAll(".item-box").forEach(b => b.classList[action]("selected")); 
    handleCalculation(true); // skipScroll = true
}

function isSacrificeModeActive() {
    return (document.getElementById('araxxor-sacrifice-btn')?.value === 'true') || (document.getElementById('titan-action-btn')?.value === 'sacrifice');
}

const STATE_EXTRACTORS = {
    'chambers_of_xeric': () => ({ pts: parseInt(document.getElementById('raid-cox-pts')?.value || '30000', 10) }),
    'theatre_of_blood': () => ({ size: parseInt(document.getElementById('raid-tob-size')?.value || '3', 10), deaths: parseInt(document.getElementById('raid-tob-deaths')?.value || '0', 10) }),
    'tombs_of_amascut': () => ({ level: parseInt(document.getElementById('raid-toa-level')?.value || '150', 10), pts: parseInt(document.getElementById('raid-toa-pts')?.value || '15000', 10) }),
    'doom_of_mokhaiotl': () => ({ level: parseInt(document.getElementById('doom-delve-level')?.value || '9', 10) }),
    'fortis_colosseum': () => ({ isSacrificing: document.getElementById('colo-sacrifice-btn')?.value === 'true' }),
    'the_nightmare': () => ({ variant: document.getElementById('nightmare-variant-btn')?.value || 'standard', teamSize: parseInt(document.getElementById('nightmare-team-size')?.value || '5', 10) }),
    'yama': () => ({ contrib: parseInt(document.getElementById('yama-contribution')?.value || '100', 10) }),
    'tempoross': () => ({ pts: parseInt(document.getElementById('tempoross-points')?.value || '4000', 10) }),
    'wintertodt': () => ({ pts: parseInt(document.getElementById('wintertodt-points')?.value || '750', 10) }),
    'zalcano': () => ({ contrib: parseInt(document.getElementById('zalcano-contribution')?.value || '100', 10) }),
    'royal_titans': () => ({ target: document.getElementById('titan-target-btn')?.value || 'branda', action: document.getElementById('titan-action-btn')?.value || 'loot', contrib: parseInt(document.getElementById('titan-contribution')?.value || '100', 10) }),
    'araxxor': () => ({ isSacrificing: document.getElementById('araxxor-sacrifice-btn')?.value === 'true' })
};

function handleCalculation(skipScroll = false) {
    const preventScroll = skipScroll === true;
    const selectedItems = getSelectedItems();
    
    if (!selectedItems.length) { DOM.resultsSection.classList.add("hidden"); return; }
    
    const currentKC = Math.max(0, parseInt(DOM.kcInput.value || '0', 10));
    const bossState = STATE_EXTRACTORS[activeBossKey] ? STATE_EXTRACTORS[activeBossKey]() : {};
    
    const results = executeSimulation(selectedItems, currentKC, bossState);
    if (results) displayResults(results, currentKC, preventScroll);
}

function executeSimulation(selectedItems, currentKC, bossState) {
    const currentHash = generateStateHash(activeBossKey, selectedItems, bossState);
    let rawResults;
    if (activeSimulationCache.hash === currentHash) {
        rawResults = activeSimulationCache.rawResults;
    } else {
        const validItems = selectedItems.filter(item => item.rate > 0);
        if (validItems.length === 0) return null;
        let matrix;
        const rolls = BOSS_CONFIG[activeBossKey].rolls || 1;
        if (activeBossKey === 'moons_of_peril') matrix = createMoonsMatrix(validItems);
        else if (activeBossKey === 'barrows_chests') matrix = createBarrowsMatrix(validItems.length);
        else matrix = createMasterMatrix(validItems, rolls);
        rawResults = runSimulation(matrix);
        activeSimulationCache = { hash: currentHash, rawResults: rawResults };
    }
    const targetP = rawResults.historyCDF[currentKC] ?? (currentKC >= rawResults.finalK ? 1 : 0);
    const curveData = buildChartData(rawResults.historyPMF, rawResults.historyCDF, rawResults.finalK, currentKC, rawResults.modeKC, rawResults.median);
    return { ...rawResults, targetP, curveData };
}

function displayResults(results, currentKC, preventScroll) {
    DOM.resultsSection.classList.remove("hidden");
    DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
    const fmt = (col, lab, val) => `<span style="color:${col};font-weight:800;">${lab}</span> <b style="color:${col}">${val} KC</b>`;
    DOM.phraseMode.innerHTML = fmt(COLORS.mode, "Mode", results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = fmt(COLORS.progress, "Median", results.median.toLocaleString());
    DOM.phraseMean.innerHTML = fmt(COLORS.mean, "Mean", Math.round(results.mean).toLocaleString());
    DOM.phraseUser.innerHTML = fmt(COLORS.user, "Your KC", currentKC.toLocaleString());
    renderChart(results.curveData, results, currentKC);
    
    if (!preventScroll) {
        DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function renderChart(data, stats, userKC) {
    const ctx = DOM.chartCanvas.getContext('2d'), transformX = (x) => Math.pow(x, X_AXIS_POWER), reverseX = (y) => Math.pow(y, 1 / X_AXIS_POWER), xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);
    const getClosest = (targetX) => data.reduce((prev, curr) => Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev);
    const modeY = getClosest(stats.modeKC).pmf, medianY = getClosest(stats.median).cdf;
    const datasets = [ { label: 'Luck (PMF)', data: data.map(d => ({ x: transformX(d.x), y: d.pmf, rawX: d.x })), borderColor: COLORS.mode, borderWidth: 3, pointRadius: 0, yAxisID: 'yPMF', tension: 0.2, fill: false }, { label: 'Progress (CDF)', data: data.map(d => ({ x: transformX(d.x), y: d.cdf, rawX: d.x })), borderColor: COLORS.progress, borderWidth: 2, pointRadius: 0, yAxisID: 'yCDF', tension: 0.2, fill: false } ];
    const options = { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, scales: { x: { type: 'linear', min: transformX(1), max: transformX(xMaxRaw), ticks: { callback: (val) => Math.round(reverseX(val)).toLocaleString() } }, yPMF: { display: false }, yCDF: { display: true, position: 'right', min: 0, max: 1, ticks: { callback: v => (v * 100).toFixed(0) + '%' } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => `KC: ${items[0].raw.rawX.toLocaleString()}`, label: c => c.datasetIndex === 0 ? ` Luck: ~1/${Math.round(1 / c.raw.y).toLocaleString()}` : ` Chance: ${(c.raw.y * 100).toFixed(2)}%` } }, annotation: { annotations: { modePoint: { type: 'point', xValue: transformX(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: COLORS.mode, radius: 5 }, medianPoint: { type: 'point', xValue: transformX(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: COLORS.progress, radius: 5 }, mean: { type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean), borderColor: 'rgba(249, 115, 22, 0.5)', borderDash: [5,5] }, user: { type: 'line', xMin: transformX(userKC), xMax: transformX(userKC), borderColor: COLORS.user, borderWidth: 3 } } } } };
    if (chartInstance) { chartInstance.data.datasets = datasets; chartInstance.options = options; chartInstance.update(); } else { chartInstance = new Chart(ctx, { type: 'line', data: { datasets }, options }); }
}

function renderItemGrid(items) {
    const sorted = [...items.filter(i => !i.hidden)].sort((a, b) => a.order - b.order);
    DOM.itemGrid.innerHTML = sorted.map(i => `<div class="item-box selected" data-rate="${i.rate}" data-pieces="${i.pieces || 1}" data-pool="${i.pool || ''}" title="${i.name}"><img src="${getWikiUrl(i.name)}" alt="${i.name}"></div>`).join('');
}

function getSelectedItems() {
    return Array.from(DOM.itemGrid.querySelectorAll(".item-box.selected")).map(b => ({ name: b.title, rate: parseFloat(b.dataset.rate), type: 'main', pieces: parseInt(b.dataset.pieces, 10) || 1, pool: b.dataset.pool }));
}

function forceItemSelection(allowedNames) { DOM.itemGrid.querySelectorAll(".item-box").forEach(box => { const isAllowed = allowedNames.includes(box.title); box.classList.toggle("selected", isAllowed); box.style.opacity = isAllowed ? "1" : "0.3"; box.style.pointerEvents = isAllowed ? "auto" : "none"; }); handleCalculation(true); }
function unlockItemSelection() { DOM.itemGrid.querySelectorAll(".item-box").forEach(box => { box.style.opacity = "1"; box.style.pointerEvents = "auto"; }); handleCalculation(true); }

initApp();