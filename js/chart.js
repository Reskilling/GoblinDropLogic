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
let libraryPromise = null;

// Pinned files with integrity hashes: the browser refuses them if the CDN copy ever changes
const LIBRARY_SCRIPTS = [
    { src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js', integrity: 'sha384-dug+JxfBvklEQdJ4AYuBBAIScUz0bVN73xpy273gcAwHjb3qI0fXmuYNaNfdyYJG' },
    { src: 'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js', integrity: 'sha384-oNtu+d18330MVFpltUTve1DatxCkkctlpA2AC3GulbVFOSqhHdDat3qHse/Lbuek' }
];

function loadScript({ src, integrity }) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.integrity = integrity;
        script.crossOrigin = 'anonymous';
        script.async = false; // download in parallel, but run in order: the plugin needs Chart first
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
    });
}

/**
 * Chart.js is only needed once a boss is chosen, so pages that never chart don't download it.
 * Starts the download once; resolves true when ready, false if it couldn't load (e.g. the CDN was blocked).
 */
export function loadChartLibrary() {
    libraryPromise ??= Promise.all(LIBRARY_SCRIPTS.map(loadScript)).then(() => true, () => false);
    return libraryPromise;
}

function readColors() {
    const style = getComputedStyle(document.documentElement);
    const css = (name) => style.getPropertyValue(name).trim();

    return {
        mode: css('--stat-mode'),
        modeArea: css('--stat-mode-area'),
        progress: css('--stat-progress'),
        mean: css('--stat-mean'),
        user: css('--stat-user'),
        text: css('--text-dim'),
        marker: css('--text'),
        border: css('--border'),
        font: css('--font-body')
    };
}

// Round KC values for the axis, most preferred first: powers of ten, then fives, then twos
const POWERS_OF_TEN = [1, 10, 100, 1000, 10000, 100000, 1000000];
const NICE_KCS = [...POWERS_OF_TEN, ...POWERS_OF_TEN.map(kc => kc * 5), ...POWERS_OF_TEN.map(kc => kc * 2)];
const MIN_TICK_GAP_PX = 44; // so labels never crowd, even on a phone

/** Replaces the default ticks with round KCs, keeping only those far enough from ones already placed. */
function useNiceKcTicks(scale) {
    const minGap = (scale.max - scale.min) * MIN_TICK_GAP_PX / scale.chart.width;
    const picked = [];
    for (const kc of NICE_KCS) {
        const x = transformX(kc);
        if (x <= scale.max && picked.every(p => Math.abs(x - p) >= minGap)) picked.push(x);
    }
    scale.ticks = picked.sort((a, b) => a - b).map(value => ({ value }));
}

const formatKc = (value) => {
    const kc = Math.round(reverseX(value));
    if (kc >= 1000000) return `${kc / 1000000}M`;
    return kc >= 1000 ? `${kc / 1000}k` : String(kc);
};

// Short share for a chart label: "16%", with "<1%" and ">99%" so a real chance never shows as 0% or 100%
function formatShare(p) {
    if (p > 0 && p < 0.01) return '<1%';
    if (p > 0.99 && p < 1) return '>99%';
    return `${Math.round(p * 100)}%`;
}

// `area` shades under the line, so the two curves stay distinguishable without colour
function createDataset(label, data, yKey, color, yAxisID, borderWidth, area = null) {
    return {
        label,
        data: data.map(d => ({ x: transformX(d.x), y: d[yKey], rawX: d.x })),
        borderColor: color,
        backgroundColor: area ?? color,
        borderWidth,
        pointRadius: 0,
        yAxisID,
        tension: 0.2,
        cubicInterpolationMode: 'monotone',
        fill: area ? 'origin' : false,
        pointStyle: area ? 'rect' : 'line'
    };
}

function getScales(xMaxRaw, colors) {
    const axisTitle = (text, color = colors.text) => ({ display: true, text, color, font: { size: 12, weight: 600 } });

    return {
        x: {
            type: 'linear',
            min: transformX(1),
            max: transformX(xMaxRaw),
            title: axisTitle('Kill count (early kills spread out)'),
            grid: { color: 'rgba(68, 64, 60, 0.2)', drawTicks: false },
            afterBuildTicks: useNiceKcTicks,
            ticks: { color: colors.text, font: { size: 12, weight: 600 }, callback: formatKc }
        },
        // Headroom so the mode marker at the peak isn't clipped
        yPMF: { display: false, beginAtZero: true, grace: '15%' },
        yCDF: {
            display: true,
            position: 'right',
            min: 0,
            max: 1,
            title: axisTitle('Done by this KC', colors.progress),
            grid: { display: false },
            ticks: { callback: v => `${(v * 100).toFixed(0)}%`, color: colors.progress, font: { size: 12, weight: 600 } }
        }
    };
}

const textLabel = (colors) => ({
    color: colors.marker,
    backgroundColor: 'rgba(28, 25, 23, 0.9)',
    font: { size: 12, weight: 600 },
    padding: { x: 6, y: 3 },
    borderRadius: 4
});

// A label beside a marker, so its meaning doesn't depend on matching colours to a legend.
// `side` is where the label sits relative to the marker.
const markerLabel = (kc, y, yScaleID, content, colors, side = 'right') => ({
    type: 'label', xValue: transformX(kc), yValue: y, yScaleID, content,
    position: { x: side === 'right' ? 'start' : 'end', y: 'center' }, xAdjust: side === 'right' ? 12 : -12, ...textLabel(colors)
});

const marker = (kc, y, yScaleID, color, colors) => ({
    type: 'point', xValue: transformX(kc), yValue: y, yScaleID, backgroundColor: color, borderColor: colors.marker, borderWidth: 2, radius: 5
});

// Narrow charts drop the numbers from labels (the stat rows list them) so the labels don't overlap
const COMPACT_WIDTH = 500;

function getPlugins(stats, userKC, modeY, medianY, colors, { xMaxRaw, isCompact }) {
    const mean = `${Math.round(stats.mean).toLocaleString()}${stats.reachedLimit ? '+' : ''}`;
    const named = (name, value) => (isCompact ? name : `${name} ${value}`);

    // The player's dot sits on the blue curve; its label goes left of the dot (clear of the Median label
    // to its right) unless the dot is near the left edge. A KC past the end of the curve pins to the right edge.
    const shownKC = Math.min(userKC, xMaxRaw);
    const userShare = formatShare(stats.targetP);
    const userSide = (transformX(shownKC) - transformX(1)) / (transformX(xMaxRaw) - transformX(1)) < 0.25 ? 'right' : 'left';
    const user = userKC >= 1 ? {
        userPoint: marker(shownKC, stats.targetP, 'yCDF', colors.user, colors),
        // Near 100% the dot sits on the top edge, so its label drops just below it
        userLabel: { ...markerLabel(shownKC, stats.targetP, 'yCDF', `You · ${userShare}`, colors, userSide), yAdjust: stats.targetP > 0.92 ? 16 : 0 }
    } : {};

    return {
        legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { color: colors.text, usePointStyle: true, boxWidth: 24, font: { size: 13, weight: 600 } }
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
                        ? ` Finish on this KC: ~1 in ${Math.round(1 / c.raw.y).toLocaleString()}`
                        : ` Done by this KC: ${(c.raw.y * 100).toFixed(2)}%`;
                }
            }
        },
        annotation: {
            clip: false, // markers on the plot's edge (e.g. a KC past the curve) draw whole
            annotations: {
                modePoint: marker(stats.modeKC, modeY, 'yPMF', colors.mode, colors),
                medianPoint: marker(stats.median, medianY, 'yCDF', colors.progress, colors),
                modeLabel: markerLabel(stats.modeKC, modeY, 'yPMF', named('Mode', stats.modeKC.toLocaleString()), colors),
                medianLabel: markerLabel(stats.median, medianY, 'yCDF', named('Median', stats.median.toLocaleString()), colors),
                mean: {
                    type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean), borderColor: colors.mean, borderWidth: 2, borderDash: [5, 5],
                    label: { display: true, content: named('Mean', mean), position: 'start', ...textLabel(colors) }
                },
                // At 0 KC the line would sit left of the axis
                userLine: {
                    type: 'line', xMin: transformX(shownKC), xMax: transformX(shownKC), borderColor: colors.user, borderWidth: 2, display: userKC >= 1
                },
                ...user
            }
        }
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ x: number, pmf: number, cdf: number }[]} data
 * @param {{ modeKC: number, median: number, mean: number, targetP: number, reachedLimit: boolean }} stats
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

    // The axis ends where the curve reaches 100%, however high the player's KC; extra kills don't add empty space
    const xMaxRaw = data[data.length - 1].x;
    const modeY = data.find(d => d.x === stats.modeKC)?.pmf || 0;
    const medianY = data.find(d => d.x === stats.median)?.cdf || 0;

    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                createDataset('Finish on this KC', data, 'pmf', colors.mode, 'yPMF', 3, colors.modeArea),
                createDataset('Done by this KC', data, 'cdf', colors.progress, 'yCDF', 2)
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: getScales(xMaxRaw, colors),
            plugins: getPlugins(stats, userKC, modeY, medianY, colors, { xMaxRaw, isCompact: canvas.parentElement.clientWidth < COMPACT_WIDTH })
        }
    });
    return true;
}
