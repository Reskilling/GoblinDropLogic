/**
 * @file checklist.js
 * Zugrot's Checklist: per-goal progress saved in this browser, a progress count per tier,
 * and "Check all" with Undo.
 */

import { showToast } from './toast.js';

const slugify = (text) => text.trim().replace(/\s+/g, '-');

// Storage can be unavailable (private mode, blocked site data); the checklist still works for the visit
function loadFlag(...keys) {
    try {
        for (const key of keys) {
            const value = localStorage.getItem(key);
            if (value !== null) return value === 'true';
        }
    } catch { /* storage unavailable */ }
    return false;
}

function saveFlag(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch { /* storage unavailable */ }
}

function setupTier(card) {
    const heading = card.querySelector('h3');
    const checkAllBox = card.querySelector('.check-all-box');
    const checkAllWrapper = card.querySelector('.check-all-wrapper');
    const goals = [...card.querySelectorAll('.goal-item')].map(item => ({
        checkbox: item.querySelector('input[type="checkbox"]'),
        name: item.querySelector('.goal-name')?.textContent ?? ''
    }));

    if (!heading || !checkAllBox || goals.length === 0) return;

    const tier = heading.textContent;
    // Keys include the tier because goal names repeat across tiers (e.g. Construction)
    const storageKey = (name) => `goal-${slugify(tier)}-${slugify(name)}`;
    const legacyStorageKey = (name) => `goal-${slugify(name)}`;

    const progress = document.createElement('span');
    progress.className = 'tier-progress';
    heading.after(progress);

    const save = ({ checkbox, name }) => saveFlag(storageKey(name), checkbox.checked);

    const updateSummary = () => {
        const checkedCount = goals.filter(g => g.checkbox.checked).length;
        const allChecked = checkedCount === goals.length;
        const someChecked = checkedCount > 0 && !allChecked;

        progress.textContent = `${checkedCount}/${goals.length}`;
        checkAllBox.checked = allChecked;
        checkAllBox.indeterminate = someChecked;
        checkAllWrapper.classList.toggle('is-checked', allChecked);
        checkAllWrapper.classList.toggle('is-indeterminate', someChecked);
    };

    goals.forEach(goal => {
        goal.checkbox.checked = loadFlag(storageKey(goal.name), legacyStorageKey(goal.name));
        goal.checkbox.addEventListener('change', () => {
            save(goal);
            updateSummary();
        });
    });

    checkAllBox.addEventListener('change', () => {
        const previous = goals.map(g => g.checkbox.checked);
        const isChecked = checkAllBox.checked;

        goals.forEach(goal => {
            goal.checkbox.checked = isChecked;
            save(goal);
        });
        updateSummary();

        showToast(`${isChecked ? 'Ticked' : 'Cleared'} every ${tier.toLowerCase()} goal.`, {
            tone: 'info',
            action: {
                label: 'Undo',
                onClick: () => {
                    goals.forEach((goal, i) => {
                        goal.checkbox.checked = previous[i];
                        save(goal);
                    });
                    updateSummary();
                }
            }
        });
    });

    updateSummary();
}

export function initChecklist() {
    document.querySelectorAll('#ironman-goals .card').forEach(setupTier);
}
