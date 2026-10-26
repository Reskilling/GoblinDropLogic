/**
 * @file copy-code.js
 * Gives each code block (e.g. the radius-marker imports) a Copy button that confirms on the button itself.
 */

import { showToast } from './toast.js';

const CONFIRM_MS = 2000;

function addCopyButton(pre) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.before(wrapper);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    button.setAttribute('aria-live', 'polite');
    wrapper.append(pre, button);

    let resetTimer = null;
    button.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(pre.textContent);
        } catch {
            showToast("Couldn't copy automatically. Select the text and copy it instead.");
            return;
        }
        button.textContent = 'Copied';
        button.classList.add('is-copied');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('is-copied');
        }, CONFIRM_MS);
    });
}

export function initCopyButtons() {
    document.querySelectorAll('pre').forEach(addCopyButton);
}
