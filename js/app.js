/**
 * @file app.js
 * Main UI Controller for DropLogic.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation } from './solvers.js';

// --- Configuration & State ---
const CHART_FONT = "'Inter', sans-serif";
const CHART_TEXT_COLOR = '#a8a29e';
const COLORS = {
    mode: '#ef4444',
    progress: '#3b82f6',
    mean: '#f97316',
    user: '#22c55e'
};

// Power transformation constant for Chart.js X-axis scaling to visualize OSRS drop rates realistically.
const X_AXIS_POWER = 0.4;

let activeBossKey = "";
let chartInstance = null;

// --- DOM Elements ---
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
    chartCanvas: document.getElementById('distributionChart')
};

// --- Initialization ---
function initApp() {
    setupChartDefaults();
    populateBossSelect();
    bindEvents();
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

// --- Event Binding ---
function bindEvents() {
    // 1. CALCULATOR CORE LOGIC
    if (DOM.bossSelect) DOM.bossSelect.addEventListener('change', handleBossSelection);
    if (DOM.itemGrid) DOM.itemGrid.addEventListener('click', toggleItemSelection);
    
    // Kill Count Buttons (+10, +100, etc.)
    document.querySelectorAll(".kc-btn[data-add]").forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });

    // KC Reset (The '0' button)
    const kcReset = document.getElementById("kc-reset");
    if (kcReset) {
        kcReset.addEventListener('click', () => {
            if (DOM.kcInput) DOM.kcInput.value = 0;
        });
    }

    // ITEM SELECTION (Select All / Reset Grid)
    const selectAllBtn = document.getElementById("select-all");
    const selectNoneBtn = document.getElementById("select-none");

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setAllItemsSelection(true);
        });
    }
    if (selectNoneBtn) {
        selectNoneBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setAllItemsSelection(false);
        });
    }

    const calcBtn = document.getElementById("calculate-btn");
    if (calcBtn) calcBtn.addEventListener('click', handleCalculation);

    // 2. NAVIGATION: HOME / RETURN BUTTON
    const btnHome = document.getElementById("btn-home");
    if (btnHome) {
        btnHome.addEventListener('click', () => {
            document.getElementById('main-view').classList.add('hidden-view');
            document.getElementById('hero-view').classList.remove('hidden-view');
            window.scrollTo(0, 0);
        });
    }

    // 3. NAVIGATION: MOBILE MENU TOGGLE
    const mobileBtn = document.getElementById('mobile-sections-btn');
    const mobileMenu = document.getElementById('mobile-dropdown');

    if (mobileBtn && mobileMenu) {
        mobileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevents document click from closing it immediately
            mobileMenu.classList.toggle('hidden');
        });

        // Close menu if user clicks anywhere else
        document.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
        });
    }

    // 4. NAVIGATION: UNIFIED TAB SWITCHING (Desktop + Mobile Sync)
    const navButtons = document.querySelectorAll('.tab-link, .mobile-nav-item');
    const allPanels = document.querySelectorAll('.tab-panel');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-tab');

            // A. Hide all panels
            allPanels.forEach(panel => {
                panel.style.display = 'none';
                panel.classList.remove('active-panel');
            });

            // B. Show the specific target panel
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.classList.add('active-panel');
            }

            // C. Sync "Active" styling across both menus (Desktop & Mobile)
            navButtons.forEach(nb => nb.classList.remove('active'));
            document.querySelectorAll(`[data-tab="${targetId}"]`).forEach(activeBtn => {
                activeBtn.classList.add('active');
            });

            // D. Cleanup
            if (mobileMenu) mobileMenu.classList.add('hidden');
            window.scrollTo(0, 0);
        });
    });
}

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
    const currentVal = parseInt(DOM.kcInput.value) || 0;
    DOM.kcInput.value = currentVal + amount;
}

function toggleItemSelection(e) {
    const box = e.target.closest(".item-box");
    if (box) box.classList.toggle("selected");
}

function setAllItemsSelection(select) {
    const action = select ? 'add' : 'remove';
    // Use document selection to ensure it finds boxes even if grid re-rendered
    const items = document.querySelectorAll("#item-grid .item-box");
    items.forEach(b => b.classList[action]("selected"));
}

function handleCalculation() {
    const selectedItems = getSelectedItems();
    if (!selectedItems.length) {
        alert("Select at least one item!");
        return;
    }
    const currentKC = parseInt(DOM.kcInput.value) || 0;
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
        pieces: parseInt(b.dataset.pieces) || 1,
        pool: b.dataset.pool 
    }));
}

function executeSimulation(selectedItems, currentKC) {
    let matrix;
    const bossData = BOSS_CONFIG[activeBossKey];
    const rolls = bossData.rolls || 1;

    // Route to the appropriate matrix engine based on boss-specific mechanics
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
function displayResults(results, currentKC) {
    DOM.resultsSection.classList.remove("hidden");
    DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
    
    // Helper to enforce a strict typographical hierarchy for our stats
    const formatStat = (color, label, description, value) => 
        `<span style="color:${color}; font-family: var(--font-mono); font-weight: 800; font-size: 1.05em; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 6px;">${label}</span>
         <span style="color: var(--text); font-size: 1em; font-weight: 700;">${description}</span>
         <b style="color: ${color}; font-size: 1.05em; margin-left: 4px;">${value} <span style="font-size: 0.85em; opacity: 0.9;">KC</span></b>`;

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

    // Data transformations for Chart.js
    const transformX = (x) => Math.pow(x, X_AXIS_POWER);
    const reverseX = (y) => Math.pow(y, 1 / X_AXIS_POWER);
    
    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);

    // Helper to find the nearest data point for annotations
    const getClosestPoint = (targetX) => {
        return data.reduce((prev, curr) => 
            Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev
        );
    };

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
            display: true, position: 'right', min: 0, max: 1, grid: { display: false },
            ticks: { callback: v => (v * 100).toFixed(0) + '%', color: COLORS.progress, font: { size: 10, weight: 700 } }
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
                label: c => {
                    if (c.datasetIndex === 0) {
                        const prob = c.raw.y;
                        const odds = prob > 0 ? Math.round(1 / prob).toLocaleString() : "0";
                        return ` Luck Chance: ~1/${odds}`;
                    } else {
                        return ` Chance For Completion: ${(c.raw.y * 100).toFixed(2)}%`;
                    }
                }
            }
        },
        annotation: {
            annotations: {
                modePoint: { type: 'point', xValue: transformX(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: COLORS.mode, borderColor: '#fff', borderWidth: 2, radius: 5 },
                medianPoint: { type: 'point', xValue: transformX(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: COLORS.progress, borderColor: '#fff', borderWidth: 2, radius: 5 },
                mean: {
                    type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean),
                    borderColor: 'rgba(249, 115, 22, 0.8)', borderWidth: 2, borderDash: [5,5],
                    label: { display: false, content: 'MEAN', position: 'start', backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'rgba(249, 115, 22, 1)', font: { size: 10, weight: 800 } }
                },
                user: {
                    type: 'line', xMin: transformX(userKC), xMax: transformX(userKC),
                    borderColor: COLORS.user, borderWidth: 2, borderDash: [6, 4], shadowBlur: 10, shadowColor: COLORS.user
                }
            }
        }
    };
}

// Bootstrap the application
initApp();