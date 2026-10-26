/**
 * @file chart.js
 * Renders the drop distribution: chance of finishing on each KC (PMF) and by each KC (CDF).
 * Colours come from the --stat-* CSS variables so the chart and the stat rows always match.
 */

// The x-axis is drawn on a power scale so the busy start of the curve isn't squashed by the long tail
const X_AXIS_POWER = 0.4;
const transformX = (kc) => Math.pow(kc, X_AXIS_POWER);
const reverseX = (x) => Math.pow(x, 1 / X_AXIS_POWER);

let chartInstance = null;
let defaultsApplied = false;

function readColors() {
    const style = getComputedStyle(document.documentElement);
    const css = (name) => style.getPropertyValue(name).trim();

    return {
        mode: css('--stat-mode'),
        progress: css('--stat-progress'),
        mean: css('--stat-mean'),
        user: css('--stat-user'),
        text: css('--text-dim'),
        marker: css('--text'),
        border: css('--border'),
        font: css('--font-body')
    };
}

function roundedKcLabel(value) {
    let kc = reverseX(value);
    if (kc < 1) return null;

    if (kc > 1000) kc = Math.round(kc / 100) * 100;
    else if (kc > 100) kc = Math.round(kc / 10) * 10;
    else kc = Math.round(kc);

    return kc.toLocaleString();
}

// On short ranges neighbouring ticks round to the same KC; only label the first of each
function formatAxisTick(value, index, ticks) {
    const label = roundedKcLabel(value);
    return index > 0 && label === roundedKcLabel(ticks[index - 1].value) ? null : label;
}

function createDataset(label, data, yKey, color, yAxisID, borderWidth) {
    return {
        label,
        data: data.map(d => ({ x: transformX(d.x), y: d[yKey], rawX: d.x })),
        borderColor: color,
        backgroundColor: color,
        borderWidth,
        pointRadius: 0,
        yAxisID,
        tension: 0.2,
        cubicInterpolationMode: 'monotone',
        fill: false
    };
}

function getScales(xMaxRaw, colors) {
    const axisTitle = (text, color = colors.text) => ({ display: true, text, color, font: { size: 12, weight: 600 } });

    return {
        x: {
            type: 'linear',
            min: transformX(1),
            max: transformX(xMaxRaw),
            title: axisTitle('Kill count (compressed scale)'),
            grid: { color: 'rgba(68, 64, 60, 0.2)', drawTicks: false },
            ticks: { color: colors.text, font: { size: 12, weight: 600 }, maxTicksLimit: 8, callback: formatAxisTick }
        },
        // Headroom so the mode marker at the peak isn't clipped
        yPMF: { display: false, beginAtZero: true, grace: '8%' },
        yCDF: {
            display: true,
            position: 'right',
            min: 0,
            max: 1,
            title: axisTitle('Finished by this KC', colors.progress),
            grid: { display: false },
            ticks: { callback: v => `${(v * 100).toFixed(0)}%`, color: colors.progress, font: { size: 12, weight: 600 } }
        }
    };
}

function getPlugins(stats, userKC, modeY, medianY, colors) {
    return {
        legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { color: colors.text, usePointStyle: true, pointStyle: 'line', boxWidth: 24, font: { size: 13, weight: 600 } }
        },
        tooltip: {
            backgroundColor: 'rgba(12, 10, 9, 0.95)',
            borderColor: colors.border,
            borderWidth: 1,
            padding: 12,
            titleFont: { weight: 700, size: 14 },
            bodyFont: { weight: 500, size: 13 },
            callbacks: {
                title: items => `KC: ${items[0].raw.rawX.toLocaleString()}`,
                label: c => {
                    if (c.raw.y === 0) return null;
                    return c.datasetIndex === 0
                        ? ` Finishing on exactly this KC: ~1/${Math.round(1 / c.raw.y).toLocaleString()}`
                        : ` Finished by this KC: ${(c.raw.y * 100).toFixed(2)}%`;
                }
            }
        },
        annotation: {
            annotations: {
                modePoint: { type: 'point', xValue: transformX(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: colors.mode, borderColor: colors.marker, borderWidth: 2, radius: 5 },
                medianPoint: { type: 'point', xValue: transformX(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: colors.progress, borderColor: colors.marker, borderWidth: 2, radius: 5 },
                mean: { type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean), borderColor: colors.mean, borderWidth: 2, borderDash: [5, 5] },
                user: { type: 'line', xMin: transformX(userKC), xMax: transformX(userKC), borderColor: colors.user, borderWidth: 2, borderDash: [6, 4] }
            }
        }
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ x: number, pmf: number, cdf: number }[]} data
 * @param {{ modeKC: number, median: number, mean: number }} stats
 * @param {number} userKC
 * @returns {boolean} false when Chart.js isn't available (e.g. the CDN was blocked)
 */
export function renderChart(canvas, data, stats, userKC) {
    if (typeof Chart === 'undefined') return false;
    if (chartInstance) chartInstance.destroy();

    const colors = readColors();
    if (!defaultsApplied) {
        Chart.defaults.font.family = colors.font;
        Chart.defaults.color = colors.text;
        defaultsApplied = true;
    }

    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);
    const modeY = data.find(d => d.x === stats.modeKC)?.pmf || 0;
    const medianY = data.find(d => d.x === stats.median)?.cdf || 0;

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                createDataset('Chance of finishing on this KC', data, 'pmf', colors.mode, 'yPMF', 3),
                createDataset('Chance of having finished by this KC', data, 'cdf', colors.progress, 'yCDF', 2)
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: getScales(xMaxRaw, colors),
            plugins: getPlugins(stats, userKC, modeY, medianY, colors)
        }
    });
    return true;
}
