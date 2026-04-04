/**
 * @file app.js
 * Main UI Controller for DropLogic.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation } from './solvers.js';

const CHART_FONT = "'Inter', sans-serif";
const CHART_TEXT_COLOR = '#a8a29e';
const COLORS = { mode: '#ef4444', progress: '#3b82f6', mean: '#f97316', user: '#22c55e' };
const X_AXIS_POWER = 0.4;
const DT2_BOSSES = ['vardorvis', 'duke_sucellus', 'the_whisperer', 'the_leviathan'];

let activeBossKey = "";
let chartInstance = null;

// Centralized DOM caching prevents redundant document queries
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
    
    // Extracted from bindEvents to ensure all static UI elements share a single source of truth
    kcResetBtn: document.getElementById("kc-reset"),
    selectAllBtn: document.getElementById("select-all"),
    selectNoneBtn: document.getElementById("select-none"),
    calcBtn: document.getElementById("calculate-btn"),
    mobileBtn: document.getElementById('mobile-sections-btn'),
    mobileMenu: document.getElementById('mobile-dropdown')
};

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

// --- RAID UI INJECTOR ---
function renderDynamicSettings(bossKey) {
    let container = document.getElementById('dynamic-raid-settings');
    
    // We create this dynamically on the fly rather than caching it in the DOM object
    // because it relies on activeBossKey state that doesn't exist on initial load.
    if (!container) {
        container = document.createElement('div');
        container.id = 'dynamic-raid-settings';
        container.style.marginBottom = '24px';
        DOM.bossPreview.insertBefore(container, document.querySelector('.collection-header'));
    }

    switch (bossKey) {
        case 'chambers_of_xeric':
            container.innerHTML = `
                <div class="input-group">
                    <label>Average Team Points</label>
                    <input type="number" id="raid-cox-pts" value="30000" min="0">
                </div>`;
            break;
        case 'theatre_of_blood':
            container.innerHTML = `
                <div class="input-row" style="margin-bottom: 0;">
                    <div class="input-group">
                        <label>Team Size</label>
                        <input type="number" id="raid-tob-size" value="3" min="1" max="5">
                    </div>
                    <div class="input-group">
                        <label>Team Deaths</label>
                        <input type="number" id="raid-tob-deaths" value="0" min="0">
                    </div>
                </div>`;
            break;
        case 'tombs_of_amascut':
            container.innerHTML = `
                <div class="input-row" style="margin-bottom: 0;">
                    <div class="input-group">
                        <label>Raid Level</label>
                        <input type="number" id="raid-toa-level" value="150" min="0">
                    </div>
                    <div class="input-group">
                        <label>Team Points</label>
                        <input type="number" id="raid-toa-pts" value="15000" min="0">
                    </div>
                </div>`;
            break;
        default:
            if (DT2_BOSSES.includes(bossKey)) {
                container.innerHTML = `
                    <button type="button" id="dt2-awakened-btn" value="false" 
                        style="width: 100%; margin-top: 8px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                        Standard Variant
                    </button>`;
            } else {
                container.innerHTML = ''; 
            }
            break;
    }

    const dt2Btn = document.getElementById('dt2-awakened-btn');
    if (dt2Btn) {
        dt2Btn.addEventListener('click', function() {
            const isAwakened = this.value === 'true';
            this.value = isAwakened ? 'false' : 'true';
            this.innerText = isAwakened ? 'Standard Variant' : 'Awakened Variant (3x Uniques)';
            this.style.borderColor = isAwakened ? 'var(--border)' : 'var(--accent-orange)';
            this.style.color = isAwakened ? 'var(--text)' : 'var(--accent-orange)';
            this.style.background = isAwakened ? 'rgba(255,255,255,0.05)' : 'rgba(249, 115, 22, 0.05)';
        });
    }
}

function bindEvents() {
    if (DOM.bossSelect) DOM.bossSelect.addEventListener('change', handleBossSelection);
    if (DOM.itemGrid) DOM.itemGrid.addEventListener('click', toggleItemSelection);
    
    document.querySelectorAll(".kc-btn[data-add]").forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });

    if (DOM.kcResetBtn) DOM.kcResetBtn.addEventListener('click', () => { if (DOM.kcInput) DOM.kcInput.value = 0; });
    
    if (DOM.selectAllBtn) DOM.selectAllBtn.addEventListener('click', (e) => { e.preventDefault(); setAllItemsSelection(true); });
    if (DOM.selectNoneBtn) DOM.selectNoneBtn.addEventListener('click', (e) => { e.preventDefault(); setAllItemsSelection(false); });

    if (DOM.calcBtn) DOM.calcBtn.addEventListener('click', handleCalculation);

    // Local UI state toggle (does not conflict with index.html view transitions)
    if (DOM.mobileBtn && DOM.mobileMenu) { 
        DOM.mobileBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            DOM.mobileMenu.classList.toggle('hidden'); 
        }); 
        document.addEventListener('click', () => { DOM.mobileMenu.classList.add('hidden'); }); 
    }
}

function initGoalTracking() {
    const goalCards = document.querySelectorAll('#ironman-goals .card');
    goalCards.forEach(card => {
        const wrapper = card.querySelector('.check-all-wrapper'); 
        const checkAllBox = card.querySelector('.check-all-box');
        const goalCheckboxes = card.querySelectorAll('.goal-item input[type="checkbox"]');
        if (!wrapper || !checkAllBox || goalCheckboxes.length === 0) return;

        const updateMasterVisuals = () => {
            const total = goalCheckboxes.length;
            const checkedCount = card.querySelectorAll('.goal-item input[type="checkbox"]:checked').length;
            
            wrapper.classList.remove('is-checked', 'is-indeterminate');
            if (checkedCount === 0) { 
                checkAllBox.checked = false; 
                checkAllBox.indeterminate = false; 
            } else if (checkedCount === total) { 
                checkAllBox.checked = true; 
                checkAllBox.indeterminate = false; 
                wrapper.classList.add('is-checked'); 
            } else { 
                checkAllBox.checked = false; 
                checkAllBox.indeterminate = true; 
                wrapper.classList.add('is-indeterminate'); 
            }
        };

        const getStorageKey = (name) => `goal-${name.trim().replace(/\s+/g, '-')}`;

        goalCheckboxes.forEach(cb => {
            const nameEl = cb.closest('.goal-item').querySelector('.goal-name');
            if (nameEl) {
                const saveKey = getStorageKey(nameEl.textContent);
                if (localStorage.getItem(saveKey) === 'true') cb.checked = true;
                cb.addEventListener('change', () => localStorage.setItem(saveKey, cb.checked));
            }
        });
        
        updateMasterVisuals();

        checkAllBox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            goalCheckboxes.forEach(cb => { 
                cb.checked = isChecked; 
                const nameEl = cb.closest('.goal-item').querySelector('.goal-name'); 
                if (nameEl) {
                    localStorage.setItem(getStorageKey(nameEl.textContent), isChecked); 
                }
            });
            updateMasterVisuals();
        });
        
        goalCheckboxes.forEach(cb => cb.addEventListener('change', updateMasterVisuals));
    });
}

function handleBossSelection(e) {
    activeBossKey = e.target.value;
    if (!activeBossKey) { 
        DOM.bossPreview.classList.add("hidden"); 
        return; 
    }
    renderItemGrid(BOSS_CONFIG[activeBossKey].items);
    renderDynamicSettings(activeBossKey);
    DOM.bossPreview.classList.remove("hidden");
}

function updateKC(amount) { 
    const currentVal = parseInt(DOM.kcInput.value, 10) || 0; 
    DOM.kcInput.value = currentVal + amount; 
}

function toggleItemSelection(e) { 
    const box = e.target.closest(".item-box"); 
    if (box) box.classList.toggle("selected"); 
}

function setAllItemsSelection(select) { 
    const action = select ? 'add' : 'remove'; 
    // Scoped query against DOM.itemGrid is much faster than checking the entire document
    DOM.itemGrid.querySelectorAll(".item-box").forEach(b => b.classList[action]("selected")); 
}

function handleCalculation() {
    const selectedItems = getSelectedItems();
    if (!selectedItems.length) { 
        alert("Select at least one item!"); 
        return; 
    }
    const currentKC = parseInt(DOM.kcInput.value, 10) || 0;
    const results = executeSimulation(selectedItems, currentKC);
    displayResults(results, currentKC);
}

function renderItemGrid(items) {
    const visibleItems = items.filter(item => !item.hidden);
    const sortedItems = [...visibleItems].sort((a, b) => a.order - b.order);
    
    DOM.itemGrid.innerHTML = sortedItems.map(item => `
        <div class="item-box selected" data-id="${item.id}" data-rate="${item.rate}" data-type="${item.type}" data-pieces="${item.pieces || 1}" data-pool="${item.pool || ''}" title="${item.name}">
            <img src="${getWikiUrl(item.name)}" alt="${item.name}">
        </div>
    `).join('');
}

function getSelectedItems() {
    return Array.from(DOM.itemGrid.querySelectorAll(".item-box.selected")).map(b => ({ 
        name: b.title, 
        rate: parseFloat(b.dataset.rate), 
        type: b.dataset.type, 
        pieces: parseInt(b.dataset.pieces, 10) || 1, 
        pool: b.dataset.pool 
    }));
}

function adjustRatesForCox(items) {
    const pts = parseInt(document.getElementById('raid-cox-pts').value, 10) || 30000;
    const uniqueChance = pts / 867600; 
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 69) };
        if (item.name === 'Olmlet') return { ...item, rate: uniqueChance * item.rate };
        return item;
    });
}

function adjustRatesForTob(items) {
    const size = parseInt(document.getElementById('raid-tob-size').value, 10) || 3;
    const deaths = parseInt(document.getElementById('raid-tob-deaths').value, 10) || 0;
    const maxPts = (18 * size) + 14;
    const earnedPts = Math.max(0, maxPts - (deaths * 4));
    const uniqueChance = (1 / 9.1) * (earnedPts / maxPts);
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 19) };
        return item;
    });
}

function adjustRatesForToa(items) {
    const level = parseInt(document.getElementById('raid-toa-level').value, 10) || 150;
    const pts = parseInt(document.getElementById('raid-toa-pts').value, 10) || 15000;
    
    let adjLevel = level;
    if (adjLevel > 310) { 
        if (adjLevel > 430) adjLevel = 430 + Math.floor((adjLevel - 430) / 2); 
        adjLevel = 310 + Math.floor((adjLevel - 310) / 3); 
    }
    
    const denom = 100 * (10500 - 20 * adjLevel);
    const uniqueChance = pts / denom;

    let fangW = 70; let lbW = 70;
    if (level >= 500) { fangW = 30; lbW = 35; }
    else if (level >= 450) { fangW = 40 - Math.floor((level - 450) * 0.2); lbW = 40 - Math.floor((level - 450) * 0.1); }
    else if (level >= 400) { fangW = 40; lbW = 50 - Math.floor((level - 400) * 0.2); }
    else if (level >= 350) { fangW = 60 - Math.floor((level - 350) * 0.4); lbW = 60 - Math.floor((level - 350) * 0.2); }
    else if (level >= 300) { fangW = 70 - Math.floor((level - 300) * 0.2); lbW = 70 - Math.floor((level - 300) * 0.2); }

    const totalWeight = 10 + 20 + 20 + 20 + 30 + fangW + lbW;
    
    return items.map(item => {
        if (item.type === 'main') {
            let w = item.rate;
            if (item.name === "Osmumten's fang") w = fangW;
            if (item.name === "Lightbearer") w = lbW;
            if (level < 150 && !["Osmumten's fang", "Lightbearer"].includes(item.name)) w /= 50;
            return { ...item, rate: uniqueChance * (w / totalWeight) };
        }
        if (item.name === "Tumeken's guardian") {
            const petDenom = 100 * (350000 - 700 * Math.min(adjLevel, 466));
            return { ...item, rate: pts / petDenom };
        }
        return item;
    });
}

function adjustRatesForDT2(items) {
    const btn = document.getElementById('dt2-awakened-btn');
    const isAwakened = btn ? btn.value === 'true' : false;
    
    if (isAwakened) {
        return items.map(item => {
            if (item.type === 'main') return { ...item, rate: item.rate * 3 };
            return item;
        });
    }
    return items;
}

function executeSimulation(selectedItems, currentKC) {
    const bossData = BOSS_CONFIG[activeBossKey];
    let processedItems = [...selectedItems];

    if (activeBossKey === 'chambers_of_xeric') {
        processedItems = adjustRatesForCox(processedItems);
    } else if (activeBossKey === 'theatre_of_blood') {
        processedItems = adjustRatesForTob(processedItems);
    } else if (activeBossKey === 'tombs_of_amascut') {
        processedItems = adjustRatesForToa(processedItems);
    } else if (DT2_BOSSES.includes(activeBossKey)) {
        processedItems = adjustRatesForDT2(processedItems);
    }

    let matrix;
    const rolls = bossData.rolls || 1;

    if (activeBossKey === 'moons_of_peril') {
        matrix = createMoonsMatrix(processedItems);
    } else if (activeBossKey === 'barrows_chests') {
        matrix = createBarrowsMatrix(processedItems.length);
    } else {
        matrix = createMasterMatrix(processedItems, rolls);
    }

    return runSimulation(matrix, currentKC);
}

function displayResults(results, currentKC) {
    DOM.resultsSection.classList.remove("hidden");
    DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
    
    const formatStat = (color, label, description, value) => 
        `<span style="color:${color}; font-family: var(--font-mono); font-weight: 800; font-size: 1.05em; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 6px;">${label}</span> ` +
        `<span style="color: var(--text); font-size: 1em; font-weight: 700;">${description}</span> ` +
        `<b style="color: ${color}; font-size: 1.05em; margin-left: 4px;">${value} <span style="font-size: 0.85em; opacity: 0.9;">KC</span></b>`;
        
    DOM.phraseMode.innerHTML = formatStat(COLORS.mode, "Mode", "Luckiest players finish as early as", results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = formatStat(COLORS.progress, "Median", "Half of players complete at or before", results.median.toLocaleString());
    DOM.phraseMean.innerHTML = formatStat(COLORS.mean, "Mean", "Average player completes at", Math.round(results.mean).toLocaleString());
    DOM.phraseUser.innerHTML = formatStat(COLORS.user, "Current", "Your current progress in the log", currentKC.toLocaleString());
    
    renderChart(results.curveData, results, currentKC);
    DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function renderChart(data, stats, userKC) {
    const ctx = DOM.chartCanvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    const transformX = (x) => Math.pow(x, X_AXIS_POWER);
    const reverseX = (y) => Math.pow(y, 1 / X_AXIS_POWER);
    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);
    
    const getClosestPoint = (targetX) => data.reduce((prev, curr) => 
        Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev
    );
    
    const modeY = getClosestPoint(stats.modeKC).pmf;
    const medianY = getClosestPoint(stats.median).cdf;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { 
            datasets: [ 
                createDataset('Luck (PMF)', data, transformX, 'pmf', COLORS.mode, 'yPMF'), 
                createDataset('Progress (CDF)', data, transformX, 'cdf', COLORS.progress, 'yCDF', 2) 
            ] 
        },
        options: getChartOptions(transformX, reverseX, xMaxRaw, stats, userKC, modeY, medianY)
    });
}

function createDataset(label, data, transformX, yKey, color, yAxisID, borderWidth = 3) {
    return { 
        label: label, 
        data: data.map(d => ({ x: transformX(d.x), y: d[yKey], rawX: d.x })), 
        borderColor: color, 
        borderWidth: borderWidth, 
        pointRadius: 0, 
        yAxisID: yAxisID, 
        tension: 0.4, 
        fill: false 
    };
}

function getChartOptions(transformX, reverseX, xMaxRaw, stats, userKC, modeY, medianY) {
    return { 
        responsive: true, 
        maintainAspectRatio: false, 
        animation: false, 
        interaction: { mode: 'nearest', intersect: false, axis: 'xy' }, 
        scales: getChartScales(transformX, reverseX, xMaxRaw), 
        plugins: getChartPlugins(transformX, stats, userKC, modeY, medianY) 
    };
}

function getChartScales(transformX, reverseX, xMaxRaw) {
     return {
        x: { 
            type: 'linear', 
            min: transformX(1), 
            max: transformX(xMaxRaw), 
            grid: { color: 'rgba(68, 64, 60, 0.2)', drawTicks: false }, 
            ticks: { 
                color: CHART_TEXT_COLOR, 
                font: { size: 10, weight: 700 }, 
                maxTicksLimit: 8, 
                callback: function(val) { 
                    let realKC = reverseX(val); 
                    if (realKC < 1) return null; 
                    if (realKC > 1000) realKC = Math.round(realKC / 100) * 100; 
                    else if (realKC > 100) realKC = Math.round(realKC / 10) * 10; 
                    else realKC = Math.round(realKC); 
                    return realKC.toLocaleString(); 
                } 
            } 
        },
        yPMF: { display: false }, 
        yCDF: { 
            display: true, 
            position: 'right', 
            min: 0, 
            max: 1, 
            grid: { display: false }, 
            ticks: { 
                callback: v => (v * 100).toFixed(0) + '%', 
                color: COLORS.progress, 
                font: { size: 10, weight: 700 } 
            } 
        }
    };
}

function getChartPlugins(transformX, stats, userKC, modeY, medianY) {
    return {
        legend: { display: false },
        tooltip: { 
            backgroundColor: 'rgba(10,10,10,0.95)', 
            borderColor: '#44403c', 
            borderWidth: 1, 
            padding: 12, 
            titleFont: { weight: 900, size: 13 }, 
            bodyFont: { weight: 600, size: 12 }, 
            callbacks: { 
                title: items => `KC: ${items[0].raw.rawX.toLocaleString()}`, 
                label: c => c.datasetIndex === 0 
                    ? ` Luck Chance: ~1/${(c.raw.y > 0 ? Math.round(1 / c.raw.y).toLocaleString() : "0")}` 
                    : ` Chance For Completion: ${(c.raw.y * 100).toFixed(2)}%` 
            } 
        },
        annotation: { 
            annotations: { 
                modePoint: { type: 'point', xValue: transformX(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: COLORS.mode, borderColor: '#fff', borderWidth: 2, radius: 5 }, 
                medianPoint: { type: 'point', xValue: transformX(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: COLORS.progress, borderColor: '#fff', borderWidth: 2, radius: 5 }, 
                mean: { type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean), borderColor: 'rgba(249, 115, 22, 0.8)', borderWidth: 2, borderDash: [5,5], label: { display: false } }, 
                user: { type: 'line', xMin: transformX(userKC), xMax: transformX(userKC), borderColor: COLORS.user, borderWidth: 2, borderDash: [6, 4], shadowBlur: 10, shadowColor: COLORS.user } 
            } 
        }
    };
}

initApp();