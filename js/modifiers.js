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
    'Eye of Ayak (uncharged)': { 3: 2000, 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
    'Avernic treads': { 4: 1350, 5: 810, 6: 765, 7: 720, 8: 630, 9: 540 },
    'Dom': { 6: 1000, 7: 750, 8: 500, 9: 250 }
};

const TITAN_RESTRICTIONS = {
    branda: new Set(["Deadeye prayer scroll", "Ice element staff crown"]),
    eldric: new Set(["Mystic vigour prayer scroll", "Fire element staff crown"])
};

const PHOSANI_RATES = {
    "Little Nightmare": 1 / 1400, "Inquisitor's mace": 1 / 1129, "Inquisitor's great helm": 1 / 700,
    "Inquisitor's hauberk": 1 / 700, "Inquisitor's plateskirt": 1 / 700, "Nightmare staff": 1 / 507.2,
    "Volatile orb": 1 / 1600, "Harmonised orb": 1 / 1600, "Eldritch orb": 1 / 1600,
    "Jar of Dreams": 1 / 4000, "Slepey tablet": 1 / 25, "Parasitic egg": 1 / 200
};

// We can pre-calculate Wintertodt's cascading probabilities at load time
// since they don't depend on user points, only the base rates do.
const PRECOMPUTED_WT_RATES = (() => {
    const rollRates = {};
    let runningProb = 1.0;
    
    const cascade = [
        { name: "Phoenix", rate: 1/5000 },
        { name: "Dragon axe", rate: 1/10000 },
        { name: "Tome of Fire (empty)", rate: 1/1000 },
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

// "Take eggs" gives up the normal loot for a better pet chance
const MAGGOT_KING_EGG_PET_RATE = 1 / 1502.4;

export function adjustRatesForMaggotKing(items, { loot }) {
    if (loot !== 'eggs') return items;

    return items.map(item => ({
        ...item,
        rate: item.name === 'Maggot marquess' ? MAGGOT_KING_EGG_PET_RATE : 0
    }));
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

const YAMA_PET_RATE = 1 / 2500;
const YAMA_MIN_CONTRIBUTION = 0.15;

export function adjustRatesForYama(items, { contrib }) {
    const contribution = Math.min(Math.max(contrib, 0), 100) / 100;

    if (contribution < YAMA_MIN_CONTRIBUTION) return items.map(item => ({ ...item, rate: 0 }));

    // Tables are rolled in this order until one hits, so each only rolls if every earlier one missed.
    // `drops` splits a table's hit between items (the unique table: 3/5 armour, 2/5 horn).
    const cascade = [
        { chance: contribution / 120, drops: { "Oathplate helm": 1 / 5, "Oathplate chest": 1 / 5, "Oathplate legs": 1 / 5, "Soulflame horn": 2 / 5 } },
        { chance: contribution / 12, drops: { "Dossier": 1 } },
        { chance: 1 / 30, drops: { "Forgotten lockbox": 1 } },
        { chance: 1 / 15, drops: { "Oathplate shards": 1 } },
        { chance: 5 / 78, drops: { "Barrel of demonic tallow (full)": 1 } }
    ];

    const rates = { "Yami": YAMA_PET_RATE };
    let reachChance = 1;
    for (const { chance, drops } of cascade) {
        for (const [name, portion] of Object.entries(drops)) rates[name] = reachChance * chance * portion;
        reachChance *= 1 - chance;
    }

    return items.map(item => ({ ...item, rate: rates[item.name] ?? item.rate }));
}

export function adjustRatesForColosseum(items, { isSacrificing }) {
    return items.map(item => {
        if (item.name === 'Smol Heredit' && isSacrificing) {
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
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.weight / COX_TOTAL_WEIGHT) };
        if (item.name === 'Olmlet') return { ...item, rate: uniqueChance * item.rate };
        return item;
    });
}

const TOB_TOTAL_WEIGHT = 19;

export function adjustRatesForTob(items, { size, deaths }) {
    const maxPts = (18 * size) + 14;
    const earnedPts = Math.max(0, maxPts - (deaths * 4));
    // 1/9.1 is the whole team's chance and one player receives the unique, so assume an even share
    const uniqueChance = (1 / 9.1) * (earnedPts / maxPts) / size;
    
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.weight / TOB_TOTAL_WEIGHT) };
        return item;
    });
}

const TOA_UNIQUE_CAP = 0.55;
// Shadow 10 + Masori 3 x 20 + Ward 30; fang and Lightbearer weights vary with raid level
const TOA_OTHER_UNIQUES_WEIGHT = 100;
const TOA_LEVEL_SCALED_UNIQUES = ["Osmumten's fang", "Lightbearer"];

// Each raid level above 310 counts for a third, and above 430 for a sixth
function toaUniqueTableLevel(level) {
    if (level <= 310) return level;
    const halvedAbove430 = level > 430 ? 430 + Math.floor((level - 430) / 2) : level;
    return 310 + Math.floor((halvedAbove430 - 310) / 3);
}

// The pet uses its own scaling: a third per level above 400, capped at raid level 550
function toaPetLevel(level) {
    return level <= 400 ? level : 400 + (Math.min(level, 550) - 400) / 3;
}

// Fang and Lightbearer weights shrink between raid levels 300 and 500
function toaFangAndLightbearerWeights(level) {
    if (level >= 500) return { fang: 30, lightbearer: 35 };
    if (level >= 450) return { fang: 40 - Math.floor((level - 450) * 0.2), lightbearer: 40 - Math.floor((level - 450) * 0.1) };
    if (level >= 400) return { fang: 40, lightbearer: 50 - Math.floor((level - 400) * 0.2) };
    if (level >= 350) return { fang: 60 - Math.floor((level - 350) * 0.4), lightbearer: 60 - Math.floor((level - 350) * 0.2) };
    if (level >= 300) return { fang: 70 - Math.floor((level - 300) * 0.2), lightbearer: 70 - Math.floor((level - 300) * 0.2) };
    return { fang: 70, lightbearer: 70 };
}

export function adjustRatesForToa(items, { level, points }) {
    const uniqueChance = Math.min(points / (100 * (10500 - 20 * toaUniqueTableLevel(level))), TOA_UNIQUE_CAP);
    const { fang, lightbearer } = toaFangAndLightbearerWeights(level);
    const totalWeight = TOA_OTHER_UNIQUES_WEIGHT + fang + lightbearer;

    const weightOf = (item) => {
        if (item.name === "Osmumten's fang") return fang;
        if (item.name === "Lightbearer") return lightbearer;
        // Below raid level 150 the other uniques need an extra 1/50 roll
        return level < 150 && !TOA_LEVEL_SCALED_UNIQUES.includes(item.name) ? item.weight / 50 : item.weight;
    };

    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (weightOf(item) / totalWeight) };
        if (item.name === "Tumeken's guardian") {
            return { ...item, rate: points / (100 * (350000 - 700 * toaPetLevel(level))) };
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

// Standard Nightmare: the pet is 1/(800 x team) up to five players, then a flat 1/4000
const NIGHTMARE_PET_DENOMINATOR_PER_PLAYER = 800;
const NIGHTMARE_MAX_PET_DENOMINATOR = 4000;
const NIGHTMARE_JAR_DENOMINATOR_PER_PLAYER = 2000;
const NIGHTMARE_MAX_TEAM = 80;

export function adjustRatesForNightmare(items, { variant, teamSize }) {
    const safeTeamSize = Math.min(Math.max(teamSize, 1), NIGHTMARE_MAX_TEAM);

    if (variant === 'phosani') {
        return items.map(item => ({ ...item, rate: PHOSANI_RATES[item.name] || item.rate }));
    }

    // Each player past five adds 1% to the unique tables, up to +75%
    const scale = 1 + (Math.max(0, Math.min(safeTeamSize - 5, 75)) / 100);

    return items.map(item => {
        // Phosani's-only drops
        if (item.name === "Slepey tablet" || item.name === "Parasitic egg") return { ...item, rate: 0 };

        if (item.name === "Little Nightmare") {
            const denominator = safeTeamSize <= 5 ? NIGHTMARE_PET_DENOMINATOR_PER_PLAYER * safeTeamSize : NIGHTMARE_MAX_PET_DENOMINATOR;
            return { ...item, rate: 1 / denominator };
        }
        if (item.name === "Jar of Dreams") {
            return { ...item, rate: 1 / (NIGHTMARE_JAR_DENOMINATOR_PER_PLAYER * safeTeamSize) };
        }
        if (item.type === "main") {
            return { ...item, rate: (item.rate * scale) / safeTeamSize };
        }
        return item;
    });
}

