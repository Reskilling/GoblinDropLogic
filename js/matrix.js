// ==========================================
// OSRS DROP RATE CALCULATOR - MATRIX ENGINE
// ==========================================

const BARROWS = {
    UNIQUE_RATE: 1 / 102,
    TOTAL_ITEMS: 24,
    ROLLS_PER_CHEST: 7 // 1 base roll + 6 brothers
};

function buildStateSpace(groups) {
    let totalStates = 1;
    const multipliers = [];
    
    for (const g of groups) {
        multipliers.push(totalStates);
        totalStates *= (g.target + 1);
    }

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

    for (let i = 0; i < size; i++) {
        if (i === targetCount) {
            baseMatrix[i][i] = 1.0; 
            continue;
        }
        
        const pNew = BARROWS.UNIQUE_RATE * ((targetCount - i) / BARROWS.TOTAL_ITEMS);
        baseMatrix[i][i] = 1 - pNew;
        
        if (i + 1 < size) {
            baseMatrix[i][i + 1] = pNew;
        }
    }

    let currentMatrix = Array.from({length: size}, (_, i) => new Float64Array(baseMatrix[i]));
    let nextMatrix = Array.from({length: size}, () => new Float64Array(size));
    
    for (let r = 1; r < BARROWS.ROLLS_PER_CHEST; r++) {
        for (let i = 0; i < size; i++) nextMatrix[i].fill(0);
        
        for (let row = 0; row < size; row++) {
            for (let col = row; col < size; col++) {
                const currentProb = currentMatrix[row][col];
                if (currentProb === 0) continue;
                
                for (let k = col; k <= Math.min(col + 1, targetCount); k++) {
                    const transProb = baseMatrix[col][k];
                    if (transProb > 0) {
                        nextMatrix[row][k] += currentProb * transProb;
                    }
                }
            }
        }
        
        // Swap buffers cleanly using ES6 array destructuring (zero allocation)
        [currentMatrix, nextMatrix] = [nextMatrix, currentMatrix];
    }

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

export function createMasterMatrix(selectedItems, rollCount = 1) {
    const groups = [];
    
    selectedItems.forEach(item => {
        const piecesNeeded = item.pieces || 1;
        
        if (item.pool) {
            const found = groups.find(g => g.pool === item.pool);
            if (found) found.target++;
            else groups.push({ pool: item.pool, type: item.type, rate: item.rate, target: 1, isSequential: true });
        } else if (piecesNeeded > 1) {
            groups.push({ type: item.type, rate: item.rate, target: piecesNeeded, isSequential: true });
        } else {
            const found = groups.find(g => !g.isSequential && !g.pool && g.type === item.type && g.rate === item.rate);
            if (found) found.target++;
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
            
            [currentProbs, nextProbs] = [nextProbs, currentProbs];
        }

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