// ==========================================
// OSRS DROP RATE CALCULATOR - SIMULATION
// ==========================================

const SIM_CONFIG = {
    MAX_ITERATIONS: 1000000,       
    PRUNE_THRESHOLD: 1e-12,        
    COMPLETION_THRESHOLD: 0.99999, 
    TAIL_MULTIPLIER: 1.5,          
    MAX_CHART_POINTS: 2500,        
    VISUAL_SKEW_POWER: 2.5         
};

export function buildChartData(historyPMF, historyCDF, finalKC, targetKC, modeKC, median) {
    const curveData = [];
    const includedKCs = new Set(); // Using a Set gives us O(1) lookups to avoid duplicate points

    // Helper function to keep our data extraction DRY
    const addDataPoint = (kc) => {
        if (!includedKCs.has(kc) && kc > 0 && kc <= finalKC) {
            curveData.push({ x: kc, pmf: historyPMF[kc], cdf: historyCDF[kc] });
            includedKCs.add(kc);
        }
    };

    if (finalKC <= SIM_CONFIG.MAX_CHART_POINTS) {
        // If the dataset is small enough, include every single kill count
        for (let kc = 1; kc <= finalKC; kc++) {
            addDataPoint(kc);
        }
    } else {
        // For massive datasets, sample points logarithmically to prioritize visual fidelity 
        // at the beginning of the curve where the most dramatic changes happen
        for (let i = 0; i <= SIM_CONFIG.MAX_CHART_POINTS; i++) {
            const progress = i / SIM_CONFIG.MAX_CHART_POINTS;
            let skewedKC = Math.round(Math.pow(progress, SIM_CONFIG.VISUAL_SKEW_POWER) * finalKC);
            
            addDataPoint(Math.max(1, skewedKC));
        }
    }

    // Guarantee our key statistical milestones are rendered on the chart exactly
    const milestones = [targetKC, modeKC, median];
    milestones.forEach(addDataPoint);

    // Sorting is necessary because the milestones might have been injected out of numerical order
    curveData.sort((a, b) => a.x - b.x);

    return curveData;
}

export function runSimulation(sparseMatrix) {
    const size = sparseMatrix.length;
    
    // The final state represents having acquired all requested items
    const absorbingState = size - 1; 
    
    let stateVector = new Float64Array(size);
    let nextStateVector = new Float64Array(size);
    
    // We start at 100% probability of having 0 items (state 0)
    stateVector[0] = 1.0; 

    let prevCDF = 0;
    let mean = 0;
    let median = 0;
    let modeKC = 0;
    let maxPMF = 0;

    // Start arrays with a 0-index buffer so kill counts perfectly align with their array index
    const historyCDF = [0];
    const historyPMF = [0];
    let finalKC = 0;

    for (let kc = 1; kc < SIM_CONFIG.MAX_ITERATIONS; kc++) {
        nextStateVector.fill(0); 
        let activeTransientStates = 0;

        // We only iterate through transient (incomplete) states. 
        for (let currentState = 0; currentState < absorbingState; currentState++) {
            const currentProb = stateVector[currentState];
            
            // Prune microscopic probabilities. This massively speeds up the long-tail 
            // calculations without significantly affecting final accuracy.
            if (currentProb < SIM_CONFIG.PRUNE_THRESHOLD) continue; 
            
            activeTransientStates++;

            // Distribute the current state's probability to its next potential states
            const transitions = sparseMatrix[currentState];
            for (let i = 0; i < transitions.length; i++) {
                const trans = transitions[i];
                nextStateVector[trans.target] += currentProb * trans.prob;
            }
        }

        // Manually carry over the cumulative probability of already being completely finished.
        // We do this manually because we skipped the absorbing state in the loop above for performance.
        nextStateVector[absorbingState] += stateVector[absorbingState]; 
        
        // Swap buffers cleanly using ES6 array destructuring (zero allocation overhead)
        [stateVector, nextStateVector] = [nextStateVector, stateVector];
        
        const currCDF = stateVector[absorbingState];
        const currPMF = currCDF - prevCDF;
        
        historyCDF.push(currCDF);
        historyPMF.push(currPMF);

        // Accumulate expected value (mean)
        mean += kc * currPMF;

        // Track the most likely individual kill count (mode)
        if (currPMF > maxPMF) {
            maxPMF = currPMF;
            modeKC = kc;
        }

        // Lock in the 50% completion threshold once we cross it
        if (!median && currCDF >= 0.5) {
            median = kc;
        }

        prevCDF = currCDF;
        finalKC = kc;
        
        // Break Condition Optimization: Stop calculating if we've basically reached 100% completion 
        // AND have passed the tail multiplier, OR if there's literally zero probability left in incomplete states.
        const isEffectivelyComplete = currCDF > SIM_CONFIG.COMPLETION_THRESHOLD && kc > mean * SIM_CONFIG.TAIL_MULTIPLIER;
        const isZeroProbabilityRemaining = activeTransientStates === 0;

        if (isEffectivelyComplete || isZeroProbabilityRemaining) {
            break;
        }
    }

    return { 
        mean, 
        median: median || 0, 
        modeKC, 
        maxPMF, 
        historyCDF, 
        historyPMF, 
        finalK: finalKC // Keeping the original key name 'finalK' to avoid breaking consumer destructuring
    };
}