/**
 * @file settings.js
 * Renders a boss's settings (see bosses.js for their shape) and reads them back into state.
 * Inputs are found by their data-setting attribute, so no element IDs need to stay in sync.
 */

function numberSettingHtml(setting) {
    const id = `setting-${setting.key}`;
    const min = setting.min !== undefined ? `min="${setting.min}"` : '';
    const max = setting.max !== undefined ? `max="${setting.max}"` : '';

    return `
        <div class="input-group">
            <label for="${id}">${setting.label}</label>
            <input type="number" id="${id}" data-setting="${setting.key}" value="${setting.default}" ${min} ${max} inputmode="numeric">
        </div>`;
}

function toggleSettingHtml(setting) {
    const first = setting.options[0];
    return `
        <button type="button" class="setting-toggle" data-setting="${setting.key}" data-index="0"
            data-tone="${first.tone ?? ''}" ${isOnOffToggle(setting) ? 'aria-pressed="false"' : ''}>
            ${first.label}
        </button>`;
}

// A two-option toggle whose first option is the plain default reads as on/off to assistive tech
const isOnOffToggle = (setting) => setting.options.length === 2 && !setting.options[0].tone;

const findInput = (container, key) => container.querySelector(`[data-setting="${key}"]`);

export function renderSettings(container, settings) {
    container.innerHTML = settings
        .map(s => s.type === 'toggle' ? toggleSettingHtml(s) : numberSettingHtml(s))
        .join('');
    container.classList.toggle('hidden', settings.length === 0);
}

export function readSettings(container, settings) {
    return Object.fromEntries(settings.map(setting => {
        const input = findInput(container, setting.key);

        if (setting.type === 'toggle') {
            return [setting.key, setting.options[Number(input.dataset.index)].value];
        }

        const parsed = parseInt(input.value, 10);
        return [setting.key, clamp(Number.isNaN(parsed) ? setting.default : parsed, setting)];
    }));
}

/** Advances a toggle to its next option. */
export function cycleToggle(button, setting) {
    const index = (Number(button.dataset.index) + 1) % setting.options.length;
    const option = setting.options[index];

    button.dataset.index = index;
    button.dataset.tone = option.tone ?? '';
    button.textContent = option.label;
    if (isOnOffToggle(setting)) button.setAttribute('aria-pressed', String(index !== 0));
}

function clamp(value, { min = -Infinity, max = Infinity }) {
    return Math.min(Math.max(value, min), max);
}

/** Rewrites an out-of-range number input once the user has finished typing. */
export function clampNumberInput(input, setting) {
    const parsed = parseInt(input.value, 10);
    input.value = clamp(Number.isNaN(parsed) ? setting.default : parsed, setting);
}

export function syncDisabledSettings(container, settings, state) {
    settings.filter(s => s.disabledWhen).forEach(setting => {
        const input = findInput(container, setting.key);
        const isDisabled = setting.disabledWhen(state);

        input.disabled = isDisabled;
        if (isDisabled && setting.disabledValue !== undefined) input.value = setting.disabledValue;
    });
}
