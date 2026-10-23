/**
 * @file modifiers.js
 * Pure mathematical functions to adjust base drop rates based on raid performance, 
 * team sizes, or specific boss mechanics. 
 * These functions have NO dependency on the DOM or UI. Each takes the boss's items and the
 * state built from its settings in bosses.js, and returns items with adjusted rates.
 */

// ==========================================
// STATIC PRE-COMPUTED DATA
// ==========================================

const DOOM_FLOOR_RATES = {
    'Mokhaiotl cloth': { 2: 2500, 3: 2000, 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
    'Eye of ayak (uncharged)': { 3: 2000, 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
    'Avernic treads': { 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
    'Dom': { 6: 1000, 7: 750, 8: 500, 9: 250 }
};

const TITAN_RESTRICTIONS = {
    branda: new Set(["Deadeye prayer scroll", "Ice element staff crown"]),
    eldric: new Set(["Mystic vigour prayer scroll", "Fire element staff crown"])
};

const PHOSANI_RATES = {
    "Little nightmare": 1 / 1400, "Inquisitor's mace": 1 / 1129, "Inquisitor's great helm": 1 / 700,
    "Inquisitor's hauberk": 1 / 700, "Inquisitor's plateskirt": 1 / 700, "Nightmare staff": 1 / 507.2,
    "Volatile orb": 1 / 1600, "Harmonised orb": 1 / 1600, "Eldritch orb": 1 / 1600,
    "Jar of dreams": 1 / 4000, "Slepey tablet": 1 / 25, "Parasitic egg": 1 / 200
};

// We can pre-calculate Wintertodt's cascading probabilities at load time
// since they don't depend on user points, only the base rates do.
const PRECOMPUTED_WT_RATES = (() => {
    const rollRates = {};
    let runningProb = 1.0;
    
    const cascade = [
        { name: "Phoenix", rate: 1/5000 },
        { name: "Dragon axe", rate: 1/10000 },
        { name: "Tome of fire (empty)", rate: 1/1000 },
        { name: "Warm gloves", rate: 1/150 },
        { name: "Bruma torch", rate: 1/150 },
        { name: "Pyromancer garb", rate: 1/150 }, 
        { name: "Burnt page", rate: 1/45 }
    ];

    cascade.forEach(drop => {
        rollRates[drop.name] = drop.rate * runningProb;
        runningProb *= (1 - drop.rate);
    });

    rollRates["Pyromancer hood"] = rollRates["Pyromancer garb"];
    rollRates["Pyromancer robe"] = rollRates["Pyromancer garb"];
    rollRates["Pyromancer boots"] = rollRates["Pyromancer garb"];

    return rollRates;
})();


// ==========================================
// MODIFIER FUNCTIONS
// ==========================================

export function adjustRatesForDoom(items, { delveLevel }) {
    const targetLevel = Math.min(Math.max(delveLevel, 2), 15);

    return items.map(item => {
        const itemRates = DOOM_FLOOR_RATES[item.name];
        if (!itemRates) return item;

        let chanceToFailAll = 1.0;
        let canRoll = false;

        for (let floor = 2; floor <= targetLevel; floor++) {
            const rateKey = floor >= 9 ? 9 : floor;
            if (itemRates[rateKey]) {
                canRoll = true;
                chanceToFailAll *= (1 - (1 / itemRates[rateKey]));
            }
        }

        return { ...item, rate: canRoll ? (1 - chanceToFailAll) : 0 };
    });
}

export function adjustRatesForAraxxor(items, { isSacrificing }) {
    return items.map(item => {
        if (item.name === "Nid") {
            return { ...item, rate: isSacrificing ? 1/1500 : 1/3000 };
        }
        if (isSacrificing && item.type === 'main') {
            return { ...item, rate: 0 };
        }
        return item;
    });
}

export function adjustRatesForTitans(items, { target, action, contrib }) {
    const cFrac = Math.min(Math.max(contrib, 0), 100) / 100;

    return items.map(item => {
        if (item.name === "Bran") {
            return { ...item, rate: action === 'sacrifice' ? 1/1500 : 1/3000 };
        }

        if (action !== 'loot' || cFrac === 0) return { ...item, rate: 0 };
        
        if (TITAN_RESTRICTIONS[target]?.has(item.name)) {
            return { ...item, rate: 0 };
        }

        return { ...item, rate: item.rate * cFrac };
    });
}

export function adjustRatesForTempoross(items, { points }) {
    const rolls = points >= 2000 ? 1 + (points - 2000) / 700 : 0;

    if (rolls === 0) return items.map(item => ({ ...item, rate: 0 }));

    return items.map(item => ({
        ...item,
        rate: 1 - Math.pow(1 - item.rate, rolls),
        type: "tertiary" 
    }));
}

export function adjustRatesForWintertodt(items, { points }) {
    const safePoints = Math.max(points, 500);
    const rolls = 1 + (safePoints / 500);

    return items.map(item => {
        const ratePerRoll = PRECOMPUTED_WT_RATES[item.name] || 0;
        return {
            ...item,
            rate: 1 - Math.pow(1 - ratePerRoll, rolls),
            type: "tertiary" 
        };
    });
}

export function adjustRatesForZalcano(items, { contrib }) {
    const cFrac = Math.min(Math.max(contrib, 0), 100) / 100;

    if (cFrac === 0) return items.map(item => ({ ...item, rate: 0 }));

    const rates = {
        "Smolcano": 1/2250,
        "Crystal tool seed": (1/200) * (39/40) * cFrac,
        "Uncut onyx": (1/200) * (1/40) * cFrac,
        "Zalcano shard": 1 / (1500 - (750 * cFrac))
    };

    return items.map(item => ({
        ...item,
        rate: rates[item.name] ?? item.rate,
        type: "tertiary"
    }));
}

export function adjustRatesForYama(items, { contrib }) {
    const points = Math.min(Math.max(contrib, 0), 100) / 100;

    if (points < 0.15) return items.map(item => ({ ...item, rate: 0 }));

    let runningProb = 1.0;

    // Yama's probabilities are entirely dependent on user contribution, 
    // so we must calculate the running waterfall dynamically.
    const rareSum = (1/120) * points;
    const helmRate = (1/600) * points * runningProb;
    const chestRate = (1/600) * points * runningProb;
    const legsRate = (1/600) * points * runningProb;
    const hornRate = (1/300) * points * runningProb;
    runningProb *= (1 - rareSum);

    const dossierRate = (1/12) * points * runningProb;
    runningProb *= (1 - ((1/12) * points));

    const lockboxRate = (1/30) * runningProb;
    runningProb *= (1 - (1/30));

    const shardsRate = (1/15) * runningProb;
    runningProb *= (1 - (1/15));

    const tallowRate = (5/78) * runningProb;

    const yamaRates = {
        "Yami": 1/2500, 
        "Oathplate helm": helmRate,
        "Oathplate chest": chestRate,
        "Oathplate legs": legsRate,
        "Soulflame horn": hornRate,
        "Dossier": dossierRate,
        "Forgotten lockbox": lockboxRate,
        "Oathplate shards": shardsRate,
        "Barrel of demonic tallow (full)": tallowRate
    };

    return items.map(item => ({
        ...item,
        rate: yamaRates[item.name] ?? item.rate
    }));
}

export function adjustRatesForColosseum(items, { isSacrificing }) {
    return items.map(item => {
        if (item.name === 'Smol heredit' && isSacrificing) {
            return { ...item, rate: 1 - Math.pow((1 - item.rate), 2) };
        }
        return item;
    });
}

// Normal-mode unique weights total 60 since the August 2026 rework (previously 69)
const COX_TOTAL_WEIGHT = 60;
// 1% per 8,676 points, capped at 65.7% (570,000 points); the extra uniques past the cap aren't modelled
const COX_POINTS_CAP = 570000;

export function adjustRatesForCox(items, { points }) {
    const uniqueChance = Math.min(points, COX_POINTS_CAP) / 867600;

    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / COX_TOTAL_WEIGHT) };
        if (item.name === 'Olmlet') return { ...item, rate: uniqueChance * item.rate };
        return item;
    });
}

export function adjustRatesForTob(items, { size, deaths }) {
    const maxPts = (18 * size) + 14;
    const earnedPts = Math.max(0, maxPts - (deaths * 4));
    // 1/9.1 is the whole team's chance and one player receives the unique, so assume an even share
    const uniqueChance = (1 / 9.1) * (earnedPts / maxPts) / size;
    
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 19) };
        return item;
    });
}

export function adjustRatesForToa(items, { level, points }) {
    let adjLevel = level;
    if (adjLevel > 310) { 
        if (adjLevel > 430) adjLevel = 430 + Math.floor((adjLevel - 430) / 2); 
        adjLevel = 310 + Math.floor((adjLevel - 310) / 3); 
    }
    
    const denom = 100 * (10500 - 20 * adjLevel);
    const uniqueChance = Math.min(points / denom, 0.55);

    let fangW = 70; 
    let lbW = 70;

    // Fang and Lightbearer weights shrink between raid levels 300 and 500
    if (level >= 500) {
        fangW = 30; lbW = 35; 
    } else if (level >= 450) { 
        fangW = 40 - Math.floor((level - 450) * 0.2); 
        lbW = 40 - Math.floor((level - 450) * 0.1); 
    } else if (level >= 400) { 
        fangW = 40; 
        lbW = 50 - Math.floor((level - 400) * 0.2); 
    } else if (level >= 350) { 
        fangW = 60 - Math.floor((level - 350) * 0.4); 
        lbW = 60 - Math.floor((level - 350) * 0.2); 
    } else if (level >= 300) { 
        fangW = 70 - Math.floor((level - 300) * 0.2); 
        lbW = 70 - Math.floor((level - 300) * 0.2); 
    }

    const totalWeight = 10 + 20 + 20 + 20 + 30 + fangW + lbW;
    
    return items.map(item => {
        if (item.type === 'main') {
            let w = item.rate;
            if (item.name === "Osmumten's fang") w = fangW;
            if (item.name === "Lightbearer") w = lbW;
            if (level < 150 && !["Osmumten's fang", "Lightbearer"].includes(item.name)) w /= 50;
            return { ...item, rate: uniqueChance * (w / totalWeight) };
        }
        if (item.name === "Tumeken's guardian") {
            // The pet uses its own raid-level scaling, separate from the unique table's
            const petLevel = level <= 400 ? level : 400 + (Math.min(level, 550) - 400) / 3;
            const petDenom = 100 * (350000 - 700 * petLevel);
            return { ...item, rate: points / petDenom };
        }
        return item;
    });
}

export function adjustRatesForDT2(items, { isAwakened }) {
    if (!isAwakened) return items;

    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: item.rate * 3 };
        return item;
    });
}

export function adjustRatesForNightmare(items, { variant, teamSize }) {
    const safeTeamSize = Math.min(Math.max(teamSize, 1), 80);

    if (variant === 'phosani') {
        return items.map(item => ({ ...item, rate: PHOSANI_RATES[item.name] || item.rate }));
    } 
    
    const BASE_PET_RATE = 800;
    const MAX_PET_RATE = 4000;
    const JAR_RATE = 2000;

    const scale = 1 + (Math.max(0, Math.min(safeTeamSize - 5, 75)) / 100);
    
    return items.map(item => {
        if (item.name === "Slepey tablet" || item.name === "Parasitic egg") return { ...item, rate: 0 }; 
        
        if (item.name === "Little nightmare") {
            return { ...item, rate: safeTeamSize <= 5 ? 1 / (BASE_PET_RATE * safeTeamSize) : 1 / MAX_PET_RATE };
        }
        if (item.name === "Jar of dreams") {
            return { ...item, rate: 1 / (JAR_RATE * safeTeamSize) };
        }
        if (item.type === "main") {
            return { ...item, rate: (item.rate * scale) / safeTeamSize };
        }
        return item;
    });
}

