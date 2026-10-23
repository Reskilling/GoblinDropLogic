/**
 * @file nav.js
 * Hash-based navigation: #droplogic, #guides, ... open that section; no hash shows the landing view.
 * Links are plain <a href="#section">, so refresh, Back/Forward and shared links all work.
 */

const TRANSITION_MS = 300;
const SITE_TITLE = 'Wise Goblin';
const HOME_TITLE = `${SITE_TITLE} | Clan Hub & DropLogic`;

let views;
let panels;
let navLinks;

function routeFromHash() {
    let id;
    try {
        id = decodeURIComponent(location.hash.slice(1));
    } catch {
        return null; // malformed escape such as "#%"
    }
    return [...panels].some(panel => panel.id === id) ? id : null;
}

const sectionHeading = (tabId) => document.querySelector(`#${tabId} h1`);

function updateTitle(tabId) {
    document.title = tabId ? `${sectionHeading(tabId).textContent} | ${SITE_TITLE}` : HOME_TITLE;
}

// Move keyboard and screen-reader focus to where the user just navigated to
function focusDestination(tabId) {
    const target = tabId ? sectionHeading(tabId) : document.querySelector('.premium-nav a');
    target?.focus({ preventScroll: true });
}

function showTab(tabId) {
    navLinks.forEach(link => {
        const isCurrent = link.getAttribute('href') === `#${tabId}`;
        link.classList.toggle('active', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    panels.forEach(panel => { panel.hidden = panel.id !== tabId; });
}

function showView(target, animate, onShown) {
    const other = target === views.hero ? views.main : views.hero;
    const swap = () => {
        other.hidden = true;
        target.hidden = false;
        onShown();
    };

    if (!target.hidden || !animate) {
        swap();
        return;
    }

    other.classList.add('fade-out');
    setTimeout(() => {
        other.classList.remove('fade-out');
        swap();
    }, TRANSITION_MS);
}

function render({ animate }) {
    const tabId = routeFromHash();
    if (tabId) showTab(tabId);
    updateTitle(tabId);

    // On first load the browser keeps focus at the top of the page; only move it after a navigation
    showView(tabId ? views.main : views.hero, animate, () => {
        if (animate) focusDestination(tabId);
        document.dispatchEvent(new CustomEvent('sectionchange', { detail: { tabId } }));
    });
    window.scrollTo({ top: 0, behavior: animate ? 'smooth' : 'auto' });
}

function initMobileMenu() {
    const button = document.getElementById('mobile-sections-btn');
    const menu = document.getElementById('mobile-dropdown');
    if (!button || !menu) return;

    const setOpen = (isOpen) => {
        menu.classList.toggle('hidden', !isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
    };

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(menu.classList.contains('hidden'));
    });
    document.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
            setOpen(false);
            button.focus();
        }
    });
}

export function initNavigation() {
    views = {
        hero: document.getElementById('hero-view'),
        main: document.getElementById('main-view')
    };
    panels = document.querySelectorAll('.tab-panel');
    navLinks = document.querySelectorAll('.tab-link, .mobile-nav-item');

    render({ animate: false });
    window.addEventListener('hashchange', () => render({ animate: true }));
    initMobileMenu();
}
