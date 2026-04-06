/**
 * @file modifiers.js
 * Pure mathematical functions to adjust base drop rates based on raid performance, 
 * team sizes, or specific boss mechanics. 
 * These functions have NO dependency on the DOM or UI.
 */

function adjustRatesForDoom(items, { delveLevel = 9 }) {
    const targetLevel = Math.min(Math.max(delveLevel, 2), 15);
    
    const floorRates = {
        'Mokhaiotl cloth': { 2: 2500, 3: 2000, 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
        'Eye of ayak (uncharged)': { 3: 2000, 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
        'Avernic treads': { 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
        'Dom': { 6: 1000, 7: 750, 8: 500, 9: 250 }
    };

    return items.map(item => {
        const itemRates = floorRates[item.name];
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

function adjustRatesForAraxxor(items, { isSacrificing = false }) {
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

function adjustRatesForTitans(items, { target = 'branda', action = 'loot', contrib = 100 }) {
    const cFrac = Math.min(Math.max(contrib, 0), 100) / 100;

    return items.map(item => {
        if (item.name === "Bran") {
            return { ...item, rate: action === 'sacrifice' ? 1/1500 : 1/3000 };
        }

        if (action !== 'loot' || cFrac === 0) return { ...item, rate: 0 };

        if (target === 'branda' && ["Deadeye prayer scroll", "Ice element staff crown"].includes(item.name)) return { ...item, rate: 0 };
        if (target === 'eldric' && ["Mystic vigour prayer scroll", "Fire element staff crown"].includes(item.name)) return { ...item, rate: 0 };

        return { ...item, rate: item.rate * cFrac };
    });
}

function adjustRatesForTempoross(items, { points = 4000 }) {
    const rolls = points >= 2000 ? 1 + (points - 2000) / 700 : 0;

    if (rolls === 0) return items.map(item => ({ ...item, rate: 0 }));

    return items.map(item => ({
        ...item,
        rate: 1 - Math.pow(1 - item.rate, rolls),
        type: "tertiary" 
    }));
}

function adjustRatesForWintertodt(items, { points = 750 }) {
    const safePoints = Math.max(points, 500);
    const rolls = 1 + (safePoints / 500);

    let runningProb = 1.0;
    const rollRates = {};

    const cascadeRates = [
        { name: "Phoenix", rate: 1/5000 },
        { name: "Dragon axe", rate: 1/10000 },
        { name: "Tome of fire (empty)", rate: 1/1000 },
        { name: "Warm gloves", rate: 1/150 },
        { name: "Bruma torch", rate: 1/150 },
        { name: "Pyromancer garb", rate: 1/150 }, 
        { name: "Burnt page", rate: 1/45 }
    ];

    cascadeRates.forEach(drop => {
        rollRates[drop.name] = drop.rate * runningProb;
        runningProb *= (1 - drop.rate);
    });

    rollRates["Pyromancer hood"] = rollRates["Pyromancer garb"];
    rollRates["Pyromancer robe"] = rollRates["Pyromancer garb"];
    rollRates["Pyromancer boots"] = rollRates["Pyromancer garb"];

    return items.map(item => {
        const ratePerRoll = rollRates[item.name] || 0;
        return {
            ...item,
            rate: 1 - Math.pow(1 - ratePerRoll, rolls),
            type: "tertiary" 
        };
    });
}

function adjustRatesForZalcano(items, { contrib = 100 }) {
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

function adjustRatesForYama(items, { contrib = 100 }) {
    const points = Math.min(Math.max(contrib, 0), 100) / 100;

    if (points < 0.15) return items.map(item => ({ ...item, rate: 0 }));

    let runningProb = 1.0;

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

function adjustRatesForColosseum(items, { isSacrificing = false }) {
    return items.map(item => {
        if (item.name === 'Smol heredit' && isSacrificing) {
            return { ...item, rate: 1 - Math.pow((1 - item.rate), 2) };
        }
        return item;
    });
}

function adjustRatesForCox(items, { points = 30000 }) {
    const uniqueChance = points / 867600; 
    
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 69) };
        if (item.name === 'Olmlet') return { ...item, rate: uniqueChance * item.rate };
        return item;
    });
}

function adjustRatesForTob(items, { size = 3, deaths = 0 }) {
    const maxPts = (18 * size) + 14;
    const earnedPts = Math.max(0, maxPts - (deaths * 4));
    const uniqueChance = (1 / 9.1) * (earnedPts / maxPts);
    
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 19) };
        return item;
    });
}

function adjustRatesForToa(items, { level = 150, points = 15000 }) {
    let adjLevel = level;
    if (adjLevel > 310) { 
        if (adjLevel > 430) adjLevel = 430 + Math.floor((adjLevel - 430) / 2); 
        adjLevel = 310 + Math.floor((adjLevel - 310) / 3); 
    }
    
    const denom = 100 * (10500 - 20 * adjLevel);
    const uniqueChance = points / denom;

    let fangW = 70; let lbW = 70;
    if (level >= 500) { fangW = 30; lbW = 35; }
    else if (level >= 450) { fangW = 40 - Math.floor((level - 450) * 0.2); lbW = 40 - Math.floor((level - 450) * 0.1); }
    else if (level >= 400) { fangW = 40; lbW = 50 - Math.floor((level - 400) * 0.2); }
    else if (level >= 350) { fangW = 60 - Math.floor((level - 350) * 0.4); lbW = 60 - Math.floor((level - 350) * 0.2); }
    else if (level >= 300) { fangW = 70 - Math.floor((level - 300) * 0.2); lbW = 70 - Math.floor((level - 300) * 0.2); }

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
            const petDenom = 100 * (350000 - 700 * Math.min(adjLevel, 466));
            return { ...item, rate: points / petDenom };
        }
        return item;
    });
}

function adjustRatesForDT2(items, { isAwakened = false }) {
    if (!isAwakened) return items;

    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: item.rate * 3 };
        return item;
    });
}

function adjustRatesForNightmare(items, { variant = 'standard', teamSize = 5 }) {
    const safeTeamSize = Math.min(Math.max(teamSize, 1), 80);

    if (variant === 'phosani') {
        const phosaniRates = {
            "Little nightmare": 1 / 1400, "Inquisitor's mace": 1 / 1129, "Inquisitor's great helm": 1 / 700,
            "Inquisitor's hauberk": 1 / 700, "Inquisitor's plateskirt": 1 / 700, "Nightmare staff": 1 / 507.2,
            "Volatile orb": 1 / 1600, "Harmonised orb": 1 / 1600, "Eldritch orb": 1 / 1600,
            "Jar of dreams": 1 / 4000, "Slepey tablet": 1 / 25, "Parasitic egg": 1 / 200
        };
        
        return items.map(item => ({ ...item, rate: phosaniRates[item.name] || item.rate }));
    } else {
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
}

export const RATE_ADJUSTERS = {
    'chambers_of_xeric': adjustRatesForCox,
    'theatre_of_blood': adjustRatesForTob,
    'tombs_of_amascut': adjustRatesForToa,
    'doom_of_mokhaiotl': adjustRatesForDoom,
    'fortis_colosseum': adjustRatesForColosseum,
    'the_nightmare': adjustRatesForNightmare,
    'yama': adjustRatesForYama,
    'tempoross': adjustRatesForTempoross,
    'wintertodt': adjustRatesForWintertodt,
    'zalcano': adjustRatesForZalcano,
    'royal_titans': adjustRatesForTitans,
    'araxxor': adjustRatesForAraxxor,
    'vardorvis': adjustRatesForDT2,
    'duke_sucellus': adjustRatesForDT2,
    'the_whisperer': adjustRatesForDT2,
    'the_leviathan': adjustRatesForDT2
};