/**
 * Browser smoke test: serves the site locally and drives it in an installed Chrome or Edge.
 * Run with `npm run test:e2e` (needs `npm install` once for playwright-core).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTENT_TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json'
};

function startServer() {
    const server = createServer(async (req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = join(ROOT, normalize(pathname === '/' ? 'index.html' : pathname));
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function launchBrowser() {
    for (const channel of [process.env.BROWSER_CHANNEL, 'chrome', 'msedge'].filter(Boolean)) {
        try {
            return await chromium.launch({ channel });
        } catch { /* try the next installed browser */ }
    }
    throw new Error('No Chrome or Edge found. Install one, or set BROWSER_CHANNEL.');
}

const server = await startServer();
const URL_ROOT = `http://localhost:${server.address().port}/`;
const browser = await launchBrowser();

let failures = 0;
const check = (label, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
};

const errors = [];
const watchErrors = (page) => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
};

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
watchErrors(page);
const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
const isHidden = (sel) => page.$eval(sel, el => el.classList.contains('hidden'));
const toastShown = () => page.evaluate(() => document.querySelector('.toast')?.classList.contains('show') ?? false);
// Resolves once the section named in the URL (or the landing view) has finished its transition
const settle = (p = page) => p.waitForFunction(() => {
    if (document.querySelector('.fade-out')) return false;
    let panel = null;
    try { panel = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { /* malformed hash */ }
    return panel?.classList.contains('tab-panel')
        ? !panel.hidden && !document.getElementById('main-view').hidden
        : !document.getElementById('hero-view').hidden;
});
// Resolves true once the element's text differs from `before`; results recalculate after a short typing delay
const textChanges = (sel, before) => page.waitForFunction(
    ([s, b]) => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim() !== b, [sel, before], { timeout: 3000 }
).then(() => true, () => false);

// --- Routing, titles, focus ---
await page.goto(URL_ROOT);
check('landing view on plain URL', await page.isVisible('#hero-view'));
check('landing logo is the resized image', (await page.$eval('.showcase-logo', img => img.currentSrc)).endsWith('wise-goblin-hero.webp'));
await page.goto(URL_ROOT + '#guides');
await settle();
check('deep link opens Guides & Tools', await page.isVisible('#guides') && !(await page.isVisible('#hero-view')));
check('page title names the section', (await page.title()) === 'Guides & Tools | Wise Goblin', await page.title());
check('deep-linked heading is not hidden under the header', await page.evaluate(() =>
    document.querySelector('#guides h1').getBoundingClientRect().top > document.querySelector('.content-header').getBoundingClientRect().bottom));
await page.click('.tab-link[href="#ironman-goals"]');
await settle();
check('tab click updates URL', page.url().endsWith('#ironman-goals'));
check('heading matches the link clicked', (await text('#ironman-goals h1')) === (await text('.tab-link[href="#ironman-goals"]')));
check('focus moves to the section heading', await page.evaluate(() => document.activeElement?.matches('#ironman-goals h1')));
await page.goBack();
await settle();
check('Back returns to Guides & Tools', await page.isVisible('#guides'));
await page.goto(URL_ROOT + '#%');
await settle();
check('malformed hash falls back to the landing view', await page.isVisible('#hero-view'));
await page.click('.premium-nav a[href="#droplogic"]');
await settle();
check('landing link opens DropLogic', await page.isVisible('#droplogic'));

// --- Calculator ---
check('Chart.js loaded', await page.evaluate(() => typeof Chart !== 'undefined'));
check('empty state before calculating', await page.isVisible('.empty-state'));
await page.click('.kc-btn[data-add="1"]');
check('+1 before choosing a boss shows no error', !(await toastShown()));
const optionNames = await page.$$eval('#boss-select option', os => os.map(o => o.textContent));
check('boss display names', ['Theatre of Blood', "Kree'arra", "Vet'ion"].every(n => optionNames.includes(n)));

await page.selectOption('#boss-select', 'theatre_of_blood');
check('selecting a boss waits for Calculate', await isHidden('#results'));
await page.hover('.item-box[data-name="Scythe of vitur (uncharged)"]');
check('hover caption names the item', (await text('#item-caption')).startsWith('Scythe of vitur'));
await page.click('#calculate-btn');
check('Calculate shows results', !(await isHidden('#results')) && !(await page.isVisible('.empty-state')));
check('Calculate button hides once results update live', await isHidden('#calculate-btn'));
check('results heading names the boss', (await text('#res-name')) === 'Theatre of Blood');
check('KC 0 headline shows typical KC', (await text('#stat-chance')).endsWith('KC'));
check('headline announced to screen readers', (await text('#results-announcer')).startsWith('Theatre of Blood: Typical KC to finish'));

const trio = await text('#phrase-median');
await page.fill('#setting-size', '5');
check('ToB team size changes personal odds', await textChanges('#phrase-median', trio));

await page.selectOption('#boss-select', 'chambers_of_xeric');
const headlineAtZero = await text('#stat-chance');
await page.fill('#target-kc', '300');
check('KC > 0 headline shows a percentage', await textChanges('#stat-chance', headlineAtZero) && (await text('#stat-chance')).endsWith('%'));
const coxBefore = await text('#phrase-mean');
await page.fill('#setting-points', '60000');
check('setting change recalculates', await textChanges('#phrase-mean', coxBefore));

await page.selectOption('#boss-select', 'araxxor');
await page.click('.item-box[data-name="Araxyte fang"]');
const selectedNames = () => page.$$eval('.item-box.selected', bs => bs.map(b => b.dataset.name).sort().join(','));
const beforeSacrifice = await selectedNames();
const sacrifice = '.setting-toggle[data-setting="isSacrificing"]';
await page.click(sacrifice);
check('sacrifice locks the grid to Nid', await selectedNames() === 'Nid');
check('toggle exposes aria-pressed', await page.$eval(sacrifice, b => b.getAttribute('aria-pressed')) === 'true');
await page.click(sacrifice);
check('turning sacrifice off restores the selection', await selectedNames() === beforeSacrifice);
await page.focus('.item-box[data-name="Araxyte head"]');
await page.keyboard.press('Space');
check('Space toggles a focused tile', await page.$eval('.item-box[data-name="Araxyte head"]', b => b.getAttribute('aria-pressed')) === 'false');

await page.selectOption('#boss-select', 'the_nightmare');
await page.click('.setting-toggle[data-setting="variant"]');
check("Phosani's Nightmare disables team size", await page.$eval('#setting-teamSize', i => i.disabled));
await page.selectOption('#boss-select', 'demonic_gorilla');
check('Zenyte shard starts at 1/4', await text('.item-box[data-name="Zenyte shard"] .item-badge') === '1/4');
await page.selectOption('#boss-select', 'moons_of_peril');
check('Moons of Peril calculates', (await text('#phrase-mean')).includes('KC'));

// --- Checklist ---
await page.evaluate(() => localStorage.clear());
await page.goto(URL_ROOT + '#ironman-goals');
await settle();
const easy = page.locator('#ironman-goals .card', { hasText: 'Easy Goals' });
await easy.locator('.goal-item input').first().focus();
await page.keyboard.press('Space');
check('Space ticks a focused goal', (await easy.locator('.tier-progress').textContent()).startsWith('1/'));
await easy.locator('.check-all-wrapper').click();
check('Check all ticks every goal', (await easy.locator('.goal-item input:checked').count()) === (await easy.locator('.goal-item input').count()));
await page.click('.toast-action');
check('Undo restores the previous state', (await easy.locator('.goal-item input:checked').count()) === 1);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('goal-Construction', 'true'); localStorage.setItem('goal-Graceful-Outfit', 'true'); });
await page.reload();
await settle();
const constructionTicked = await page.$$eval('#ironman-goals .goal-item', items =>
    items.filter(i => i.querySelector('.goal-name').textContent === 'Construction').map(i => i.querySelector('input').checked));
check('ambiguous old progress is not copied to repeated goals', constructionTicked.every(c => !c), constructionTicked.join(','));
check('unambiguous old progress still loads', await easy.locator('.goal-item', { hasText: 'Graceful Outfit' }).locator('input').isChecked());

// --- Phone ---
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
watchErrors(phone);
await phone.goto(URL_ROOT + '#plugins');
await settle(phone);
const expanded = () => phone.$eval('#mobile-sections-btn', b => b.getAttribute('aria-expanded'));
await phone.click('#mobile-sections-btn');
check('mobile menu opens', await expanded() === 'true');
await phone.keyboard.press('Escape');
check('Escape closes the mobile menu', await expanded() === 'false');
await phone.click('#mobile-sections-btn');
await phone.click('.mobile-nav-item[href="#droplogic"]');
await settle(phone);
await phone.selectOption('#boss-select', 'demonic_gorilla');
await phone.tap('.item-box[data-name="Zenyte shard"]');
check('tap caption describes the item', (await phone.textContent('#item-caption')).startsWith('Zenyte shard'));

const peekShown = () => phone.isVisible('#result-peek');
await phone.tap('#calculate-btn');
await phone.waitForFunction(() => !document.getElementById('results').classList.contains('hidden'));
await phone.evaluate(() => document.getElementById('target-kc').scrollIntoView({ block: 'center', behavior: 'instant' }));
await phone.tap('.kc-btn[data-add="100"]');
await phone.waitForFunction(() => !document.getElementById('result-peek').hidden, null, { timeout: 3000 }).catch(() => {});
check('phone shows a results bar while the results are off-screen', await peekShown());
check('results bar shows the updated chance', (await phone.textContent('#result-peek .peek-value')).endsWith('%'));
await phone.tap('#result-peek');
await phone.waitForFunction(() => document.getElementById('result-peek').hidden, null, { timeout: 3000 }).catch(() => {});
check('tapping the bar scrolls to the results and hides it', !(await peekShown()));

await phone.evaluate(() => document.getElementById('target-kc').scrollIntoView({ block: 'center', behavior: 'instant' }));
await phone.waitForFunction(() => !document.getElementById('result-peek').hidden, null, { timeout: 3000 }).catch(() => {});
await phone.click('#mobile-sections-btn');
await phone.click('.mobile-nav-item[href="#ironman-goals"]');
await settle(phone);
check('results bar stays on the calculator', !(await peekShown()));
await phone.click('#btn-home');
await settle(phone);
check('results bar is hidden on the landing page', !(await peekShown()));

check('results bar never shows on desktop', !(await page.isVisible('#result-peek')));
const shareImage = await page.$eval('meta[property="og:image"]', m => new URL(m.content).pathname);
check('link-preview image exists', (await page.request.get(URL_ROOT + shareImage.slice(1))).ok(), shareImage);

check('no console, page or network errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exitCode = failures ? 1 : 0;
