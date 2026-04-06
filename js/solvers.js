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

export function buildChartData(historyPMF, historyCDF, finalK, targetKC, modeKC, median) {
    const curveData = [];
    
    if (finalK <= SIM_CONFIG.MAX_CHART_POINTS) {
        for (let k = 1; k <= finalK; k++) {
            curveData.push({ x: k, pmf: historyPMF[k], cdf: historyCDF[k] });
        }
    } else {
        let lastK = -1;
        
        for (let i = 0; i <= SIM_CONFIG.MAX_CHART_POINTS; i++) {
            const progress = i / SIM_CONFIG.MAX_CHART_POINTS;
            let k = Math.round(Math.pow(progress, SIM_CONFIG.VISUAL_SKEW_POWER) * finalK);
            
            k = Math.max(1, Math.min(k, finalK)); 
            
            if (k !== lastK) {
                curveData.push({ x: k, pmf: historyPMF[k], cdf: historyCDF[k] });
                lastK = k;
            }
        }
    }

    const milestones = [targetKC, modeKC, median].filter(m => m > 0 && m <= finalK);
    
    milestones.forEach(m => {
        if (!curveData.some(d => d.x === m)) {
            curveData.push({ x: m, pmf: historyPMF[m], cdf: historyCDF[m] });
        }
    });

    curveData.sort((a, b) => a.x - b.x);

    return curveData;
}

export function runSimulation(sparseMatrix) {
    const size = sparseMatrix.length;
    const absorbingState = size - 1; 
    
    let stateVector = new Float64Array(size);
    let nextStateVector = new Float64Array(size);
    stateVector[0] = 1.0; 

    let prevCDF = 0, mean = 0, median = 0, modeKC = 0, maxPMF = 0;

    const historyCDF = [0];
    const historyPMF = [0];
    let finalK = 0;

    for (let k = 1; k < SIM_CONFIG.MAX_ITERATIONS; k++) {
        nextStateVector.fill(0); 
        let activeTransientStates = 0;

        for (let currentState = 0; currentState < absorbingState; currentState++) {
            const currentProb = stateVector[currentState];
            
            if (currentProb < SIM_CONFIG.PRUNE_THRESHOLD) continue; 
            
            activeTransientStates++;

            const transitions = sparseMatrix[currentState];
            for (let i = 0; i < transitions.length; i++) {
                nextStateVector[transitions[i].target] += currentProb * transitions[i].prob;
            }
        }

        nextStateVector[absorbingState] += stateVector[absorbingState]; 
        
        // Destructuring assignment swaps buffers with zero temporary variable allocations
        [stateVector, nextStateVector] = [nextStateVector, stateVector];
        
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
        
        if ((currCDF > SIM_CONFIG.COMPLETION_THRESHOLD && k > mean * SIM_CONFIG.TAIL_MULTIPLIER) || activeTransientStates === 0) {
            break;
        }
    }

    return { mean, median: median || 0, modeKC, maxPMF, historyCDF, historyPMF, finalK };
}