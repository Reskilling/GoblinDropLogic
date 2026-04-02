/**
 * @file app.js
 * Main UI Controller for DropLogic.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation } from './solvers.js';

// --- Configuration & Constants ---
const APP_CONFIG = {
    CHART_FONT: "'Inter', sans-serif",
    CHART_TEXT_COLOR: '#a8a29e',
    // Power transformation for Chart.js X-axis to visualize OSRS drop rates realistically.
    X_AXIS_POWER: 0.4,
    // Adds a 10% padding to the right side of the chart so the user's KC line isn't cut off
    CHART_PADDING_FACTOR: 1.1,
    COLORS: {
        mode: '#ef4444',
        progress: '#3b82f6',
        mean: '#f97316',
        user: '#22c55e'
    }
};

let activeBossKey = "";
let chartInstance = null;
let DOM = {}; // Make this mutable so we can assign it safely later

// --- Initialization ---

// Bulletproof execution: wait for HTML to finish parsing if it hasn't already
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

function initApp() {
    // 1. Cache elements ONLY after we know the DOM exists
    DOM = {
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
        chartCanvas: document.getElementById('distributionChart')
    };

    // 2. Build the UI *before* touching the external Chart.js library
    populateBossSelect();
    bindEvents();
    
    // 3. Attempt to format the chart
    setupChartDefaults();
}

function setupChartDefaults() {
    // Safe-check: Only apply defaults if the CDN script successfully loaded
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = APP_CONFIG.CHART_FONT;
        Chart.defaults.color = APP_CONFIG.CHART_TEXT_COLOR;
    } else {
        console.warn("Chart.js not ready. It may be blocked or loading slowly.");
    }
}

function populateBossSelect() {
    const defaultOption = '<option value="">Select Boss Intel...</option>';
    const bossOptions = Object.keys(BOSS_CONFIG)
        .sort()
        .map(key => `<option value="${key}">${formatBossName(key)}</option>`)
        .join('');
    
    DOM.bossSelect.innerHTML = defaultOption + bossOptions;
}

// --- Event Binding ---
function bindEvents() {
    DOM.bossSelect.addEventListener('change', handleBossSelection);
    
    // KC Input Modifiers
    document.querySelectorAll(".kc-btn[data-add]").forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });
    document.getElementById("kc-reset").addEventListener('click', () => { DOM.kcInput.value = 0; });

    // Item Selection
    DOM.itemGrid.addEventListener('click', toggleItemSelection);
    document.getElementById("select-all").addEventListener('click', () => setAllItemsSelection(true));
    document.getElementById("select-none").addEventListener('click', () => setAllItemsSelection(false));

    // Simulation Trigger
    document.getElementById("calculate-btn").addEventListener('click', handleCalculation);
}

// --- Utility Helpers ---
const getCurrentKC = () => parseInt(DOM.kcInput.value, 10) || 0;

/**
 * Finds the nearest exact data point in our downsampled array for chart annotations.
 */
const getClosestPoint = (data, targetX) => {
    return data.reduce((prev, curr) => 
        Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev
    );
};

// --- Event Handlers ---
function handleBossSelection(e) {
    activeBossKey = e.target.value;
    
    if (!activeBossKey) {
        DOM.bossPreview.classList.add("hidden");
        return;
    }
    
    renderItemGrid(BOSS_CONFIG[activeBossKey].items);
    DOM.bossPreview.classList.remove("hidden");
}

function updateKC(amount) {
    DOM.kcInput.value = getCurrentKC() + amount;
}

function toggleItemSelection(e) {
    const box = e.target.closest(".item-box");
    if (box) box.classList.toggle("selected");
}

function setAllItemsSelection(select) {
    const action = select ? 'add' : 'remove';
    DOM.itemGrid.querySelectorAll(".item-box").forEach(b => b.classList[action]("selected"));
}

function handleCalculation() {
    const selectedItems = getSelectedItems();

    if (!selectedItems.length) {
        alert("Select at least one item!");
        return;
    }

    const currentKC = getCurrentKC();
    const results = executeSimulation(selectedItems, currentKC);

    displayResults(results, currentKC);
}

// --- Core Logic ---
function renderItemGrid(items) {
    const sortedItems = [...items].sort((a, b) => a.order - b.order);
    
    DOM.itemGrid.innerHTML = sortedItems.map(item => `
        <div class="item-box selected" 
             data-id="${item.id}" 
             data-rate="${item.rate}" 
             data-type="${item.type}" 
             data-pieces="${item.pieces || 1}" 
             data-pool="${item.pool || ''}" 
             title="${item.name}">
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

function executeSimulation(selectedItems, currentKC) {
    let matrix;
    const bossData = BOSS_CONFIG[activeBossKey];
    const rolls = bossData.rolls || 1;

    if (activeBossKey === 'moons_of_peril') {
        matrix = createMoonsMatrix(selectedItems);
    } else if (activeBossKey === 'barrows_chests' && selectedItems.length > 5) {
        matrix = createBarrowsMatrix(selectedItems.length); 
    } else {
        matrix = createMasterMatrix(selectedItems, rolls);
    }

    return runSimulation(matrix, currentKC);
}

// --- UI Rendering ---

/**
 * Enforces a strict typographical hierarchy for our stat cards.
 * We keep the styles inline here to guarantee zero visual/CSS structure breakages.
 */
function generateStatHTML(color, label, description, value) {
    return `
        <span style="color:${color}; font-family: var(--font-mono); font-weight: 800; font-size: 1.05em; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 6px;">${label}</span>
        <span style="color: var(--text); font-size: 1em; font-weight: 700;">${description}</span>
        <b style="color: ${color}; font-size: 1.05em; margin-left: 4px;">${value} <span style="font-size: 0.85em; opacity: 0.9;">KC</span></b>
    `;
}

function displayResults(results, currentKC) {
    DOM.resultsSection.classList.remove("hidden");
    DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
    
    DOM.phraseMode.innerHTML = generateStatHTML(APP_CONFIG.COLORS.mode, "Mode", "Luckiest players finish as early as", results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = generateStatHTML(APP_CONFIG.COLORS.progress, "Median", "Half of players complete at or before", results.median.toLocaleString());
    DOM.phraseMean.innerHTML = generateStatHTML(APP_CONFIG.COLORS.mean, "Mean", "Average player completes at", Math.round(results.mean).toLocaleString());
    DOM.phraseUser.innerHTML = generateStatHTML(APP_CONFIG.COLORS.user, "Current", "Your current progress in the log", currentKC.toLocaleString());
    
    renderChart(results.curveData, results, currentKC);
    DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function renderChart(data, stats, userKC) {
    const ctx = DOM.chartCanvas.getContext('2d');
    
    if (chartInstance) chartInstance.destroy();

    const transformX = (x) => Math.pow(x, APP_CONFIG.X_AXIS_POWER);
    const reverseX = (y) => Math.pow(y, 1 / APP_CONFIG.X_AXIS_POWER);
    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * APP_CONFIG.CHART_PADDING_FACTOR);

    const modeY = getClosestPoint(data, stats.modeKC).pmf;
    const medianY = getClosestPoint(data, stats.median).cdf;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                createDataset('Luck (PMF)', data, transformX, 'pmf', APP_CONFIG.COLORS.mode, 'yPMF'),
                createDataset('Progress (CDF)', data, transformX, 'cdf', APP_CONFIG.COLORS.progress, 'yCDF', 2)
            ]
        },
        options: getChartOptions(transformX, reverseX, xMaxRaw, stats, userKC, modeY, medianY)
    });
}

// --- Chart Helpers ---
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

/**
 * Snaps graph ticks to clean, readable intervals based on the magnitude of the KC.
 */
function formatXAxisTick(val, reverseX) {
    let realKC = reverseX(val);
    if (realKC < 1) return null; 
    
    if (realKC > 1000) {
        realKC = Math.round(realKC / 100) * 100;
    } else if (realKC > 100) {
        realKC = Math.round(realKC / 10) * 10;
    } else {
        realKC = Math.round(realKC);
    }
    
    return realKC.toLocaleString();
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
                color: APP_CONFIG.CHART_TEXT_COLOR,
                font: { size: 10, weight: 700 },
                maxTicksLimit: 8,
                callback: function(val) { return formatXAxisTick(val, reverseX); }
            }
        },
        yPMF: { display: false }, 
        yCDF: {
            display: true, position: 'right', min: 0, max: 1, grid: { display: false },
            ticks: { callback: v => (v * 100).toFixed(0) + '%', color: APP_CONFIG.COLORS.progress, font: { size: 10, weight: 700 } }
        }
    };
}

function getChartPlugins(transformX, stats, userKC, modeY, medianY) {
    return {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(10,10,10,0.95)', borderColor: '#44403c', borderWidth: 1, padding: 12,
            titleFont: { weight: 900, size: 13 },
            bodyFont: { weight: 600, size: 12 },
            callbacks: {
                title: items => `KC: ${items[0].raw.rawX.toLocaleString()}`,
                label: context => {
                    // datasetIndex 0 is the PMF (Luck) line, 1 is the CDF (Progress) line.
                    if (context.datasetIndex === 0) {
                        const prob = context.raw.y;
                        const odds = prob > 0 ? Math.round(1 / prob).toLocaleString() : "0";
                        return ` Luck Chance: ~1/${odds}`;
                    } else {
                        return ` Chance For Completion: ${(context.raw.y * 100).toFixed(2)}%`;
                    }
                }
            }
        },
        annotation: {
            annotations: {
                modePoint: { type: 'point', xValue: transformX(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: APP_CONFIG.COLORS.mode, borderColor: '#fff', borderWidth: 2, radius: 5 },
                medianPoint: { type: 'point', xValue: transformX(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: APP_CONFIG.COLORS.progress, borderColor: '#fff', borderWidth: 2, radius: 5 },
                mean: {
                    type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean),
                    borderColor: 'rgba(249, 115, 22, 0.8)', borderWidth: 2, borderDash: [5,5],
                    label: { display: false, content: 'MEAN', position: 'start', backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'rgba(249, 115, 22, 1)', font: { size: 10, weight: 800 } }
                },
                user: {
                    type: 'line', xMin: transformX(userKC), xMax: transformX(userKC),
                    borderColor: APP_CONFIG.COLORS.user, borderWidth: 2, borderDash: [6, 4], shadowBlur: 10, shadowColor: APP_CONFIG.COLORS.user
                }
            }
        }
    };
}