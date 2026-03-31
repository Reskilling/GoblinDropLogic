/**
 * @file app.js
 * Main UI Controller for DropLogic.
 * Bridges DOM elements, routes data to the mathematical simulation engines, 
 * and renders Chart.js visualizations.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation } from './solvers.js';

let activeBossKey = "";
let chartInstance = null;

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#a8a29e';

const COLORS = {
    mode: '#ef4444',     
    progress: '#3b82f6', 
    mean: '#f97316',     
    user: '#22c55e'      
};

const sel = document.getElementById("boss-select");
const grid = document.getElementById("item-grid");
const kcInput = document.getElementById("target-kc");

sel.innerHTML = '<option value="">Select Boss Intel...</option>' +
    Object.keys(BOSS_CONFIG).sort().map(k => `<option value="${k}">${formatBossName(k)}</option>`).join('');

sel.onchange = (e) => {
    activeBossKey = e.target.value;
    
    if (!activeBossKey) {
        document.getElementById("boss-preview").classList.add("hidden");
        return;
    }
    
    const sortedItems = [...BOSS_CONFIG[activeBossKey].items].sort((a, b) => a.order - b.order);

    // We store the full item properties as data attributes in the DOM. 
    // This allows the calculation router to construct the matrix purely from 
    // user selection state without needing to cross-reference the global JSON store again.
    grid.innerHTML = sortedItems.map(item => {
        return `<div class="item-box selected" 
                     data-id="${item.id}" 
                     data-rate="${item.rate}" 
                     data-type="${item.type}" 
                     data-pieces="${item.pieces || 1}" 
                     data-pool="${item.pool || ''}" 
                     title="${item.name}">
                    <img src="${getWikiUrl(item.name)}" alt="${item.name}">
                </div>`;
    }).join('');
    
    document.getElementById("boss-preview").classList.remove("hidden");
};

document.querySelectorAll(".kc-btn[data-add]").forEach(btn => {
    btn.onclick = () => {
        const currentVal = parseInt(kcInput.value) || 0; 
        kcInput.value = currentVal + parseInt(btn.dataset.add);
    };
});

document.getElementById("kc-reset").onclick = () => kcInput.value = 0;

grid.onclick = (e) => {
    const box = e.target.closest(".item-box");
    if (box) box.classList.toggle("selected");
};

document.getElementById("select-all").onclick = () => grid.querySelectorAll(".item-box").forEach(b => b.classList.add("selected"));
document.getElementById("select-none").onclick = () => grid.querySelectorAll(".item-box").forEach(b => b.classList.remove("selected"));

document.getElementById("calculate-btn").onclick = () => {
    const selected = Array.from(document.querySelectorAll(".item-box.selected")).map(b => ({
        name: b.title,
        rate: parseFloat(b.dataset.rate),
        type: b.dataset.type,
        pieces: parseInt(b.dataset.pieces) || 1,
        pool: b.dataset.pool 
    }));

    if (!selected.length) return alert("Select at least one item!");

    const currentKC = parseInt(kcInput.value) || 0;
    const rolls = BOSS_CONFIG[activeBossKey].rolls || 1;

    let matrix;
    let results;

    // Route to specialized matrix engines based on boss mechanics
    if (activeBossKey === 'moons_of_peril') {
        matrix = createMoonsMatrix(selected);
        results = runSimulation(matrix, currentKC);
    }
    else if (activeBossKey === 'barrows_chests' && selected.length > 5) {
        // Only trigger the Barrows Coupon Collector matrix if enough items are selected 
        // to warrant intra-chest duplicate protection logic.
        matrix = createBarrowsMatrix(selected.length); 
        results = runSimulation(matrix, currentKC);
    } 
    else {
        matrix = createMasterMatrix(selected, rolls);
        results = runSimulation(matrix, currentKC);
    }

    document.getElementById("results").classList.remove("hidden");
    document.getElementById("stat-chance").textContent = (results.targetP * 100).toFixed(2) + "%";
    
    document.getElementById("phrase-mode").innerHTML = `<span style="color:${COLORS.mode}">●</span> (Mode) Luckiest Players Finish as Early as <b>${results.modeKC.toLocaleString()} KC</b>`;
    document.getElementById("phrase-median").innerHTML = `<span style="color:${COLORS.progress}">●</span> (Median) Half of Players Complete at or Before <b>${results.median.toLocaleString()} KC</b>`;
    document.getElementById("phrase-mean").innerHTML = `<span style="color:${COLORS.mean}">●</span> (Mean) Average Player Completes at <b>${Math.round(results.mean).toLocaleString()} KC</b>`;
    document.getElementById("phrase-user").innerHTML = `<span style="color:${COLORS.user}">●</span> Current KC <b>${currentKC.toLocaleString()} KC</b>`;
    
    renderChart(results.curveData, results, currentKC);
    document.getElementById("results").scrollIntoView({ behavior: 'smooth' });
};

/**
 * Renders the probability distribution chart.
 * Uses a non-linear X-axis to maintain readability of the primary bell curve 
 * while still visualizing the extreme "dry" tails inherent to OSRS drop mechanics.
 * @param {Array<Object>} data - Downsampled curve array {x, pmf, cdf}.
 * @param {Object} stats - Statistical milestones (mean, median, modeKC).
 * @param {number} userKC - User's target kill count.
 */
function renderChart(data, stats, userKC) {
    const ctx = document.getElementById('distributionChart').getContext('2d');
    
    if (chartInstance) chartInstance.destroy();

    // x^0.4 power transformation compresses the right side of the chart.
    const transform = (x) => Math.pow(x, 0.4);
    const reverse = (y) => Math.pow(y, 1 / 0.4);
    
    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);

    // Solvers.js downsamples the dataset to ~2500 points for performance.
    // Exact milestone coordinates might be skipped, so we snap to the nearest plotted physical coordinate.
    const getClosest = (targetX) => {
        return data.reduce((prev, curr) => 
            Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev
        );
    };

    const modeY = getClosest(stats.modeKC).pmf;
    const medianY = getClosest(stats.median).cdf;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Luck (PMF)',
                    data: data.map(d => ({ x: transform(d.x), y: d.pmf, rawX: d.x })),
                    borderColor: COLORS.mode,
                    borderWidth: 3,
                    pointRadius: 0,
                    yAxisID: 'yPMF',
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Progress (CDF)',
                    data: data.map(d => ({ x: transform(d.x), y: d.cdf, rawX: d.x })),
                    borderColor: COLORS.progress,
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: 'yCDF',
                    tension: 0.4,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            animation: false, 
            interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
            scales: {
                x: {
                    type: 'linear', 
                    min: transform(1), 
                    max: transform(xMaxRaw),
                    grid: { color: 'rgba(68, 64, 60, 0.2)', drawTicks: false },
                    ticks: {
                        color: '#a8a29e',
                        font: { size: 10, weight: 700 },
                        maxTicksLimit: 8,
                        callback: function(val) {
                            let realKC = reverse(val);
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
            },
            plugins: {
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
                        modePoint: { type: 'point', xValue: transform(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: COLORS.mode, borderColor: '#fff', borderWidth: 2, radius: 5 },
                        medianPoint: { type: 'point', xValue: transform(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: COLORS.progress, borderColor: '#fff', borderWidth: 2, radius: 5 },
                        mean: {
                            type: 'line', xMin: transform(stats.mean), xMax: transform(stats.mean),
                            borderColor: 'rgba(249, 115, 22, 0.8)', borderWidth: 2, borderDash: [5,5],
                            label: { display: false, content: 'MEAN', position: 'start', backgroundColor: 'rgba(249, 115, 22, 0.1)', color: 'rgba(249, 115, 22, 1)', font: { size: 10, weight: 800 } }
                        },
                        user: {
                            type: 'line', xMin: transform(userKC), xMax: transform(userKC),
                            borderColor: COLORS.user, borderWidth: 2, borderDash: [6, 4], shadowBlur: 10, shadowColor: COLORS.user
                        }
                    }
                }
            }
        }
    });
}