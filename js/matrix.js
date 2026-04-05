// ==========================================
// OSRS DROP RATE CALCULATOR - MATRIX ENGINE
// ==========================================

const BARROWS = {
    UNIQUE_RATE: 1 / 102,
    TOTAL_ITEMS: 24,
    ROLLS_PER_CHEST: 7 // 1 base roll + 6 brothers
};

/**
 * Helper to manage multi-dimensional state spaces for our Markov chains.
 * Uses base-n arithmetic to encode and decode multi-dimensional counts 
 * directly from a single integer index.
 */
function buildStateSpace(groups) {
    let totalStates = 1;
    const multipliers = [];
    
    for (const g of groups) {
        multipliers.push(totalStates);
        totalStates *= (g.target + 1);
    }

    return {
        totalStates,
        // Extracts the specific item count from a flattened 1D matrix index
        getGroupCount: (stateIndex, groupIdx) => {
            const size = groups[groupIdx].target + 1;
            return Math.floor(stateIndex / multipliers[groupIdx]) % size;
        },
        // Incrementing a specific group's count simply means adding its multiplier
        getNextState: (stateIndex, groupIdx) => stateIndex + multipliers[groupIdx]
    };
}

/**
 * Specialized Hypergeometric Engine for Barrows.
 * Barrows enforces intra-chest duplicate protection. We calculate the transition 
 * probabilities of a single roll, then compound it 7 times into a "chest" matrix.
 * @param {number} targetCount - Total number of unique Barrows items selected.
 * @returns {Array<Array<Object>>} A SPARSE 2D transition matrix for a full chest opening.
 */
export function createBarrowsMatrix(targetCount) {
    const size = targetCount + 1;
    const baseMatrix = Array.from({length: size}, () => new Float64Array(size));

    // 1. Build the base probability matrix for a single roll
    for (let i = 0; i < size; i++) {
        if (i === targetCount) {
            baseMatrix[i][i] = 1.0; 
            continue;
        }
        
        const pNew = BARROWS.UNIQUE_RATE * ((targetCount - i) / BARROWS.TOTAL_ITEMS);
        
        // The chance to NOT progress encompasses dupes, blanks, AND unwanted Barrows items.
        baseMatrix[i][i] = 1 - pNew;
        
        if (i + 1 < size) {
            baseMatrix[i][i + 1] = pNew;
        }
    }

    // Double buffering for our matrix multiplication to prevent allocating a new 2D array every loop
    let currentMatrix = baseMatrix;
    let nextMatrix = Array.from({length: size}, () => new Float64Array(size));
    
    // 2. Compound the matrix for the remaining rolls.
    for (let r = 1; r < BARROWS.ROLLS_PER_CHEST; r++) {
        for (let i = 0; i < size; i++) nextMatrix[i].fill(0);
        
        for (let row = 0; row < size; row++) {
            for (let col = row; col < size; col++) {
                const currentProb = currentMatrix[row][col];
                if (currentProb === 0) continue;
                
                // Upper triangular constraint: you can't "lose" an item you already obtained
                for (let k = col; k <= Math.min(col + 1, targetCount); k++) {
                    const transProb = baseMatrix[col][k];
                    if (transProb > 0) {
                        nextMatrix[row][k] += currentProb * transProb;
                    }
                }
            }
        }
        
        let temp = currentMatrix;
        currentMatrix = nextMatrix;
        nextMatrix = temp;
    }

    // 3. Convert the final dense probability grid into an efficient Sparse Matrix format
    const sparseMatrix = Array.from({length: size}, () => []);
    
    for (let row = 0; row < size; row++) {
        for (let col = row; col < size; col++) {
            if (currentMatrix[row][col] > 0) {
                sparseMatrix[row].push({
                    target: col,
                    prob: currentMatrix[row][col]
                });
            }
        }
    }

    return sparseMatrix;
}

/**
 * The Master Markov Chain.
 * Models combined probability spaces for mutually exclusive items (Main) 
 * and independent concurrent drops (Tertiary/Pets).
 * @param {Array<Object>} selectedItems - Items to track in the simulation.
 * @param {number} [rollCount=1] - Number of mutually exclusive loot rolls per KC.
 * @returns {Array<Array<Object>>} A SPARSE Transition matrix representing a single KC.
 */
export function createMasterMatrix(selectedItems, rollCount = 1) {
    const groups = [];
    
    selectedItems.forEach(item => {
        const piecesNeeded = item.pieces || 1;
        
        if (item.pool) {
            // 1. SHARED SEQUENTIAL POOL (e.g., Abyssal Bludgeon)
            const found = groups.find(g => g.pool === item.pool);
            if (found) found.target++;
            else groups.push({ pool: item.pool, type: item.type, rate: item.rate, target: 1, isSequential: true });
            
        } else if (piecesNeeded > 1) {
            // 2. INDEPENDENT SEQUENTIAL PROGRESS (e.g., DT2 Vestiges)
            groups.push({ type: item.type, rate: item.rate, target: piecesNeeded, isSequential: true });
            
        } else {
            // 3. COUPON COLLECTOR BUCKETS (Standard Drops)
            const found = groups.find(g => !g.isSequential && !g.pool && g.type === item.type && g.rate === item.rate);
            if (found) found.target++;
            else groups.push({ type: item.type, rate: item.rate, target: 1, isSequential: false });
        }
    });

    groups.forEach((g, idx) => g.index = idx);
    
    const mainGroups = groups.filter(g => g.type === "main");
    const tertGroups = groups.filter(g => g.type !== "main");

    const { totalStates, getGroupCount, getNextState } = buildStateSpace(groups);
    
    // Create the Sparse Matrix foundation (an array of arrays, no zero-bloat)
    const sparseMatrix = Array.from({length: totalStates}, () => []);

    // Pre-allocate our transition buffers for internal calculation
    let currentProbs = new Float64Array(totalStates);
    let nextProbs = new Float64Array(totalStates);

    for (let stateIdx = 0; stateIdx < totalStates; stateIdx++) {
        // Absorbing state check: Are all item counts equal to their targets?
        let isAbsorbing = true;
        for (let i = 0; i < groups.length; i++) {
            if (getGroupCount(stateIdx, i) !== groups[i].target) {
                isAbsorbing = false;
                break;
            }
        }
        
        if (isAbsorbing) {
            sparseMatrix[stateIdx].push({ target: stateIdx, prob: 1.0 });
            continue;
        }

        currentProbs.fill(0);
        currentProbs[stateIdx] = 1.0;

        // Apply mutually exclusive rolls.
        for (let r = 0; r < rollCount; r++) {
            nextProbs.fill(0);
            
            for (let currState = 0; currState < totalStates; currState++) {
                const prob = currentProbs[currState];
                if (prob === 0) continue;
                
                let probHitAnyMain = 0;

                for (const mg of mainGroups) {
                    const count = getGroupCount(currState, mg.index);
                    if (count < mg.target) {
                        const effectiveRate = mg.isSequential ? mg.rate : (mg.target - count) * mg.rate;
                        
                        nextProbs[getNextState(currState, mg.index)] += prob * effectiveRate;
                        probHitAnyMain += effectiveRate;
                    }
                }
                nextProbs[currState] += prob * (1 - probHitAnyMain);
            }
            
            // Swap buffers
            let temp = currentProbs;
            currentProbs = nextProbs;
            nextProbs = temp;
        }

        // Apply independent rolls (Tertiary items roll concurrently).
        for (const tg of tertGroups) {
            nextProbs.fill(0);
            
            for (let midState = 0; midState < totalStates; midState++) {
                const prob = currentProbs[midState];
                if (prob === 0) continue;
                
                const count = getGroupCount(midState, tg.index);

                if (count < tg.target) {
                    const effectiveRate = tg.isSequential ? tg.rate : (tg.target - count) * tg.rate;
                    
                    nextProbs[midState] += prob * (1 - effectiveRate);
                    nextProbs[getNextState(midState, tg.index)] += prob * effectiveRate;
                } else {
                    nextProbs[midState] += prob;
                }
            }
            
            // Swap buffers
            let temp = currentProbs;
            currentProbs = nextProbs;
            nextProbs = temp;
        }

        // Commit the fully resolved permutations into the sparse array
        for (let finalState = 0; finalState < totalStates; finalState++) {
            if (currentProbs[finalState] > 0) {
                sparseMatrix[stateIdx].push({
                    target: finalState,
                    prob: currentProbs[finalState]
                });
            }
        }
    }
    return sparseMatrix;
}

/**
 * Specialized Engine for Moons of Peril.
 * Models independent pools that enforce global duplicate protection.
 * @param {Array<Object>} selectedItems - Moons items with a valid 'pool' attribute.
 * @returns {Array<Array<Object>>} A SPARSE Transition matrix for opening one Moons chest.
 */
export function createMoonsMatrix(selectedItems) {
    const groups = [];
    
    selectedItems.forEach(item => {
        const found = groups.find(g => g.pool === item.pool);
        if (found) found.target++;
        else groups.push({ pool: item.pool, rate: item.rate, target: 1, index: groups.length });
    });

    const { totalStates, getGroupCount, getNextState } = buildStateSpace(groups);
    const sparseMatrix = Array.from({length: totalStates}, () => []);

    let currentProbs = new Float64Array(totalStates);
    let nextProbs = new Float64Array(totalStates);

    for (let stateIdx = 0; stateIdx < totalStates; stateIdx++) {
        let isAbsorbing = true;
        for (let i = 0; i < groups.length; i++) {
            if (getGroupCount(stateIdx, i) !== groups[i].target) {
                isAbsorbing = false;
                break;
            }
        }
        
        if (isAbsorbing) {
            sparseMatrix[stateIdx].push({ target: stateIdx, prob: 1.0 });
            continue;
        }

        currentProbs.fill(0);
        currentProbs[stateIdx] = 1.0;

        // Moons rolls are siloed by boss pool. We process exactly one independent 
        // check per active boss pool concurrently, simulating a 3-boss KC.
        for (const g of groups) {
            nextProbs.fill(0);
            
            for (let midState = 0; midState < totalStates; midState++) {
                const prob = currentProbs[midState];
                if (prob === 0) continue;
                
                const count = getGroupCount(midState, g.index);

                if (count < g.target) {
                    nextProbs[midState] += prob * (1 - g.rate);
                    nextProbs[getNextState(midState, g.index)] += prob * g.rate;
                } else {
                    nextProbs[midState] += prob;
                }
            }
            
            let temp = currentProbs;
            currentProbs = nextProbs;
            nextProbs = temp;
        }

        // Commit the final state calculations to the sparse matrix format
        for (let finalState = 0; finalState < totalStates; finalState++) {
            if (currentProbs[finalState] > 0) {
                sparseMatrix[stateIdx].push({
                    target: finalState,
                    prob: currentProbs[finalState]
                });
            }
        }
    }
    return sparseMatrix;
}