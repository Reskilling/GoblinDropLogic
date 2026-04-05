/**
 * @file app.js
 * Main UI Controller for DropLogic.
 */

import { createMasterMatrix, createBarrowsMatrix, createMoonsMatrix } from './matrix.js';
import { BOSS_CONFIG, getWikiUrl, formatBossName } from './data.js';
import { runSimulation } from './solvers.js';

const CHART_FONT = "'Inter', sans-serif";
const CHART_TEXT_COLOR = '#a8a29e';
const COLORS = { mode: '#ef4444', progress: '#3b82f6', mean: '#f97316', user: '#22c55e' };
const X_AXIS_POWER = 0.4;
const DT2_BOSSES = ['vardorvis', 'duke_sucellus', 'the_whisperer', 'the_leviathan'];

let activeBossKey = "";
let chartInstance = null;

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

function initApp() {
    setupChartDefaults();
    populateBossSelect();
    bindEvents();
    initGoalTracking();
}

function setupChartDefaults() {
    Chart.defaults.font.family = CHART_FONT;
    Chart.defaults.color = CHART_TEXT_COLOR;
}

function populateBossSelect() {
    const defaultOption = '<option value="">Select Boss Intel...</option>';
    const bossOptions = Object.keys(BOSS_CONFIG)
        .sort()
        .map(key => `<option value="${key}">${formatBossName(key)}</option>`)
        .join('');
    DOM.bossSelect.innerHTML = defaultOption + bossOptions;
}

// --- DYNAMIC UI INJECTOR ---
/**
 * @file app.js (Dynamic UI Component)
 * Generates boss-specific input controls and handles UI state lockdowns.
 */

function renderDynamicSettings(bossKey) {
    let container = document.getElementById('dynamic-raid-settings');
    
    // Create container if it doesn't exist
    if (!container) {
        container = document.createElement('div');
        container.id = 'dynamic-raid-settings';
        container.style.marginBottom = '24px';
        DOM.bossPreview.insertBefore(container, document.querySelector('.collection-header'));
    }

    switch (bossKey) {
        case 'chambers_of_xeric':
            container.innerHTML = `
                <div class="input-group">
                    <label>Average Team Points</label>
                    <input type="number" id="raid-cox-pts" value="30000" min="0">
                </div>`;
            break;
            
        case 'theatre_of_blood':
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
            break;
            
        case 'tombs_of_amascut':
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
            break;
            
        case 'doom_of_mokhaiotl':
            container.innerHTML = `
                <div class="input-group">
                    <label>Delve Level (Max 15)</label>
                    <input type="number" id="doom-delve-level" value="9" min="2" max="15">
                </div>`;
            
            document.getElementById('doom-delve-level').addEventListener('change', function() {
                let val = parseInt(this.value, 10);
                if (isNaN(val) || val < 2) this.value = 2;
                else if (val > 15) this.value = 15;
            });
            break;
            
        case 'fortis_colosseum':
            container.innerHTML = `
                <button type="button" id="colo-sacrifice-btn" value="false" 
                    style="width: 100%; margin-top: 8px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                    Keep Quivers (Standard)
                </button>`;
            
            document.getElementById('colo-sacrifice-btn').addEventListener('click', function() {
                const isSacrificing = this.value === 'true';
                this.value = isSacrificing ? 'false' : 'true';
                this.innerText = isSacrificing ? 'Keep Quivers (Standard)' : 'Sacrifice Quivers for Pet Chance';
                this.style.borderColor = isSacrificing ? 'var(--border)' : 'var(--accent-orange)';
                this.style.color = isSacrificing ? 'var(--text)' : 'var(--accent-orange)';
                this.style.background = isSacrificing ? 'rgba(255,255,255,0.05)' : 'rgba(249, 115, 22, 0.05)';
            });
            break;

        case 'the_nightmare':
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
            
            document.getElementById('nightmare-variant-btn').addEventListener('click', function() {
                const isPhosani = this.value === 'phosani';
                const teamInput = document.getElementById('nightmare-team-size');
                
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
            break;

        case 'yama':
            container.innerHTML = `
                <div class="input-group">
                    <label>Contribution %</label>
                    <input type="number" id="yama-contribution" value="100" min="0" max="100">
                </div>`;
            
            document.getElementById('yama-contribution').addEventListener('change', function() {
                let val = parseInt(this.value, 10);
                if (isNaN(val) || val < 0) this.value = 0;
                else if (val > 100) this.value = 100;
            });
            break;

        case 'tempoross':
            container.innerHTML = `
                <div class="input-group">
                    <label>Points per Game</label>
                    <input type="number" id="tempoross-points" value="4000" min="0">
                </div>`;
            break;

        case 'wintertodt':
            container.innerHTML = `
                <div class="input-group">
                    <label>Points per Game</label>
                    <input type="number" id="wintertodt-points" value="750" min="500">
                </div>`;
            break;

        case 'zalcano':
            container.innerHTML = `
                <div class="input-group">
                    <label>Contribution %</label>
                    <input type="number" id="zalcano-contribution" value="100" min="0" max="100">
                </div>`;
            break;

        case 'royal_titans':
            container.innerHTML = `
                <div class="input-row" style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <button type="button" id="titan-target-btn" value="branda" 
                        style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer;">
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
                const isBranda = this.value === 'branda';
                this.value = isBranda ? 'eldric' : 'branda';
                this.innerText = isBranda ? 'Target: Eldric' : 'Target: Branda';
                this.style.borderColor = isBranda ? '#3b82f6' : 'var(--border)';
                this.style.color = isBranda ? '#3b82f6' : 'var(--text)';
            });

            document.getElementById('titan-action-btn').addEventListener('click', function() {
                const isLooting = this.value === 'loot';
                this.value = isLooting ? 'sacrifice' : 'loot';
                this.innerText = isLooting ? 'Loot: Sacrifice' : 'Loot: Standard';
                
                const active = this.value === 'sacrifice';
                this.style.borderColor = active ? 'var(--accent-orange)' : 'var(--border)';
                this.style.color = active ? 'var(--accent-orange)' : 'var(--text)';

                if (active) forceItemSelection(["Bran"]);
                else unlockItemSelection();
            });
            break;

        case 'araxxor':
            container.innerHTML = `
                <button type="button" id="araxxor-sacrifice-btn" value="false" 
                    style="width: 100%; margin-bottom: 12px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                    Loot Egg Sac (Standard)
                </button>`;
            
            document.getElementById('araxxor-sacrifice-btn').addEventListener('click', function() {
                const newState = this.value === 'false'; // Toggle state
                this.value = newState ? 'true' : 'false';

                if (newState) {
                    // ACTIVE SACRIFICE STATE
                    this.innerText = 'Smash Egg Sac (2x Pet)';
                    this.style.borderColor = 'var(--accent-orange)';
                    this.style.color = 'var(--accent-orange)';
                    this.style.background = 'rgba(249, 115, 22, 0.05)';
                    forceItemSelection(["Nid"]);
                } else {
                    // STANDARD LOOT STATE
                    this.innerText = 'Loot Egg Sac (Standard)';
                    this.style.borderColor = 'var(--border)';
                    this.style.color = 'var(--text)';
                    this.style.background = 'rgba(255,255,255,0.05)';
                    unlockItemSelection();
                }
            });
            break;
            
        default:
            if (DT2_BOSSES.includes(bossKey)) {
                container.innerHTML = `
                    <button type="button" id="dt2-awakened-btn" value="false" 
                        style="width: 100%; margin-top: 8px; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: var(--font-primary); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                        Standard Variant
                    </button>`;
                
                document.getElementById('dt2-awakened-btn').addEventListener('click', function() {
                    const active = this.value === 'false';
                    this.value = active ? 'true' : 'false';
                    this.innerText = active ? 'Awakened Variant (3x Uniques)' : 'Standard Variant';
                    this.style.borderColor = active ? 'var(--accent-orange)' : 'var(--border)';
                    this.style.color = active ? 'var(--accent-orange)' : 'var(--text)';
                });
            } else {
                container.innerHTML = ''; 
            }
            break;
    }
}

// ... [Keep bindEvents, initGoalTracking, UI handlers exact as they are] ...
function bindEvents() {
    if (DOM.bossSelect) DOM.bossSelect.addEventListener('change', handleBossSelection);
    if (DOM.itemGrid) DOM.itemGrid.addEventListener('click', toggleItemSelection);
    
    document.querySelectorAll(".kc-btn[data-add]").forEach(btn => {
        btn.addEventListener('click', () => updateKC(parseInt(btn.dataset.add, 10)));
    });

    if (DOM.kcResetBtn) DOM.kcResetBtn.addEventListener('click', () => { if (DOM.kcInput) DOM.kcInput.value = 0; });
    
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

function initGoalTracking() {
    const goalCards = document.querySelectorAll('#ironman-goals .card');
    goalCards.forEach(card => {
        const wrapper = card.querySelector('.check-all-wrapper'); 
        const checkAllBox = card.querySelector('.check-all-box');
        const goalCheckboxes = card.querySelectorAll('.goal-item input[type="checkbox"]');
        if (!wrapper || !checkAllBox || goalCheckboxes.length === 0) return;

        const updateMasterVisuals = () => {
            const total = goalCheckboxes.length;
            const checkedCount = card.querySelectorAll('.goal-item input[type="checkbox"]:checked').length;
            
            wrapper.classList.remove('is-checked', 'is-indeterminate');
            if (checkedCount === 0) { 
                checkAllBox.checked = false; 
                checkAllBox.indeterminate = false; 
            } else if (checkedCount === total) { 
                checkAllBox.checked = true; 
                checkAllBox.indeterminate = false; 
                wrapper.classList.add('is-checked'); 
            } else { 
                checkAllBox.checked = false; 
                checkAllBox.indeterminate = true; 
                wrapper.classList.add('is-indeterminate'); 
            }
        };

        const getStorageKey = (name) => `goal-${name.trim().replace(/\s+/g, '-')}`;

        goalCheckboxes.forEach(cb => {
            const nameEl = cb.closest('.goal-item').querySelector('.goal-name');
            if (nameEl) {
                const saveKey = getStorageKey(nameEl.textContent);
                if (localStorage.getItem(saveKey) === 'true') cb.checked = true;
                cb.addEventListener('change', () => localStorage.setItem(saveKey, cb.checked));
            }
        });
        
        updateMasterVisuals();

        checkAllBox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            goalCheckboxes.forEach(cb => { 
                cb.checked = isChecked; 
                const nameEl = cb.closest('.goal-item').querySelector('.goal-name'); 
                if (nameEl) {
                    localStorage.setItem(getStorageKey(nameEl.textContent), isChecked); 
                }
            });
            updateMasterVisuals();
        });
        
        goalCheckboxes.forEach(cb => cb.addEventListener('change', updateMasterVisuals));
    });
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
    DOM.kcInput.value = currentVal + amount; 
}

function toggleItemSelection(e) { 
    const box = e.target.closest(".item-box"); 
    if (!box) return;

    // BLOCKER: Prevent manual selection changes during Sacrifice modes
    if (isSacrificeModeActive()) {
        return; 
    }

    box.classList.toggle("selected"); 
}

function setAllItemsSelection(select) { 
    // BLOCKER: Prevent "Select All" from ruining sacrifice rates
    if (isSacrificeModeActive()) {
        return;
    }

    const action = select ? 'add' : 'remove'; 
    DOM.itemGrid.querySelectorAll(".item-box").forEach(b => b.classList[action]("selected")); 
}

/**
 * Helper to determine if the UI should be locked to Pet-Only mode.
 */
function isSacrificeModeActive() {
    const araxxorBtn = document.getElementById('araxxor-sacrifice-btn');
    if (araxxorBtn && araxxorBtn.value === 'true') return true;

    const titanAction = document.getElementById('titan-action-btn');
    if (titanAction && titanAction.value === 'sacrifice') return true;

    return false;
}

function handleCalculation() {
    const selectedItems = getSelectedItems();
    if (!selectedItems.length) { 
        alert("Select at least one item!"); 
        return; 
    }
    const currentKC = parseInt(DOM.kcInput.value, 10) || 0;
    const results = executeSimulation(selectedItems, currentKC);
    displayResults(results, currentKC);
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
// ... [End UI Handlers] ...
// --- RATE ADJUSTMENT FUNCTIONS ---
function adjustRatesForDoom(items) {
    let rawLevel = parseInt(document.getElementById('doom-delve-level').value, 10) || 9;
    
    // Clamp the input to our realistic infinite dive cap of 15
    const targetLevel = Math.min(Math.max(rawLevel, 2), 15);
    
    // Base rates per individual floor
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

        // A full run rolls the loot table at every floor reached.
        for (let floor = 2; floor <= targetLevel; floor++) {
            // If the floor is 9 or above, it uses the maxed-out floor 9 rate
            const rateKey = floor >= 9 ? 9 : floor;
            
            if (itemRates[rateKey]) {
                canRoll = true;
                chanceToFailAll *= (1 - (1 / itemRates[rateKey]));
            }
        }

        if (canRoll) {
            // The overall chance of getting the item at least once during the entire dive
            const cumulativeChance = 1 - chanceToFailAll;
            return { ...item, rate: cumulativeChance };
        } else {
            return { ...item, rate: 0 }; 
        }
    });
}

function adjustRatesForAraxxor(items) {
    const btn = document.getElementById('araxxor-sacrifice-btn');
    const isSacrificing = btn ? btn.value === 'true' : false;

    return items.map(item => {
        // 1. Handle Pet Mechanics
        if (item.name === "Nid") {
            return { ...item, rate: isSacrificing ? 1/1500 : 1/3000 };
        }

        // 2. Handle Main Table Drops (Nullified if sacrificing)
        if (isSacrificing && item.type === 'main') {
            return { ...item, rate: 0 };
        }

        // Tertiary drops (like the Araxyte head or Jar of venom) still roll 
        // at their standard rates even when the main loot is sacrificed.
        return item;
    });
}

function adjustRatesForTitans(items) {
    // Update these selectors to match the new button IDs
    const target = document.getElementById('titan-target-btn').value;
    const action = document.getElementById('titan-action-btn').value;
    
    let contrib = parseInt(document.getElementById('titan-contribution').value, 10);
    if (isNaN(contrib) || contrib < 0) contrib = 0;
    if (contrib > 100) contrib = 100;
    
    const cFrac = contrib / 100;

    return items.map(item => {
        const baseRate = item.rate;

        if (item.name === "Bran") {
            return { ...item, rate: action === 'sacrifice' ? 1/1500 : 1/3000 };
        }

        if (action !== 'loot' || cFrac === 0) {
            return { ...item, rate: 0 };
        }

        if (target === 'branda') {
            if (["Deadeye prayer scroll", "Ice element staff crown"].includes(item.name)) {
                return { ...item, rate: 0 };
            }
        } else if (target === 'eldric') {
            if (["Mystic vigour prayer scroll", "Fire element staff crown"].includes(item.name)) {
                return { ...item, rate: 0 };
            }
        }

        return { ...item, rate: baseRate * cFrac };
    });
}

function adjustRatesForTempoross(items) {
    let pts = parseInt(document.getElementById('tempoross-points').value, 10);
    if (isNaN(pts) || pts < 0) pts = 0;
    
    // 1 permit at 2000 pts, +1 permit for every 700 pts thereafter
    let rolls = 0;
    if (pts >= 2000) {
        rolls = 1 + (pts - 2000) / 700;
    }

    if (rolls === 0) return items.map(item => ({ ...item, rate: 0 }));

    return items.map(item => ({
        ...item,
        // Cumulative probability of getting the item at least once across all game rolls
        rate: 1 - Math.pow(1 - item.rate, rolls),
        // Force to tertiary so the matrix evaluates this calculated game-chance independently
        type: "tertiary" 
    }));
}

function adjustRatesForWintertodt(items) {
    let pts = parseInt(document.getElementById('wintertodt-points').value, 10);
    if (isNaN(pts) || pts < 500) pts = 500;
    
    // 500 points = 2 rolls, +1 roll for every 500 points thereafter
    const rolls = 1 + (pts / 500);

    // Calculate the chance of getting each item on a SINGLE reward roll using the sequential cascade
    let runningProb = 1.0;
    const rollRates = {};

    const cascadeRates = [
        { name: "Phoenix", rate: 1/5000 },
        { name: "Dragon axe", rate: 1/10000 },
        { name: "Tome of fire (empty)", rate: 1/1000 },
        { name: "Warm gloves", rate: 1/150 },
        { name: "Bruma torch", rate: 1/150 },
        { name: "Pyromancer garb", rate: 1/150 }, // Acts as the generic "pyro piece" pool
        { name: "Burnt page", rate: 1/45 }
    ];

    cascadeRates.forEach(drop => {
        rollRates[drop.name] = drop.rate * runningProb;
        runningProb *= (1 - drop.rate);
    });

    // Apply the generic pyro chance to all specific Pyromancer pieces
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

function adjustRatesForZalcano(items) {
    let contrib = parseInt(document.getElementById('zalcano-contribution').value, 10);
    if (isNaN(contrib) || contrib < 0) contrib = 0;
    if (contrib > 100) contrib = 100;
    
    const cFrac = contrib / 100;

    if (cFrac === 0) return items.map(item => ({ ...item, rate: 0 }));

    // The 1/200 table roll is split: 39/40 chance for Tool Seed, 1/40 chance for Onyx
    const rates = {
        "Smolcano": 1/2250,
        "Crystal tool seed": (1/200) * (39/40) * cFrac,
        "Uncut onyx": (1/200) * (1/40) * cFrac,
        "Zalcano shard": 1 / (1500 - (750 * cFrac))
    };

    return items.map(item => ({
        ...item,
        rate: rates[item.name] !== undefined ? rates[item.name] : item.rate,
        type: "tertiary"
    }));
}

function adjustRatesForYama(items) {
    let rawPoints = parseInt(document.getElementById('yama-contribution').value, 10);
    if (isNaN(rawPoints)) rawPoints = 100;
    
    // Convert percentage (e.g., 50%) to a multiplier (e.g., 0.5)
    const points = Math.min(Math.max(rawPoints, 0), 100) / 100;

    // Minimum damage threshold (15%) to roll non-junk loot
    if (points < 0.15) {
        return items.map(item => ({ ...item, rate: 0 }));
    }

    // Yama uses a Sequential Cascading Drop Table. 
    // We must track the probability of "failing" the previous tiers to calculate the true drop rate.
    let runningProb = 1.0;

    // 1. Uniques (Scales with points)
    const rareSum = (1/120) * points;
    const helmRate = (1/600) * points * runningProb;
    const chestRate = (1/600) * points * runningProb;
    const legsRate = (1/600) * points * runningProb;
    const hornRate = (1/300) * points * runningProb;
    runningProb *= (1 - rareSum);

    // 2. Dossier (Scales with points)
    // *CRITICAL*: Even though the Dossier is hidden from the UI, its mathematical roll 
    // still occurs in-game. We must calculate its failure chance to accurately reduce 
    // the probability mass that trickles down to the Lockbox and Shards.
    const dossierRate = (1/12) * points * runningProb;
    runningProb *= (1 - ((1/12) * points));

    // 3. Forgotten Lockbox (Static rate)
    const lockboxRate = (1/30) * runningProb;
    runningProb *= (1 - (1/30));

    // 4. Oathplate shards (Static rate)
    const shardsRate = (1/15) * runningProb;
    runningProb *= (1 - (1/15));

    // 5. Standard Table Drops (Only tracking log-relevant items)
    const tallowRate = (5/78) * runningProb;

    // Build the dynamic dictionary. Items removed from drops.js have been purged here as well.
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
        rate: yamaRates[item.name] !== undefined ? yamaRates[item.name] : item.rate
    }));
}

function adjustRatesForColosseum(items) {
    const btn = document.getElementById('colo-sacrifice-btn');
    const isSacrificing = btn ? btn.value === 'true' : false;
    
    return items.map(item => {
        if (item.name === 'Smol heredit' && isSacrificing) {
            // Models two independent 1/200 rolls: 1 - (1 - 1/200)^2
            const doubleRollChance = 1 - Math.pow((1 - item.rate), 2);
            return { ...item, rate: doubleRollChance };
        }
        return item;
    });
}

function adjustRatesForCox(items) {
    const pts = parseInt(document.getElementById('raid-cox-pts').value, 10) || 30000;
    const uniqueChance = pts / 867600; 
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 69) };
        if (item.name === 'Olmlet') return { ...item, rate: uniqueChance * item.rate };
        return item;
    });
}

function adjustRatesForTob(items) {
    const size = parseInt(document.getElementById('raid-tob-size').value, 10) || 3;
    const deaths = parseInt(document.getElementById('raid-tob-deaths').value, 10) || 0;
    const maxPts = (18 * size) + 14;
    const earnedPts = Math.max(0, maxPts - (deaths * 4));
    const uniqueChance = (1 / 9.1) * (earnedPts / maxPts);
    return items.map(item => {
        if (item.type === 'main') return { ...item, rate: uniqueChance * (item.rate / 19) };
        return item;
    });
}

function adjustRatesForToa(items) {
    const level = parseInt(document.getElementById('raid-toa-level').value, 10) || 150;
    const pts = parseInt(document.getElementById('raid-toa-pts').value, 10) || 15000;
    
    let adjLevel = level;
    if (adjLevel > 310) { 
        if (adjLevel > 430) adjLevel = 430 + Math.floor((adjLevel - 430) / 2); 
        adjLevel = 310 + Math.floor((adjLevel - 310) / 3); 
    }
    
    const denom = 100 * (10500 - 20 * adjLevel);
    const uniqueChance = pts / denom;

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
            return { ...item, rate: pts / petDenom };
        }
        return item;
    });
}

function adjustRatesForDT2(items) {
    const btn = document.getElementById('dt2-awakened-btn');
    const isAwakened = btn ? btn.value === 'true' : false;
    
    if (isAwakened) {
        return items.map(item => {
            if (item.type === 'main') return { ...item, rate: item.rate * 3 };
            return item;
        });
    }
    return items;
}

function adjustRatesForNightmare(items) {
    const variant = document.getElementById('nightmare-variant-btn').value;
    let teamSize = parseInt(document.getElementById('nightmare-team-size').value, 10) || 1;
    teamSize = Math.min(Math.max(teamSize, 1), 80);

    if (variant === 'phosani') {
        // Phosani's uses a distinct, static drop table (updated via Project Rebalance). 
        // We override the baseline JSON data entirely to apply the exact effective rates,
        // rather than recalculating the 8% staff-to-mace shift on the fly.
        const phosaniRates = {
            "Little nightmare": 1 / 1400,
            "Inquisitor's mace": 1 / 1129,
            "Inquisitor's great helm": 1 / 700,
            "Inquisitor's hauberk": 1 / 700,
            "Inquisitor's plateskirt": 1 / 700,
            "Nightmare staff": 1 / 507.2,
            "Volatile orb": 1 / 1600,
            "Harmonised orb": 1 / 1600,
            "Eldritch orb": 1 / 1600,
            "Jar of dreams": 1 / 4000,
            "Slepey tablet": 1 / 25,
            "Parasitic egg": 1 / 200
        };
        
        return items.map(item => ({
            ...item,
            rate: phosaniRates[item.name] || item.rate
        }));
        
    } else {
        // Standard Nightmare:
        // If a team is larger than 5, they gain +1% chance per player to roll the unique table 
        // a SECOND time (capped at 75% for 80 players). 
        // This scaling factor is applied to the base rate, and then divided by the team size 
        // to yield the player's personal expected drop rate.
        const scale = 1 + (Math.max(0, Math.min(teamSize - 5, 75)) / 100);
        
        return items.map(item => {
            // These items are mathematically impossible in the standard encounter.
            if (item.name === "Slepey tablet" || item.name === "Parasitic egg") {
                return { ...item, rate: 0 }; 
            }
            
            // The pet logic scales differently than standard tertiary items
            if (item.name === "Little nightmare") {
                const petRate = teamSize <= 5 ? 1 / (800 * teamSize) : 1 / 4000;
                return { ...item, rate: petRate };
            }
            
            if (item.name === "Jar of dreams") {
                return { ...item, rate: 1 / (2000 * teamSize) };
            }
            
            // Uniques
            if (item.type === "main") {
                const personalRate = (item.rate * scale) / teamSize;
                return { ...item, rate: personalRate };
            }
            
            return item;
        });
    }
}
// --- END RATE ADJUSTMENT ---

// --- SIMULATION EXECUTION ---
function executeSimulation(selectedItems, currentKC) {
    const bossData = BOSS_CONFIG[activeBossKey];
    let processedItems = [...selectedItems];

    // Route items through their respective modifier logic before building the matrix
    if (activeBossKey === 'chambers_of_xeric') {
        processedItems = adjustRatesForCox(processedItems);
    } else if (activeBossKey === 'theatre_of_blood') {
        processedItems = adjustRatesForTob(processedItems);
    } else if (activeBossKey === 'tombs_of_amascut') {
        processedItems = adjustRatesForToa(processedItems);
    } else if (DT2_BOSSES.includes(activeBossKey)) {
        processedItems = adjustRatesForDT2(processedItems);
    } else if (activeBossKey === 'doom_of_mokhaiotl') {
        processedItems = adjustRatesForDoom(processedItems);
    } else if (activeBossKey === 'fortis_colosseum') {
        processedItems = adjustRatesForColosseum(processedItems);
    } else if (activeBossKey === 'the_nightmare') {
        processedItems = adjustRatesForNightmare(processedItems);
    } else if (activeBossKey === 'yama') {
        processedItems = adjustRatesForYama(processedItems);
    } else if (activeBossKey === 'tempoross') {
        processedItems = adjustRatesForTempoross(processedItems);
    } else if (activeBossKey === 'wintertodt') {
        processedItems = adjustRatesForWintertodt(processedItems);
    } else if (activeBossKey === 'zalcano') {
        processedItems = adjustRatesForZalcano(processedItems);
    } else if (activeBossKey === 'royal_titans') {
        processedItems = adjustRatesForTitans(processedItems);
    } else if (activeBossKey === 'araxxor') {
        processedItems = adjustRatesForAraxxor(processedItems);
    }

    // GLOBAL SAFETY NET: Strip out any items that are mathematically impossible.
    // This prevents the Markov chain from looping to infinity trying to solve for 0%.
    const validItems = processedItems.filter(item => item.rate > 0);

    if (validItems.length === 0) {
        alert("The current settings make it mathematically impossible to obtain the selected items. Please adjust your target or settings.");
        return null;
    }

    let matrix;
    const rolls = bossData.rolls || 1;

    // Dispatch to the correct mathematical solver
    if (activeBossKey === 'moons_of_peril') {
        matrix = createMoonsMatrix(validItems);
    } else if (activeBossKey === 'barrows_chests') {
        matrix = createBarrowsMatrix(validItems.length);
    } else {
        matrix = createMasterMatrix(validItems, rolls);
    }

    return runSimulation(matrix, currentKC);
}

// ... [Keep displayResults, renderChart, createDataset, getChartOptions, getChartScales, getChartPlugins exact as they are] ...
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
    DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function renderChart(data, stats, userKC) {
    const ctx = DOM.chartCanvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    const transformX = (x) => Math.pow(x, X_AXIS_POWER);
    const reverseX = (y) => Math.pow(y, 1 / X_AXIS_POWER);
    const xMaxRaw = Math.max(data[data.length - 1].x, userKC * 1.1);
    
    const getClosestPoint = (targetX) => data.reduce((prev, curr) => 
        Math.abs(curr.x - targetX) < Math.abs(prev.x - targetX) ? curr : prev
    );
    
    const modeY = getClosestPoint(stats.modeKC).pmf;
    const medianY = getClosestPoint(stats.median).cdf;

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
                color: CHART_TEXT_COLOR, 
                font: { size: 10, weight: 700 }, 
                maxTicksLimit: 8, 
                callback: function(val) { 
                    let realKC = reverseX(val); 
                    if (realKC < 1) return null; 
                    if (realKC > 1000) realKC = Math.round(realKC / 100) * 100; 
                    else if (realKC > 100) realKC = Math.round(realKC / 10) * 10; 
                    else realKC = Math.round(realKC); 
                    return realKC.toLocaleString(); 
                } 
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

/**
 * Enhanced UI Force: Now handles visual "Lockdown" styling.
 */
function forceItemSelection(allowedNames) {
    DOM.itemGrid.querySelectorAll(".item-box").forEach(box => {
        const isAllowed = allowedNames.includes(box.title);
        box.classList.toggle("selected", isAllowed);
        
        // Visual feedback: Dim items that are currently locked out
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