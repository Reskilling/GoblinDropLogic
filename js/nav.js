/**
 * @file nav.js
 * Hash-based navigation: #droplogic, #guides, ... open that section; no hash shows the landing view.
 * Links are plain <a href="#section">, so refresh, Back/Forward and shared links all work.
 */

const TRANSITION_MS = 300;

let views;
let panels;
let navLinks;

function routeFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    return [...panels].some(panel => panel.id === id) ? id : null;
}

function showTab(tabId) {
    navLinks.forEach(link => {
        const isCurrent = link.getAttribute('href') === `#${tabId}`;
        link.classList.toggle('active', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    panels.forEach(panel => {
        const isActive = panel.id === tabId;
        panel.classList.toggle('active-panel', isActive);
        panel.classList.toggle('hidden-view', !isActive);
    });
}

function setVisible(view, isVisible) {
    view.classList.toggle('active-view', isVisible);
    view.classList.toggle('hidden-view', !isVisible);
}

function showView(target, animate) {
    const other = target === views.hero ? views.main : views.hero;
    if (target.classList.contains('active-view')) return;

    if (!animate) {
        setVisible(other, false);
        setVisible(target, true);
        return;
    }

    other.classList.add('fade-out');
    setTimeout(() => {
        other.classList.remove('fade-out');
        setVisible(other, false);
        setVisible(target, true);
    }, TRANSITION_MS);
}

function render({ animate }) {
    const tabId = routeFromHash();
    if (tabId) showTab(tabId);
    showView(tabId ? views.main : views.hero, animate);
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
