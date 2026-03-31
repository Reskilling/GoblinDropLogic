// ==========================================
// OSRS DROP RATE CALCULATOR - MATRIX ENGINE
// ==========================================

/**
 * Specialized Hypergeometric Engine for Barrows.
 * Barrows enforces intra-chest duplicate protection (you cannot get the same item twice in one chest).
 * To model this, we calculate the transition probabilities of a single loot roll, 
 * then compound it 7 times into a single atomic "chest" transition matrix.
 * * @param {number} targetCount - Total number of unique Barrows items selected.
 * @returns {Array<Float64Array>} A 2D transition matrix for a full chest opening.
 */
export function createBarrowsMatrix(targetCount) {
    const size = targetCount + 1;
    const matrix = Array.from({length: size}, () => new Float64Array(size));
    
    // Base rate assuming all 6 brothers are killed: 1 / (450 - (58 * 6))
    const pUniqueTable = 1 / 102; 
    const TOTAL_BARROWS_ITEMS = 24;

    for (let i = 0; i < size; i++) {
        if (i === targetCount) {
            matrix[i][i] = 1.0; 
            continue;
        }
        
        const pNew = pUniqueTable * ((targetCount - i) / TOTAL_BARROWS_ITEMS);
        const pDupe = pUniqueTable * (i / TOTAL_BARROWS_ITEMS);
        const pNothing = 1 - pUniqueTable; 
        
        matrix[i][i] = pNothing + pDupe;
        
        if (i + 1 < size) {
            matrix[i][i + 1] = pNew;
        }
    }

    let chestMatrix = matrix;
    
    // Compound the matrix for the remaining 6 rolls (7 total rolls for 6 brothers).
    // This implicitly handles the conditional probability of intra-chest duplicate protection.
    for (let r = 1; r < 7; r++) {
        const nextMatrix = Array.from({length: size}, () => new Float64Array(size));
        for (let i = 0; i < size; i++) {
            for (let j = i; j < size; j++) {
                if (chestMatrix[i][j] === 0) continue;
                for (let k = j; k <= Math.min(j + 1, targetCount); k++) {
                    if (matrix[j][k] === 0) continue;
                    nextMatrix[i][k] += chestMatrix[i][j] * matrix[j][k];
                }
            }
        }
        chestMatrix = nextMatrix;
    }

    return chestMatrix;
}

/**
 * The Master Markov Chain.
 * Models combined probability spaces for mutually exclusive items (Main) 
 * and independent concurrent drops (Tertiary/Pets).
 * * @param {Array<Object>} selectedItems - Items to track in the simulation.
 * @param {number} [rollCount=1] - Number of mutually exclusive loot rolls per KC.
 * @returns {Array<Float64Array>} Transition matrix representing a single KC.
 */
export function createMasterMatrix(selectedItems, rollCount = 1) {
    const groups = [];
    
    // Items requiring multiple pieces (like DT2 vestiges) must occupy their own 
    // dimension in the state space to track sequential progress.
    // Standard items with identical rates are merged into "Coupon Collector" buckets.
    selectedItems.forEach(item => {
        const piecesNeeded = item.pieces || 1;
        
        if (piecesNeeded > 1) {
            groups.push({ type: item.type, rate: item.rate, target: piecesNeeded, isSequential: true });
        } else {
            let found = false;
            for (const g of groups) {
                if (!g.isSequential && g.type === item.type && g.rate === item.rate) {
                    g.target++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                groups.push({ type: item.type, rate: item.rate, target: 1, isSequential: false });
            }
        }
    });

    const mainGroups = [];
    const tertGroups = [];
    groups.forEach((g, idx) => {
        if (g.type === "main") mainGroups.push({...g, index: idx});
        else tertGroups.push({...g, index: idx});
    });

    // Flatten the multi-dimensional state space into a 1D array for mathematical operations.
    let totalStates = 1;
    const multipliers = [];
    for (let i = 0; i < groups.length; i++) {
        multipliers.push(totalStates);
        totalStates *= (groups[i].target + 1);
    }

    const matrix = Array.from({length: totalStates}, () => new Float64Array(totalStates));

    const getIndex = (counts) => {
        let index = 0;
        for (let i = 0; i < counts.length; i++) {
            index += counts[i] * multipliers[i];
        }
        return index;
    };

    const getCounts = (index) => {
        const counts = [];
        let temp = index;
        for (let i = 0; i < groups.length; i++) {
            const size = groups[i].target + 1;
            counts.push(temp % size);
            temp = Math.floor(temp / size);
        }
        return counts;
    };

    for (let s = 0; s < totalStates; s++) {
        const counts = getCounts(s);
        if (counts.every((c, i) => c === groups[i].target)) {
            matrix[s][s] = 1.0; 
            continue;
        }

        let stateProbs = new Float64Array(totalStates);
        stateProbs[s] = 1.0;

        // Apply mutually exclusive rolls. An item from MainGroup A prevents receiving an item from MainGroup B.
        for (let r = 0; r < rollCount; r++) {
            let nextRoll = new Float64Array(totalStates);
            for (let curr_s = 0; curr_s < totalStates; curr_s++) {
                if (stateProbs[curr_s] === 0) continue;
                
                const currCounts = getCounts(curr_s);
                let pHitAnyMain = 0;

                for (const mg of mainGroups) {
                    const count = currCounts[mg.index];
                    if (count < mg.target) {
                        const effectiveRate = mg.isSequential ? mg.rate : (mg.target - count) * mg.rate;
                        const nextCounts = [...currCounts];
                        nextCounts[mg.index]++;
                        
                        nextRoll[getIndex(nextCounts)] += stateProbs[curr_s] * effectiveRate;
                        pHitAnyMain += effectiveRate;
                    }
                }
                nextRoll[curr_s] += stateProbs[curr_s] * (1 - pHitAnyMain);
            }
            stateProbs = nextRoll;
        }

        // Apply independent rolls. Tertiary items roll concurrently without diminishing each other.
        for (const tg of tertGroups) {
            let nextProbs = new Float64Array(totalStates);
            for (let mid_s = 0; mid_s < totalStates; mid_s++) {
                if (stateProbs[mid_s] === 0) continue;
                
                const midCounts = getCounts(mid_s);
                const count = midCounts[tg.index];

                if (count < tg.target) {
                    const effectiveRate = tg.isSequential ? tg.rate : (tg.target - count) * tg.rate;
                    nextProbs[mid_s] += stateProbs[mid_s] * (1 - effectiveRate);
                    
                    const nextCounts = [...midCounts];
                    nextCounts[tg.index]++;
                    nextProbs[getIndex(nextCounts)] += stateProbs[mid_s] * effectiveRate;
                } else {
                    nextProbs[mid_s] += stateProbs[mid_s];
                }
            }
            stateProbs = nextProbs;
        }

        for (let final_s = 0; final_s < totalStates; final_s++) {
            if (stateProbs[final_s] > 0) matrix[s][final_s] = stateProbs[final_s];
        }
    }
    return matrix;
}

/**
 * Specialized Engine for Moons of Peril.
 * Models independent pools that enforce global duplicate protection.
 * Note: This accurately predicts full-set completion milestones, but partial set 
 * selections represent finding "ANY X pieces" rather than specific targeted items.
 * * @param {Array<Object>} selectedItems - Moons items with a valid 'pool' attribute.
 * @returns {Array<Float64Array>} Transition matrix for opening one Moons chest.
 */
export function createMoonsMatrix(selectedItems) {
    const groups = [];
    
    selectedItems.forEach(item => {
        const found = groups.find(g => g.pool === item.pool);
        if (found) {
            found.target++;
        } else {
            groups.push({ pool: item.pool, rate: item.rate, target: 1, index: groups.length });
        }
    });

    let totalStates = 1;
    const multipliers = [];
    for (let i = 0; i < groups.length; i++) {
        multipliers.push(totalStates);
        totalStates *= (groups[i].target + 1);
    }

    const matrix = Array.from({length: totalStates}, () => new Float64Array(totalStates));

    const getIndex = (counts) => {
        let index = 0;
        for (let i = 0; i < counts.length; i++) {
            index += counts[i] * multipliers[i];
        }
        return index;
    };

    const getCounts = (index) => {
        const counts = [];
        let temp = index;
        for (let i = 0; i < groups.length; i++) {
            const size = groups[i].target + 1;
            counts.push(temp % size);
            temp = Math.floor(temp / size);
        }
        return counts;
    };

    for (let s = 0; s < totalStates; s++) {
        const counts = getCounts(s);
        if (counts.every((c, i) => c === groups[i].target)) {
            matrix[s][s] = 1.0; 
            continue;
        }

        let stateProbs = new Float64Array(totalStates);
        stateProbs[s] = 1.0;

        // Moons rolls are siloed by boss pool. We process exactly one independent 
        // check per active boss pool concurrently, simulating a 3-boss KC.
        for (const g of groups) {
            let nextProbs = new Float64Array(totalStates);
            for (let mid_s = 0; mid_s < totalStates; mid_s++) {
                if (stateProbs[mid_s] === 0) continue;
                
                const midCounts = getCounts(mid_s);
                const count = midCounts[g.index];

                if (count < g.target) {
                    const pSuccess = g.rate; 
                    
                    nextProbs[mid_s] += stateProbs[mid_s] * (1 - pSuccess);
                    
                    const nextCounts = [...midCounts];
                    nextCounts[g.index]++;
                    nextProbs[getIndex(nextCounts)] += stateProbs[mid_s] * pSuccess;
                } else {
                    nextProbs[mid_s] += stateProbs[mid_s];
                }
            }
            stateProbs = nextProbs;
        }

        for (let final_s = 0; final_s < totalStates; final_s++) {
            if (stateProbs[final_s] > 0) matrix[s][final_s] = stateProbs[final_s];
        }
    }
    return matrix;
}