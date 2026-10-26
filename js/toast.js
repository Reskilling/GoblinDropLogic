/**
 * @file toast.js
 * A single, screen-reader-announced notification, optionally with an action button (e.g. Undo).
 */

const DEFAULT_DURATION_MS = 4000;
const ACTION_DURATION_MS = 6000;

let toast = null;
let hideTimer = null;

function getToast() {
    if (toast) return toast;

    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    return toast;
}

export function hideToast() {
    if (toast) toast.classList.remove('show');
}

/**
 * @param {string} message
 * @param {{ tone?: 'error' | 'info', action?: { label: string, onClick: () => void } }} [options]
 */
export function showToast(message, { tone = 'error', action = null } = {}) {
    const el = getToast();

    el.className = `toast is-${tone}`;
    el.replaceChildren();

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tone === 'error' ? '!' : 'i'; // drawn as a badge by CSS; emoji render differently per system

    const text = document.createElement('span');
    text.textContent = message;

    el.append(icon, text);

    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toast-action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            action.onClick();
            hideToast();
        });
        el.append(button);
        el.classList.add('has-action');
    }

    void el.offsetWidth; // restart the slide-in transition
    el.classList.add('show');

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToast, action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);
}
