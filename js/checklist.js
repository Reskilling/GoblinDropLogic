/**
 * @file checklist.js
 * Zugrot's Checklist: renders the tiers in goals.js, saves each goal's progress in this
 * browser, shows a progress count per tier, and offers Undo after "Check all".
 */

import { GOAL_TIERS } from './goals.js';
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

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function goalItem(goal) {
    const label = element('label', 'goal-item');
    const checkbox = element('input', 'visually-hidden');
    checkbox.type = 'checkbox';

    const details = element('div', 'goal-details');
    details.append(element('span', 'goal-name', goal.name));
    if (goal.detail) details.append(element('span', 'goal-subtext', goal.detail));

    label.append(checkbox, element('div', 'custom-checkbox'), details);
    return { label, checkbox };
}

function tierCard(tier) {
    const card = element('div', 'card');
    const header = element('div', 'header-row');
    const heading = element('h3', '', tier.name);
    const progress = element('span', 'tier-progress');

    const checkAllWrapper = element('label', 'check-all-wrapper');
    const checkAllBox = element('input', 'check-all-box visually-hidden');
    checkAllBox.type = 'checkbox';
    checkAllWrapper.append(checkAllBox, element('span', 'check-all-text', 'Check All'));

    header.append(heading, progress, checkAllWrapper);

    const list = element('div', 'goal-list');
    const goals = tier.goals.map(goal => {
        const { label, checkbox } = goalItem(goal);
        list.append(label);
        return { ...goal, checkbox };
    });

    card.append(header, list);
    return { card, progress, checkAllBox, checkAllWrapper, goals };
}

function setupTier(tier, repeatedNames) {
    const { card, progress, checkAllBox, checkAllWrapper, goals } = tierCard(tier);

    // Keys include the tier because goal names repeat across tiers (e.g. Construction).
    // Old keys had no tier, so they're only trusted for names that appear in a single tier.
    const storageKey = (name) => `goal-${tier.id}-${slugify(name)}`;
    const legacyStorageKeys = (name) => repeatedNames.has(name) ? [] : [`goal-${slugify(name)}`];
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
        goal.checkbox.checked = loadFlag(storageKey(goal.name), ...legacyStorageKeys(goal.name));
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

        showToast(`${isChecked ? 'Ticked' : 'Cleared'} every ${tier.name.toLowerCase()} goal.`, {
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
    return card;
}

function findRepeatedGoalNames() {
    const counts = new Map();
    GOAL_TIERS.flatMap(tier => tier.goals).forEach(({ name }) => counts.set(name, (counts.get(name) ?? 0) + 1));
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

export function initChecklist() {
    const grid = document.getElementById('goals-grid');
    const repeatedNames = findRepeatedGoalNames();
    grid.replaceChildren(...GOAL_TIERS.map(tier => setupTier(tier, repeatedNames)));
}
