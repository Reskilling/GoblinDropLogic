// ==========================================
// OSRS DROP RATE CALCULATOR - SIMULATION
// ==========================================

// Centralizing our performance and display thresholds
const SIM_CONFIG = {
    MAX_ITERATIONS: 1000000,       // Prevents main-thread lockup on impossible matrices
    PRUNE_THRESHOLD: 1e-12,        // Bypasses underflow calculations on dead states
    COMPLETION_THRESHOLD: 0.99999, // Our effective "100% completion" mark
    TAIL_MULTIPLIER: 1.5,          // How far past the mean we want to draw the chart tail
    MAX_CHART_POINTS: 2500,        // Max canvas coordinates before Chart.js stutters
    VISUAL_SKEW_POWER: 2.5         // Used to distribute chart points evenly across our skewed UI graph
};

/**
 * Compress thousands of simulation iterations into a digestible format for Chart.js.
 * Extracted and exported so app.js can re-render charts instantly from cache without re-running math.
 */
export function buildChartData(historyPMF, historyCDF, finalK, targetKC, modeKC, median) {
    const curveData = [];
    
    if (finalK <= SIM_CONFIG.MAX_CHART_POINTS) {
        // Short grind: We don't need to downsample.
        // Plot every single KC for maximum visual fidelity.
        for (let k = 1; k <= finalK; k++) {
            curveData.push({ x: k, pmf: historyPMF[k], cdf: historyCDF[k] });
        }
    } else {
        // Long grind: We must downsample to prevent browser lag.
        // Since the UI scales the X-axis non-linearly (x^0.4) to stretch early KCs, 
        // we use the inverse (2.5) to sample. This prevents starving the peak of data points
        // which causes wavy Bezier artifacts on the final canvas.
        let lastK = -1;
        
        for (let i = 0; i <= SIM_CONFIG.MAX_CHART_POINTS; i++) {
            const progress = i / SIM_CONFIG.MAX_CHART_POINTS;
            let k = Math.round(Math.pow(progress, SIM_CONFIG.VISUAL_SKEW_POWER) * finalK);
            
            k = Math.max(1, Math.min(k, finalK)); // Clamp bounds just in case
            
            if (k !== lastK) {
                curveData.push({ x: k, pmf: historyPMF[k], cdf: historyCDF[k] });
                lastK = k;
            }
        }
    }

    // Ensure critical milestone KCs exist in the data so tooltips and annotations have exact points to snap to.
    const milestones = [targetKC, modeKC, median].filter(m => m > 0 && m <= finalK);
    
    milestones.forEach(m => {
        if (!curveData.some(d => d.x === m)) {
            curveData.push({ x: m, pmf: historyPMF[m], cdf: historyCDF[m] });
        }
    });

    // Milestones might have been inserted out of sequence, so we re-sort
    curveData.sort((a, b) => a.x - b.x);

    return curveData;
}

/**
 * Executes the Markov chain simulation to determine drop probability distributions.
 * Iteratively multiplies the state vector against the SPARSE transition matrix to simulate KC progression.
 * Returns the raw statistical arrays so the UI can cache and query them instantly.
 * @param {Array<Array<Object>>} sparseMatrix - The Adjacency List representing valid state transitions.
 * @returns {Object} Statistical milestones and raw distribution arrays.
 */
export function runSimulation(sparseMatrix) {
    const size = sparseMatrix.length;
    const absorbingState = size - 1; // The final state where all items are collected
    
    // Double-buffering state vectors. Allocating a new Float64Array millions of times 
    // inside a tight loop absolutely murders the garbage collector. 
    let stateVector = new Float64Array(size);
    let nextStateVector = new Float64Array(size);
    stateVector[0] = 1.0; // All simulations begin at State 0 (0 items collected) at 0 KC.

    let prevCDF = 0, mean = 0, median = 0, modeKC = 0, maxPMF = 0;

    // We use native JS arrays with push() here rather than pre-allocating a million-length TypedArray.
    const historyCDF = [0];
    const historyPMF = [0];
    let finalK = 0;

    for (let k = 1; k < SIM_CONFIG.MAX_ITERATIONS; k++) {
        nextStateVector.fill(0); // Wipe the buffer for the new iteration
        let activeTransientStates = 0;

        // Iterate only through transient (incomplete) states to save cycles.
        for (let currentState = 0; currentState < absorbingState; currentState++) {
            const currentProb = stateVector[currentState];
            
            // Prune dead states to skip unnecessary multiplication
            if (currentProb < SIM_CONFIG.PRUNE_THRESHOLD) continue; 
            
            activeTransientStates++;

            // SPARSE MATRIX MAGIC: We only iterate over the 2-5 transitions that actually 
            // exist for this state, entirely bypassing thousands of zero-probability lookups.
            const transitions = sparseMatrix[currentState];
            for (let i = 0; i < transitions.length; i++) {
                nextStateVector[transitions[i].target] += currentProb * transitions[i].prob;
            }
        }

        // Carry over the probability mass of the players who have already finished the grind
        nextStateVector[absorbingState] += stateVector[absorbingState]; 
        
        // Swap buffers for the next loop
        let temp = stateVector;
        stateVector = nextStateVector;
        nextStateVector = temp;
        
        const currCDF = stateVector[absorbingState];
        const currPMF = currCDF - prevCDF;
        
        historyCDF.push(currCDF);
        historyPMF.push(currPMF);

        mean += k * currPMF;

        if (currPMF > maxPMF) {
            maxPMF = currPMF;
            modeKC = k;
        }

        if (!median && currCDF >= 0.5) {
            median = k;
        }

        prevCDF = currCDF;
        finalK = k;
        
        // Auto-crop: Terminate early if we've basically hit 100% completion
        if ((currCDF > SIM_CONFIG.COMPLETION_THRESHOLD && k > mean * SIM_CONFIG.TAIL_MULTIPLIER) || activeTransientStates === 0) {
            break;
        }
    }

    return { mean, median: median || 0, modeKC, maxPMF, historyCDF, historyPMF, finalK };
}