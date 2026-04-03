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
 * We extract this because flattening n-dimensional item combinations into a single 
 * 1D array index (and vice versa) is complex math, and repeating it in both 
 * Master and Moons matrices makes the code hard to maintain.
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
        // Reduces a specific [0, 1, 0, 2...] state array back into a single matrix index
        getIndex: (counts) => counts.reduce((sum, count, i) => sum + count * multipliers[i], 0),
        // Expands a single matrix index back into its multi-dimensional counts
        getCounts: (index) => {
            let temp = index;
            return groups.map(g => {
                const size = g.target + 1;
                const count = temp % size;
                temp = Math.floor(temp / size);
                return count;
            });
        }
    };
}

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
    const baseMatrix = Array.from({length: size}, () => new Float64Array(size));

    // 1. Build the base probability matrix for a single roll
    for (let i = 0; i < size; i++) {
        // Absorbing state: we have all the targeted items
        if (i === targetCount) {
            baseMatrix[i][i] = 1.0; 
            continue;
        }
        
        // Chance to hit one of the items we WANT that we don't ALREADY HAVE
        const pNew = BARROWS.UNIQUE_RATE * ((targetCount - i) / BARROWS.TOTAL_ITEMS);
        
        // The chance to NOT progress is simply 100% minus the chance of getting a new item.
        // This perfectly encompasses dupes, blanks, AND unwanted Barrows items.
        baseMatrix[i][i] = 1 - pNew;
        
        if (i + 1 < size) {
            baseMatrix[i][i + 1] = pNew;
        }
    }

    let chestMatrix = baseMatrix;
    
    // 2. Compound the matrix for the remaining rolls.
    // This implicit matrix multiplication naturally handles the shifting conditional 
    // probability of the intra-chest dupe protection.
    for (let r = 1; r < BARROWS.ROLLS_PER_CHEST; r++) {
        const nextMatrix = Array.from({length: size}, () => new Float64Array(size));
        
        for (let i = 0; i < size; i++) {
            for (let j = i; j < size; j++) {
                if (chestMatrix[i][j] === 0) continue;
                
                // Upper triangular constraint (k = j) because you can't "lose" an item you already obtained
                for (let k = j; k <= Math.min(j + 1, targetCount); k++) {
                    if (baseMatrix[j][k] > 0) {
                        nextMatrix[i][k] += chestMatrix[i][j] * baseMatrix[j][k];
                    }
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

    // Tag with original index before separating so the state array maps back correctly
    groups.forEach((g, idx) => g.index = idx);
    
    const mainGroups = groups.filter(g => g.type === "main");
    const tertGroups = groups.filter(g => g.type !== "main");

    const { totalStates, getIndex, getCounts } = buildStateSpace(groups);
    const matrix = Array.from({length: totalStates}, () => new Float64Array(totalStates));

    for (let s = 0; s < totalStates; s++) {
        const counts = getCounts(s);
        
        // Absorbing state fallback
        if (counts.every((c, i) => c === groups[i].target)) {
            matrix[s][s] = 1.0; 
            continue;
        }

        let stateProbs = new Float64Array(totalStates);
        stateProbs[s] = 1.0;

        // Apply mutually exclusive rolls. An item from MainGroup A prevents receiving an item from MainGroup B.
        for (let r = 0; r < rollCount; r++) {
            const nextRoll = new Float64Array(totalStates);
            
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
            const nextProbs = new Float64Array(totalStates);
            
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
        if (found) found.target++;
        else groups.push({ pool: item.pool, rate: item.rate, target: 1, index: groups.length });
    });

    const { totalStates, getIndex, getCounts } = buildStateSpace(groups);
    const matrix = Array.from({length: totalStates}, () => new Float64Array(totalStates));

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
            const nextProbs = new Float64Array(totalStates);
            for (let mid_s = 0; mid_s < totalStates; mid_s++) {
                if (stateProbs[mid_s] === 0) continue;
                
                const midCounts = getCounts(mid_s);
                const count = midCounts[g.index];

                if (count < g.target) {
                    nextProbs[mid_s] += stateProbs[mid_s] * (1 - g.rate);
                    
                    const nextCounts = [...midCounts];
                    nextCounts[g.index]++;
                    nextProbs[getIndex(nextCounts)] += stateProbs[mid_s] * g.rate;
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