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
            <input type="number" id="${id}" data-setting="${setting.key}" value="${setting.default}" ${min} ${max} inputmode="numeric" aria-describedby="${id}-note">
            <p class="field-note" id="${id}-note" aria-live="polite"></p>
        </div>`;
}

// Every option is visible side by side, so the choice and the current state read at a glance
function toggleSettingHtml(setting) {
    const options = setting.options.map((option, index) => `
            <label class="segment" data-tone="${option.tone ?? ''}">
                <input type="radio" name="setting-${setting.key}" value="${index}" data-setting="${setting.key}" ${index === 0 ? 'checked' : ''}>
                <span>${option.label}</span>
            </label>`).join('');

    return `
        <fieldset class="setting-toggle">
            <legend>${setting.label}</legend>
            <div class="segments">${options}</div>
        </fieldset>`;
}

const findInput = (container, key) => container.querySelector(`[data-setting="${key}"]`);

export function renderSettings(container, settings) {
    container.innerHTML = settings
        .map(s => s.type === 'toggle' ? toggleSettingHtml(s) : numberSettingHtml(s))
        .join('');
    container.classList.toggle('hidden', settings.length === 0);
}

export function readSettings(container, settings) {
    return Object.fromEntries(settings.map(setting => {
        if (setting.type === 'toggle') {
            const checked = container.querySelector(`[data-setting="${setting.key}"]:checked`);
            return [setting.key, setting.options[Number(checked.value)].value];
        }

        return [setting.key, parseNumberSetting(findInput(container, setting.key).value, setting)];
    }));
}

// Number inputs accept forms like "1e9", so parse as a number rather than reading leading digits.
// Blank or invalid input falls back to the default; the result is a whole number within the setting's limits.
function parseNumberSetting(value, setting) {
    const parsed = value.trim() === '' ? NaN : Math.floor(Number(value));
    return clamp(Number.isFinite(parsed) ? parsed : setting.default, setting);
}

function clamp(value, { min = -Infinity, max = Infinity }) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Rewrites the input as a valid whole number once the user has finished typing. When an out-of-range
 * value was capped, the note under the field says so; a cleared or valid entry clears the note.
 */
export function clampNumberInput(input, setting) {
    const raw = input.value;
    const typed = raw.trim() === '' ? NaN : Math.floor(Number(raw));
    const value = parseNumberSetting(raw, setting);
    input.value = value;

    // Blank or unreadable input falls back to the default, which isn't a cap worth explaining
    const wasCapped = Number.isFinite(typed) && typed !== value;
    const name = setting.label.replace(/\s*\(.*\)$/, ''); // "Delve level (2–15)" -> "Delve level"
    input.parentElement.querySelector('.field-note').textContent = wasCapped
        ? `${name} can be ${describeRange(setting)}, so it's been set to ${value.toLocaleString()}.`
        : '';
}

function describeRange({ min, max }) {
    if (min !== undefined && max !== undefined) return `${min.toLocaleString()}–${max.toLocaleString()}`;
    return min !== undefined ? `at least ${min.toLocaleString()}` : `at most ${max.toLocaleString()}`;
}

export function syncDisabledSettings(container, settings, state) {
    settings.filter(s => s.disabledWhen).forEach(setting => {
        const input = findInput(container, setting.key);
        const isDisabled = setting.disabledWhen(state);

        input.disabled = isDisabled;
        if (isDisabled && setting.disabledValue !== undefined) input.value = setting.disabledValue;
    });
}
