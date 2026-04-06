// ==========================================
// OSRS DROP RATE CALCULATOR - MATRIX ENGINE
// ==========================================

const BARROWS = {
    UNIQUE_RATE: 1 / 102,
    TOTAL_ITEMS: 24,
    ROLLS_PER_CHEST: 7 // 1 base roll + 6 brothers
};

/**
 * Helper to generate a sparse array representation for our transition matrices.
 * We do this to drastically save memory and iteration time in the solvers.
 */
function extractSparseTransitions(probabilities) {
    const sparse = [];
    for (let state = 0; state < probabilities.length; state++) {
        if (probabilities[state] > 0) {
            sparse.push({ target: state, prob: probabilities[state] });
        }
    }
    return sparse;
}

function buildStateSpace(groups) {
    let totalStates = 1;
    
    // Using map instead of an external push loop keeps this clean.
    // We calculate the multiplier offset for each item group's state.
    const multipliers = groups.map(g => {
        const currentMultiplier = totalStates;
        totalStates *= (g.target + 1);
        return currentMultiplier;
    });

    return {
        totalStates,
        getGroupCount: (stateIndex, groupIdx) => {
            const size = groups[groupIdx].target + 1;
            return Math.floor(stateIndex / multipliers[groupIdx]) % size;
        },
        getNextState: (stateIndex, groupIdx) => stateIndex + multipliers[groupIdx]
    };
}

export function createBarrowsMatrix(targetCount) {
    const size = targetCount + 1;
    const baseMatrix = Array.from({length: size}, () => new Float64Array(size));

    // Build the base transition probabilities for a single Barrows brother kill/roll
    for (let currentHits = 0; currentHits < size; currentHits++) {
        if (currentHits === targetCount) {
            baseMatrix[currentHits][currentHits] = 1.0; 
            continue;
        }
        
        const pNewItem = BARROWS.UNIQUE_RATE * ((targetCount - currentHits) / BARROWS.TOTAL_ITEMS);
        baseMatrix[currentHits][currentHits] = 1 - pNewItem;
        baseMatrix[currentHits][currentHits + 1] = pNewItem; // Safe since currentHits < targetCount
    }

    let currentMatrix = Array.from({length: size}, (_, i) => new Float64Array(baseMatrix[i]));
    let nextMatrix = Array.from({length: size}, () => new Float64Array(size));
    
    // We start at r = 1 because baseMatrix already accounts for the first roll
    for (let r = 1; r < BARROWS.ROLLS_PER_CHEST; r++) {
        for (let i = 0; i < size; i++) nextMatrix[i].fill(0);
        
        for (let row = 0; row < size; row++) {
            for (let col = row; col < size; col++) {
                const currentProb = currentMatrix[row][col];
                if (currentProb === 0) continue;
                
                // A Barrows roll can at most give 1 item, so we only need to check col and col+1
                const maxTransitions = Math.min(col + 1, targetCount);
                for (let k = col; k <= maxTransitions; k++) {
                    const transProb = baseMatrix[col][k];
                    if (transProb > 0) {
                        nextMatrix[row][k] += currentProb * transProb;
                    }
                }
            }
        }
        
        // Swap buffers cleanly using ES6 array destructuring (zero allocation overhead)
        [currentMatrix, nextMatrix] = [nextMatrix, currentMatrix];
    }

    return currentMatrix.map(rowProbs => extractSparseTransitions(rowProbs));
}

export function createMasterMatrix(selectedItems, rollCount = 1) {
    const groups = [];
    
    // Grouping logic: Collects items into distinct pools or independent rolls to track state.
    // I opted to keep find() here instead of a Map/reduce since the group array stays tiny (usually < 5 items), 
    // making the overhead of a Map unnecessary while keeping it readable.
    selectedItems.forEach(item => {
        const piecesNeeded = item.pieces || 1;
        
        if (item.pool) {
            const existingGroup = groups.find(g => g.pool === item.pool);
            if (existingGroup) existingGroup.target++;
            else groups.push({ pool: item.pool, type: item.type, rate: item.rate, target: 1, isSequential: true });
        } else if (piecesNeeded > 1) {
            groups.push({ type: item.type, rate: item.rate, target: piecesNeeded, isSequential: true });
        } else {
            const existingGroup = groups.find(g => !g.isSequential && !g.pool && g.type === item.type && g.rate === item.rate);
            if (existingGroup) existingGroup.target++;
            else groups.push({ type: item.type, rate: item.rate, target: 1, isSequential: false });
        }
    });

    groups.forEach((g, idx) => g.index = idx);
    
    const mainGroups = groups.filter(g => g.type === "main");
    const tertGroups = groups.filter(g => g.type !== "main");

    const { totalStates, getGroupCount, getNextState } = buildStateSpace(groups);
    const sparseMatrix = Array.from({length: totalStates}, () => []);

    let currentProbs = new Float64Array(totalStates);
    let nextProbs = new Float64Array(totalStates);

    for (let stateIdx = 0; stateIdx < totalStates; stateIdx++) {
        // High readability check for our absorbing state instead of a clunky manual loop
        const isAbsorbing = groups.every((g, i) => getGroupCount(stateIdx, i) === g.target);
        
        if (isAbsorbing) {
            sparseMatrix[stateIdx].push({ target: stateIdx, prob: 1.0 });
            continue;
        }

        currentProbs.fill(0);
        currentProbs[stateIdx] = 1.0;

        // Phase 1: Process main drop rolls (e.g., standard boss loot)
        for (let r = 0; r < rollCount; r++) {
            nextProbs.fill(0);
            
            for (let currState = 0; currState < totalStates; currState++) {
                const prob = currentProbs[currState];
                if (prob === 0) continue;
                
                let probHitAnyMain = 0;

                for (const mg of mainGroups) {
                    const count = getGroupCount(currState, mg.index);
                    if (count < mg.target) {
                        // If items drop sequentially (like Venator shards), the rate is static.
                        // If they are independent identical drops, getting any 1 of N remaining increases the effective rate.
                        const effectiveRate = mg.isSequential ? mg.rate : (mg.target - count) * mg.rate;
                        nextProbs[getNextState(currState, mg.index)] += prob * effectiveRate;
                        probHitAnyMain += effectiveRate;
                    }
                }
                
                // The probability we missed all targeted main drops on this roll
                nextProbs[currState] += prob * (1 - probHitAnyMain);
            }
            
            [currentProbs, nextProbs] = [nextProbs, currentProbs];
        }

        // Phase 2: Process tertiary rolls (like clue scrolls or pets), usually rolled once per kill independently
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
            
            [currentProbs, nextProbs] = [nextProbs, currentProbs];
        }

        sparseMatrix[stateIdx] = extractSparseTransitions(currentProbs);
    }
    return sparseMatrix;
}

export function createMoonsMatrix(selectedItems) {
    const groups = [];
    
    selectedItems.forEach(item => {
        const existingGroup = groups.find(g => g.pool === item.pool);
        if (existingGroup) existingGroup.target++;
        else groups.push({ pool: item.pool, rate: item.rate, target: 1, index: groups.length });
    });

    const { totalStates, getGroupCount, getNextState } = buildStateSpace(groups);
    const sparseMatrix = Array.from({length: totalStates}, () => []);

    let currentProbs = new Float64Array(totalStates);
    let nextProbs = new Float64Array(totalStates);

    for (let stateIdx = 0; stateIdx < totalStates; stateIdx++) {
        const isAbsorbing = groups.every((g, i) => getGroupCount(stateIdx, i) === g.target);
        
        if (isAbsorbing) {
            sparseMatrix[stateIdx].push({ target: stateIdx, prob: 1.0 });
            continue;
        }

        currentProbs.fill(0);
        currentProbs[stateIdx] = 1.0;

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
            
            [currentProbs, nextProbs] = [nextProbs, currentProbs];
        }

        sparseMatrix[stateIdx] = extractSparseTransitions(currentProbs);
    }
    return sparseMatrix;
}