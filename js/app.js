/**
 * @file app.js
 * Main UI Controller for DropLogic.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation, buildChartData } from './solvers.js';
import { RATE_ADJUSTERS } from './modifiers.js';

// --- CONFIGURATION ---
const CHART_CONFIG = {
    font: "'Inter', sans-serif",
    textColor: '#a8a29e',
    xAxisPower: 0.4
};

const COLORS = { 
    mode: '#ef4444', 
    progress: '#3b82f6', 
    mean: '#f97316', 
    user: '#22c55e' 
};

const DT2_BOSSES = ['vardorvis', 'duke_sucellus', 'the_whisperer', 'the_leviathan'];

// Organized Boss Categories
// We exclude 'Standard' from this map because anything not explicitly listed 
// here will automatically fall through to the Standard bucket.
const BOSS_CATEGORIES = {
    "Skilling": ['wintertodt', 'tempoross', 'zalcano'],
    "Minigame": ['the_corrupted_gauntlet', 'the_fight_caves', 'the_inferno', 'fortis_colosseum'],
    "Slayer": ['abyssal_sire', 'alchemical_hydra', 'araxxor', 'cerberus', 'grotesque_guardians', 'kraken', 'thermonuclear_smoke_devil'],
    "Wilderness": ['artio', 'callisto', 'calvarion', 'chaos_elemental', 'chaos_fanatic', 'crazy_archaeologist', 'scorpia', 'spindel', 'venenatis', 'vetion'],
    "God Wars Dungeon": ['commander_zilyana', 'general_graardor', 'kree_arra', 'kril_tsutsaroth', 'nex'],
    "The Forgotten Four": ['vardorvis', 'duke_sucellus', 'the_whisperer', 'the_leviathan'],
    "Raids": ['chambers_of_xeric', 'theatre_of_blood', 'tombs_of_amascut']
};

let activeBossKey = "";
let chartInstance = null;

// Cache static DOM references to avoid repeated queries
const DOM = {
    bossSelect: document.getElementById("boss-select"),
    itemGrid: document.getElementById("item-grid"),
    kcInput: document.getElementById("target-kc"),
    bossPreview: document.getElementById("boss-preview"),
    resultsSection: document.getElementById("results"),
    statChance: document.getElementById("stat-chance"),
    phraseMode: document.getElementById("phrase-mode"),
    phraseMedian: document.getElementById("phrase-median"),
    phraseMean: document.getElementById("phrase-mean"),
    phraseUser: document.getElementById("phrase-user"),
    chartCanvas: document.getElementById('distributionChart'),
    kcResetBtn: document.getElementById("kc-reset"),
    selectAllBtn: document.getElementById("select-all"),
    selectNoneBtn: document.getElementById("select-none"),
    calcBtn: document.getElementById("calculate-btn"),
    mobileBtn: document.getElementById('mobile-sections-btn'),
    mobileMenu: document.getElementById('mobile-dropdown')
};

// ==========================================
// STATE EXTRACTION (UI -> Data)
// ==========================================

const getIntVal = (id, fallback) => {
    const val = parseInt(document.getElementById(id)?.value, 10);
    return isNaN(val) ? fallback : val;
};
const getStrVal = (id, fallback) => document.getElementById(id)?.value || fallback;
const isBtnTrue = (id) => document.getElementById(id)?.value === 'true';

const STATE_EXTRACTORS = {
    'chambers_of_xeric': () => ({ points: getIntVal('raid-cox-pts', 30000) }),
    'theatre_of_blood': () => ({ size: getIntVal('raid-tob-size', 3), deaths: getIntVal('raid-tob-deaths', 0) }),
    'tombs_of_amascut': () => ({ level: getIntVal('raid-toa-level', 150), points: getIntVal('raid-toa-pts', 15000) }),
    'doom_of_mokhaiotl': () => ({ delveLevel: getIntVal('doom-delve-level', 9) }),
    'fortis_colosseum': () => ({ isSacrificing: isBtnTrue('colo-sacrifice-btn') }),
    'the_nightmare': () => ({ variant: getStrVal('nightmare-variant-btn', 'standard'), teamSize: getIntVal('nightmare-team-size', 5) }),
    'yama': () => ({ contrib: getIntVal('yama-contribution', 100) }),
    'tempoross': () => ({ points: getIntVal('tempoross-points', 4000) }),
    'wintertodt': () => ({ points: getIntVal('wintertodt-points', 750) }),
    'zalcano': () => ({ contrib: getIntVal('zalcano-contribution', 100) }),
    'royal_titans': () => ({ target: getStrVal('titan-target-btn', 'branda'), action: getStrVal('titan-action-btn', 'loot'), contrib: getIntVal('titan-contribution', 100) }),
    'araxxor': () => ({ isSacrificing: isBtnTrue('araxxor-sacrifice-btn') })
};

DT2_BOSSES.forEach(boss => {
    STATE_EXTRACTORS[boss] = () => ({ isAwakened: isBtnTrue('dt2-awakened-btn') });
});

// ==========================================
// SIMULATION CACHE
// ==========================================
let activeSimulationCache = { hash: null, rawResults: null };

function generateStateHash(bossKey, items) {
    return JSON.stringify({ 
        bossKey, 
        items: items.map(i => `${i.name}|${i.rate}|${i.pieces}|${i.pool}`).sort() 
    });
}

function initApp() {
    setupChartDefaults();
    populateBossSelect();
    bindEvents();
    initGoalTracking();
}

function setupChartDefaults() {
    Chart.defaults.font.family = CHART_CONFIG.font;
    Chart.defaults.color = CHART_CONFIG.textColor;
}

function populateBossSelect() {
    const defaultOption = '<option value="">Select Boss Intel...</option>';
    
    // By defining the keys in this exact sequence, we force the JavaScript engine 
    // to build the HTML elements in our desired account progression order.
    const categories = { 
        "Standard": [],
        "Skilling": [], 
        "Minigame": [], 
        "Slayer": [], 
        "Wilderness": [], 
        "God Wars Dungeon": [],
        "The Forgotten Four": [], 
        "Raids": []
    };
    
    // Sort bosses alphabetically, then drop them into their respective progression buckets
    Object.keys(BOSS_CONFIG).sort().forEach(key => {
        let placed = false;
        for (const [cat, bosses] of Object.entries(BOSS_CATEGORIES)) {
            if (bosses.includes(key)) {
                categories[cat].push(key);
                placed = true;
                break;
            }
        }
        
        // Safety net: Anything we didn't explicitly classify falls back to the top of the list
        if (!placed) categories["Standard"].push(key);
    });

    let bossOptions = '';
    for (const [cat, keys] of Object.entries(categories)) {
        if (keys.length === 0) continue;
        bossOptions += `<optgroup label="${cat}">`;
        keys.forEach(key => {
            bossOptions += `<option value="${key}">${formatBossName(key)}</option>`;
        });
        bossOptions += `</optgroup>`;
    }
        
    DOM.bossSelect.innerHTML = defaultOption + bossOptions;
}

// ==========================================
// DYNAMIC UI INJECTION
// ==========================================
const BOSS_UI_INJECTORS = {
    'chambers_of_xeric': (container) => {
        container.innerHTML = `
            <div class="input-group">
                <label>Average Team Points</label>
                <input type="number" id="raid-cox-pts" value="30000" min="0">
            </div>`;
    },
    'theatre_of_blood': (container) => {
        container.innerHTML = `
            <div class="input-row" style="margin-bottom: 0;">
                <div class="input-group">
                    <label>Team Size</label>
                    <input type="number" id="raid-tob-size" value="3" min="1" max="5">
                </div>
                <div class="input-group">
                    <label>Team Deaths</label>
                    <input type="number" id="raid-tob-deaths" value="0" min="0">
                </div>
            </div>`;
    },
    'tombs_of_amascut': (container) => {
        container.innerHTML = `
            <div class="input-row" style="margin-bottom: 0;">
                <div class="input-group">
                    <label>Raid Level</label>
                    <input type="number" id="raid-toa-level" value="150" min="0">
                </div>
                <div class="input-group">
                    <label>Team Points</label>
                    <input type="number" id="raid-toa-pts" value="15000" min="0">
                </div>
            </div>`;
    },
    'doom_of_mokhaiotl': (container) => {
        container.innerHTML = `
            <div class="input-group">
                <label>Delve Level (Max 15)</label>
                <input type="number" id="doom-delve-level" value="9" min="2" max="15">
            </div>`;
            
        document.getElementById('doom-delve-level').addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            e.target.value = isNaN(val) || val < 2 ? 2 : Math.min(val, 15);
        });
    },
    'fortis_colosseum': (container) => {
        container.innerHTML = `
            <button type="button" id="colo-sacrifice-btn" value="false" 
                style="width: 100%; margin-top: 8px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                Keep Quivers (Standard)
            </button>`;
            
        const btn = document.getElementById('colo-sacrifice-btn');
        btn.addEventListener('click', function() {
            const isSacrificing = this.value === 'true';
            this.value = isSacrificing ? 'false' : 'true';
            this.innerText = isSacrificing ? 'Keep Quivers (Standard)' : 'Sacrifice Quivers for Pet Chance';
            this.style.borderColor = isSacrificing ? 'var(--border)' : 'var(--accent-orange)';
            this.style.color = isSacrificing ? 'var(--text)' : 'var(--accent-orange)';
            this.style.background = isSacrificing ? 'rgba(255,255,255,0.05)' : 'rgba(249, 115, 22, 0.05)';
        });
    },
    'the_nightmare': (container) => {
        container.innerHTML = `
            <div class="input-row" style="margin-bottom: 0;">
                <div class="input-group" style="display: flex; flex-direction: column; justify-content: flex-end;">
                    <button type="button" id="nightmare-variant-btn" value="standard" 
                        style="width: 100%; padding: 14px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: normal; line-height: 1.2;">
                        Standard Mode
                    </button>
                </div>
                <div class="input-group">
                    <label>Team Size</label>
                    <input type="number" id="nightmare-team-size" value="5" min="1" max="80">
                </div>
            </div>`;
            
        const btn = document.getElementById('nightmare-variant-btn');
        const teamInput = document.getElementById('nightmare-team-size');
        
        btn.addEventListener('click', function() {
            const isPhosani = this.value === 'phosani';
            
            if (isPhosani) {
                this.value = 'standard';
                this.innerText = 'Standard Mode';
                this.style.borderColor = 'var(--border)';
                this.style.color = 'var(--text)';
                this.style.background = 'rgba(255,255,255,0.05)';
                teamInput.disabled = false;
                teamInput.style.opacity = '1';
            } else {
                this.value = 'phosani';
                this.innerText = "Phosani's Variant"; 
                this.style.borderColor = 'var(--accent-orange)';
                this.style.color = 'var(--accent-orange)';
                this.style.background = 'rgba(249, 115, 22, 0.05)';
                teamInput.value = 1;
                teamInput.disabled = true;
                teamInput.style.opacity = '0.5';
            }
        });
    },
    'yama': (container) => {
        container.innerHTML = `
            <div class="input-group">
                <label>Contribution %</label>
                <input type="number" id="yama-contribution" value="100" min="0" max="100">
            </div>`;
            
        document.getElementById('yama-contribution').addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            e.target.value = isNaN(val) || val < 0 ? 0 : Math.min(val, 100);
        });
    },
    'tempoross': (container) => {
        container.innerHTML = `
            <div class="input-group">
                <label>Points per Game</label>
                <input type="number" id="tempoross-points" value="4000" min="0">
            </div>`;
    },
    'wintertodt': (container) => {
        container.innerHTML = `
            <div class="input-group">
                <label>Points per Game</label>
                <input type="number" id="wintertodt-points" value="750" min="500">
            </div>`;
    },
    'zalcano': (container) => {
        container.innerHTML = `
            <div class="input-group">
                <label>Contribution %</label>
                <input type="number" id="zalcano-contribution" value="100" min="0" max="100">
            </div>`;
    },
    'royal_titans': (container) => {
        container.innerHTML = `
            <div class="input-row" style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button type="button" id="titan-target-btn" value="branda" 
                    style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid #ef4444; color: #ef4444; border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer;">
                    Target: Branda
                </button>
                <button type="button" id="titan-action-btn" value="loot" 
                    style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer;">
                    Loot: Standard
                </button>
            </div>
            <div class="input-group">
                <label>Contribution %</label>
                <input type="number" id="titan-contribution" value="100" min="0" max="100">
            </div>`;
        
        document.getElementById('titan-target-btn').addEventListener('click', function() {
            const isCurrentlyBranda = this.value === 'branda';
            this.value = isCurrentlyBranda ? 'eldric' : 'branda';
            
            if (this.value === 'branda') {
                this.innerText = 'Target: Branda';
                this.style.borderColor = this.style.color = '#ef4444';
            } else {
                this.innerText = 'Target: Eldric';
                this.style.borderColor = this.style.color = '#3b82f6';
            }
        });

        document.getElementById('titan-action-btn').addEventListener('click', function() {
            const isLooting = this.value === 'loot';
            this.value = isLooting ? 'sacrifice' : 'loot';
            this.innerText = isLooting ? 'Loot: Sacrifice' : 'Loot: Standard';
            
            const isActive = this.value === 'sacrifice';
            this.style.borderColor = isActive ? 'var(--accent-orange)' : 'var(--border)';
            this.style.color = isActive ? 'var(--accent-orange)' : 'var(--text)';

            if (isActive) forceItemSelection(["Bran"]);
            else unlockItemSelection();
        });
    },
    'araxxor': (container) => {
        container.innerHTML = `
            <button type="button" id="araxxor-sacrifice-btn" value="false" 
                style="width: 100%; margin-bottom: 12px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                Loot Egg Sac (Standard)
            </button>`;
        
        document.getElementById('araxxor-sacrifice-btn').addEventListener('click', function() {
            const newState = this.value === 'false'; 
            this.value = newState ? 'true' : 'false';

            if (newState) {
                this.innerText = 'Smash Egg Sac (2x Pet)';
                this.style.borderColor = 'var(--accent-orange)';
                this.style.color = 'var(--accent-orange)';
                this.style.background = 'rgba(249, 115, 22, 0.05)';
                forceItemSelection(["Nid"]);
            } else {
                this.innerText = 'Loot Egg Sac (Standard)';
                this.style.borderColor = 'var(--border)';
                this.style.color = 'var(--text)';
                this.style.background = 'rgba(255,255,255,0.05)';
                unlockItemSelection();
            }
        });
    }
};

DT2_BOSSES.forEach(boss => {
    BOSS_UI_INJECTORS[boss] = (container) => {
        container.innerHTML = `
            <button type="button" id="dt2-awakened-btn" value="false" 
                style="width: 100%; margin-top: 8px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                Standard Variant
            </button>`;
        
        document.getElementById('dt2-awakened-btn').addEventListener('click', function() {
            const isActive = this.value === 'false';
            this.value = isActive ? 'true' : 'false';
            this.innerText = isActive ? 'Awakened Variant (3x Uniques)' : 'Standard Variant';
            this.style.borderColor = isActive ? 'var(--accent-orange)' : 'var(--border)';
            this.style.color = isActive ? 'var(--accent-orange)' : 'var(--text)';
        });
    };
});

function renderDynamicSettings(bossKey) {
    let container = document.getElementById('dynamic-raid-settings');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'dynamic-raid-settings';
        container.style.marginBottom = '24px';
        DOM.bossPreview.insertBefore(container, document.querySelector('.collection-header'));
    }

    const injector = BOSS_UI_INJECTORS[bossKey];
    if (injector) {
        injector(container);
    } else {
        container.innerHTML = ''; 
    }
}

// ==========================================
// CUSTOM UI TOAST
// ==========================================
function showToast(message, isError = true) {
    let toast = document.getElementById("custom-toast");
    
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "custom-toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    
    const icon = isError ? "⚠️" : "ℹ️";
    const color = isError ? "var(--accent-orange)" : "var(--accent-green)";
    
    toast.style.borderColor = color;
    toast.style.boxShadow = `0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(var(--${isError ? 'accent-orange' : 'accent-green'}-rgb), 0.2)`;
    toast.innerHTML = `<span style="color: ${color}; font-size: 18px;">${icon}</span> ${message}`;
    
    void toast.offsetWidth;
    toast.classList.add("show");
    
    if (toast.timeoutId) clearTimeout(toast.timeoutId);
    toast.timeoutId = setTimeout(() => {
        toast.classList.remove("show");
    }, 4000);
}

// ==========================================
// EVENT BINDINGS
// ==========================================
function bindEvents() {
    if (DOM.bossSelect) DOM.bossSelect.addEventListener('change', handleBossSelection);
    if (DOM.itemGrid) DOM.itemGrid.addEventListener('click', toggleItemSelection);
    
    document.querySelectorAll(".kc-btn[data-add]").forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });

    if (DOM.kcInput) {
        DOM.kcInput.addEventListener('input', () => {
            if (!DOM.resultsSection.classList.contains("hidden")) {
                handleCalculation();
            }
        });
    }

    if (DOM.kcResetBtn) {
        DOM.kcResetBtn.addEventListener('click', () => { 
            if (DOM.kcInput) {
                DOM.kcInput.value = 0; 
                if (!DOM.resultsSection.classList.contains("hidden")) handleCalculation();
            }
        });
    }
    
    if (DOM.selectAllBtn) DOM.selectAllBtn.addEventListener('click', (e) => { e.preventDefault(); setAllItemsSelection(true); });
    if (DOM.selectNoneBtn) DOM.selectNoneBtn.addEventListener('click', (e) => { e.preventDefault(); setAllItemsSelection(false); });

    if (DOM.calcBtn) DOM.calcBtn.addEventListener('click', handleCalculation);

    if (DOM.mobileBtn && DOM.mobileMenu) { 
        DOM.mobileBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            DOM.mobileMenu.classList.toggle('hidden'); 
        }); 
        document.addEventListener('click', () => { DOM.mobileMenu.classList.add('hidden'); }); 
    }
}

function setupGoalCard(card) {
    const wrapper = card.querySelector('.check-all-wrapper'); 
    const checkAllBox = card.querySelector('.check-all-box');
    const goalCheckboxes = card.querySelectorAll('.goal-item input[type="checkbox"]');
    
    if (!wrapper || !checkAllBox || goalCheckboxes.length === 0) return;

    const getStorageKey = (name) => `goal-${name.trim().replace(/\s+/g, '-')}`;

    const updateMasterVisuals = () => {
        const checkedCount = card.querySelectorAll('.goal-item input[type="checkbox"]:checked').length;
        
        wrapper.classList.remove('is-checked', 'is-indeterminate');
        checkAllBox.checked = checkedCount === goalCheckboxes.length;
        checkAllBox.indeterminate = checkedCount > 0 && checkedCount < goalCheckboxes.length;

        if (checkAllBox.checked) wrapper.classList.add('is-checked');
        else if (checkAllBox.indeterminate) wrapper.classList.add('is-indeterminate');
    };

    goalCheckboxes.forEach(cb => {
        const nameEl = cb.closest('.goal-item').querySelector('.goal-name');
        if (!nameEl) return;
        
        const saveKey = getStorageKey(nameEl.textContent);
        cb.checked = localStorage.getItem(saveKey) === 'true';
        
        cb.addEventListener('change', () => {
            localStorage.setItem(saveKey, cb.checked);
            updateMasterVisuals();
        });
    });
    
    checkAllBox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        goalCheckboxes.forEach(cb => { 
            cb.checked = isChecked; 
            const nameEl = cb.closest('.goal-item').querySelector('.goal-name'); 
            if (nameEl) localStorage.setItem(getStorageKey(nameEl.textContent), isChecked); 
        });
        updateMasterVisuals();
    });
    
    updateMasterVisuals();
}

function initGoalTracking() {
    document.querySelectorAll('#ironman-goals .card').forEach(setupGoalCard);
}

function handleBossSelection(e) {
    activeBossKey = e.target.value;
    if (!activeBossKey) { 
        DOM.bossPreview.classList.add("hidden"); 
        return; 
    }
    renderItemGrid(BOSS_CONFIG[activeBossKey].items);
    renderDynamicSettings(activeBossKey);
    DOM.bossPreview.classList.remove("hidden");
}

function updateKC(amount) { 
    const currentVal = parseInt(DOM.kcInput.value, 10) || 0; 
    DOM.kcInput.value = Math.max(0, currentVal + amount);
    
    if (!DOM.resultsSection.classList.contains("hidden")) {
        handleCalculation();
    }
}

function toggleItemSelection(e) { 
    const box = e.target.closest(".item-box"); 
    if (!box || isSacrificeModeActive()) return;
    
    box.classList.toggle("selected"); 
}

function setAllItemsSelection(select) { 
    if (isSacrificeModeActive()) return;

    const action = select ? 'add' : 'remove'; 
    DOM.itemGrid.querySelectorAll(".item-box").forEach(b => b.classList[action]("selected")); 
}

function isSacrificeModeActive() {
    return isBtnTrue('araxxor-sacrifice-btn') || getStrVal('titan-action-btn', '') === 'sacrifice';
}

function renderItemGrid(items) {
    const visibleItems = items.filter(item => !item.hidden);
    const sortedItems = [...visibleItems].sort((a, b) => a.order - b.order);
    
    DOM.itemGrid.innerHTML = sortedItems.map(item => `
        <div class="item-box selected" data-id="${item.id}" data-rate="${item.rate}" data-type="${item.type}" data-pieces="${item.pieces || 1}" data-pool="${item.pool || ''}" title="${item.name}">
            <img src="${getWikiUrl(item.name)}" alt="${item.name}">
        </div>
    `).join('');
}

function getSelectedItems() {
    return Array.from(DOM.itemGrid.querySelectorAll(".item-box.selected")).map(b => ({ 
        name: b.title, 
        rate: parseFloat(b.dataset.rate), 
        type: b.dataset.type, 
        pieces: parseInt(b.dataset.pieces, 10) || 1, 
        pool: b.dataset.pool 
    }));
}

function handleCalculation() {
    const selectedItems = getSelectedItems();
    
    if (!selectedItems.length) { 
        showToast("Please select at least one item from the log.", true); 
        return; 
    }
    
    const currentKC = parseInt(DOM.kcInput.value, 10) || 0;
    const results = executeSimulation(selectedItems, currentKC);
    
    if (results) displayResults(results, currentKC);
}

// ==========================================
// SIMULATION EXECUTION & RENDERING
// ==========================================
function executeSimulation(selectedItems, currentKC) {
    const bossData = BOSS_CONFIG[activeBossKey];
    let processedItems = [...selectedItems];

    const adjuster = RATE_ADJUSTERS[activeBossKey];
    if (adjuster) {
        const bossState = STATE_EXTRACTORS[activeBossKey] ? STATE_EXTRACTORS[activeBossKey]() : {};
        processedItems = adjuster(processedItems, bossState);
    }

    const validItems = processedItems.filter(item => item.rate > 0);

    if (validItems.length === 0) {
        showToast("The current settings make it mathematically impossible to obtain the selected items.", true);
        return null;
    }

    const currentHash = generateStateHash(activeBossKey, validItems);
    let rawResults;

    if (activeSimulationCache.hash === currentHash) {
        rawResults = activeSimulationCache.rawResults;
    } else {
        let matrix;
        const rolls = bossData.rolls || 1;

        if (activeBossKey === 'moons_of_peril') {
            matrix = createMoonsMatrix(validItems);
        } else if (activeBossKey === 'barrows_chests') {
            matrix = createBarrowsMatrix(validItems.length);
        } else {
            matrix = createMasterMatrix(validItems, rolls);
        }

        rawResults = runSimulation(matrix);
        activeSimulationCache = { hash: currentHash, rawResults };
    }

    const targetP = rawResults.historyCDF[currentKC] ?? (currentKC >= rawResults.finalK ? 1 : 0);
    const curveData = buildChartData(rawResults.historyPMF, rawResults.historyCDF, rawResults.finalK, currentKC, rawResults.modeKC, rawResults.median);

    return { ...rawResults, targetP, curveData };
}

function displayResults(results, currentKC) {
    DOM.resultsSection.classList.remove("hidden");
    DOM.statChance.textContent = `${(results.targetP * 100).toFixed(2)}%`;
    
    const formatStat = (color, label, description, value) => 
        `<span style="color:${color}; font-family: var(--font-mono); font-weight: 800; font-size: 1.05em; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 6px;">${label}</span> ` +
        `<span style="color: var(--text); font-size: 1em; font-weight: 700;">${description}</span> ` +
        `<b style="color: ${color}; font-size: 1.05em; margin-left: 4px;">${value} <span style="font-size: 0.85em; opacity: 0.9;">KC</span></b>`;
        
    DOM.phraseMode.innerHTML = formatStat(COLORS.mode, "Mode", "Luckiest players finish as early as", results.modeKC.toLocaleString());
    DOM.phraseMedian.innerHTML = formatStat(COLORS.progress, "Median", "Half of players complete at or before", results.median.toLocaleString());
    DOM.phraseMean.innerHTML = formatStat(COLORS.mean, "Mean", "Average player completes at", Math.round(results.mean).toLocaleString());
    DOM.phraseUser.innerHTML = formatStat(COLORS.user, "Current", "Your current progress in the log", currentKC.toLocaleString());
    
    renderChart(results.curveData, results, currentKC);
    
    if (event && event.target && event.target.id === 'calculate-btn') {
        DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// --- CHART RENDERING ---
function formatAxisTick(val, reverseX) {
    let realKC = reverseX(val); 
    if (realKC < 1) return null; 
    
    if (realKC > 1000) realKC = Math.round(realKC / 100) * 100; 
    else if (realKC > 100) realKC = Math.round(realKC / 10) * 10; 
    else realKC = Math.round(realKC); 
    
    return realKC.toLocaleString(); 
}

function renderChart(data, stats, userKC) {
    const ctx = DOM.chartCanvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    const transformX = (x) => Math.pow(x, CHART_CONFIG.xAxisPower);
    const reverseX = (y) => Math.pow(y, 1 / CHART_CONFIG.xAxisPower);
    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);
    
    const modeY = data.find(d => d.x === stats.modeKC)?.pmf || 0;
    const medianY = data.find(d => d.x === stats.median)?.cdf || 0;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { 
            datasets: [ 
                createDataset('Luck (PMF)', data, transformX, 'pmf', COLORS.mode, 'yPMF'), 
                createDataset('Progress (CDF)', data, transformX, 'cdf', COLORS.progress, 'yCDF', 2) 
            ] 
        },
        options: getChartOptions(transformX, reverseX, xMaxRaw, stats, userKC, modeY, medianY)
    });
}

function createDataset(label, data, transformX, yKey, color, yAxisID, borderWidth = 3) {
    return { 
        label: label, 
        data: data.map(d => ({ x: transformX(d.x), y: d[yKey], rawX: d.x })), 
        borderColor: color, 
        borderWidth: borderWidth, 
        pointRadius: 0, 
        yAxisID: yAxisID, 
        tension: 0.2, 
        cubicInterpolationMode: 'monotone', 
        fill: false 
    };
}

function getChartOptions(transformX, reverseX, xMaxRaw, stats, userKC, modeY, medianY) {
    return { 
        responsive: true, 
        maintainAspectRatio: false, 
        animation: false, 
        interaction: { mode: 'index', intersect: false }, 
        scales: getChartScales(transformX, reverseX, xMaxRaw), 
        plugins: getChartPlugins(transformX, stats, userKC, modeY, medianY) 
    };
}

function getChartScales(transformX, reverseX, xMaxRaw) {
     return {
        x: { 
            type: 'linear', 
            min: transformX(1), 
            max: transformX(xMaxRaw), 
            grid: { color: 'rgba(68, 64, 60, 0.2)', drawTicks: false }, 
            ticks: { 
                color: CHART_CONFIG.textColor, 
                font: { size: 10, weight: 700 }, 
                maxTicksLimit: 8, 
                callback: function(val) { return formatAxisTick(val, reverseX); } 
            } 
        },
        yPMF: { display: false }, 
        yCDF: { 
            display: true, 
            position: 'right', 
            min: 0, 
            max: 1, 
            grid: { display: false }, 
            ticks: { 
                callback: v => (v * 100).toFixed(0) + '%', 
                color: COLORS.progress, 
                font: { size: 10, weight: 700 } 
            } 
        }
    };
}

function getChartPlugins(transformX, stats, userKC, modeY, medianY) {
    return {
        legend: { display: false },
        tooltip: { 
            backgroundColor: 'rgba(10,10,10,0.95)', 
            borderColor: '#44403c', 
            borderWidth: 1, 
            padding: 12, 
            titleFont: { weight: 900, size: 13 }, 
            bodyFont: { weight: 600, size: 12 }, 
            callbacks: { 
                title: items => `KC: ${items[0].raw.rawX.toLocaleString()}`, 
                label: c => {
                    if (c.raw.y === 0) return null;
                    return c.datasetIndex === 0 
                        ? ` Luck Chance: ~1/${Math.round(1 / c.raw.y).toLocaleString()}` 
                        : ` Chance For Completion: ${(c.raw.y * 100).toFixed(2)}%`;
                }
            } 
        },
        annotation: { 
            annotations: { 
                modePoint: { type: 'point', xValue: transformX(stats.modeKC), yValue: modeY, yScaleID: 'yPMF', backgroundColor: COLORS.mode, borderColor: '#fff', borderWidth: 2, radius: 5 }, 
                medianPoint: { type: 'point', xValue: transformX(stats.median), yValue: medianY, yScaleID: 'yCDF', backgroundColor: COLORS.progress, borderColor: '#fff', borderWidth: 2, radius: 5 }, 
                mean: { type: 'line', xMin: transformX(stats.mean), xMax: transformX(stats.mean), borderColor: 'rgba(249, 115, 22, 0.8)', borderWidth: 2, borderDash: [5,5], label: { display: false } }, 
                user: { type: 'line', xMin: transformX(userKC), xMax: transformX(userKC), borderColor: COLORS.user, borderWidth: 2, borderDash: [6, 4], shadowBlur: 10, shadowColor: COLORS.user } 
            } 
        }
    };
}

function forceItemSelection(allowedNames) {
    DOM.itemGrid.querySelectorAll(".item-box").forEach(box => {
        const isAllowed = allowedNames.includes(box.title);
        box.classList.toggle("selected", isAllowed);
        
        box.style.opacity = isAllowed ? "1" : "0.3";
        box.style.pointerEvents = isAllowed ? "auto" : "none";
    });
}

function unlockItemSelection() {
    DOM.itemGrid.querySelectorAll(".item-box").forEach(box => {
        box.style.opacity = "1";
        box.style.pointerEvents = "auto";
    });
}

initApp();