/**
 * @file item-grid.js
 * The collection log grid: which items count towards the result, how many of each
 * multi-piece item are still needed, and the caption that names the item under the pointer.
 *
 * Multi-piece tiles step down N/N -> ... -> 1/N -> off -> N/N.
 */

import { getItemImagePath, getItemWikiImageUrl, formatItemName } from './data.js';

let grid;
let caption;
let onChange;
let itemsByName = new Map();
let isLocked = false;
let gridVersion = 0; // bumped whenever the grid is rebuilt or (un)locked, so stale undo snapshots are refused

const tiles = () => grid.querySelectorAll('.item-box');

function tileHtml(item) {
    const maxPieces = item.pieces || 1;
    const startPieces = item.defaultPieces ?? maxPieces;
    const badge = maxPieces > 1 ? `<span class="item-badge" aria-hidden="true">${startPieces}/${maxPieces}</span>` : '';

    return `
        <button type="button" class="item-box selected" aria-pressed="true" title="${formatItemName(item.name)}"
            data-name="${item.name}" data-max-pieces="${maxPieces}" data-default-pieces="${startPieces}" data-selected-pieces="${startPieces}">
            <img src="${getItemImagePath(item.name)}" data-fallback="${getItemWikiImageUrl(item.name)}" alt="">
            ${badge}
        </button>`;
}

function setPieces(box, pieces) {
    box.dataset.selectedPieces = pieces;
    const badge = box.querySelector('.item-badge');
    if (badge) badge.textContent = `${pieces}/${box.dataset.maxPieces}`;
}

function updateLabel(box) {
    const isSelected = box.classList.contains('selected');
    const max = Number(box.dataset.maxPieces);
    const count = max > 1 && isSelected ? `, need ${box.dataset.selectedPieces} of ${max}` : '';

    box.setAttribute('aria-pressed', String(isSelected));
    box.setAttribute('aria-label', `${formatItemName(box.dataset.name)}${count}`);
}

// The tile's highlight and badge already show whether it counts and how many pieces are needed,
// so the caption just names the item (plus why a locked tile can't be picked)
function describe(box) {
    const name = formatItemName(box.dataset.name);
    return box.disabled ? `${name}: not available with the current settings.` : name;
}

function showDefaultCaption() {
    const counted = grid.querySelectorAll('.item-box.selected').length;
    const hint = grid.querySelector('.item-badge')
        ? 'Hover or tap an item to see what it is; on numbered tiles, each tap lowers how many you still need.'
        : 'Hover or tap an item to see what it is.';
    caption.textContent = `${counted} of ${tiles().length} items counted. ${hint}`;
}

function toggle(box) {
    const maxPieces = Number(box.dataset.maxPieces);

    if (!box.classList.contains('selected')) {
        box.classList.add('selected');
        setPieces(box, maxPieces);
    } else if (Number(box.dataset.selectedPieces) > 1) {
        setPieces(box, Number(box.dataset.selectedPieces) - 1);
    } else {
        box.classList.remove('selected');
    }

    updateLabel(box);
    caption.textContent = describe(box);
    onChange();
}

// Swap a missing local icon for the wiki's copy, once
function handleIconError(e) {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.fallback) return;
    img.src = img.dataset.fallback;
    delete img.dataset.fallback;
}

function describeTileUnderEvent(e) {
    const box = e.target.closest('.item-box');
    if (box) caption.textContent = describe(box);
}

export function initItemGrid({ gridElement, captionElement, onSelectionChange }) {
    grid = gridElement;
    caption = captionElement;
    onChange = onSelectionChange;

    grid.addEventListener('click', (e) => {
        const box = e.target.closest('.item-box');
        if (box && !box.disabled) toggle(box);
    });
    grid.addEventListener('error', handleIconError, true);
    grid.addEventListener('pointerover', describeTileUnderEvent);
    grid.addEventListener('focusin', describeTileUnderEvent);
    grid.addEventListener('pointerleave', showDefaultCaption);
    grid.addEventListener('focusout', (e) => {
        if (!grid.contains(e.relatedTarget)) showDefaultCaption();
    });
}

export function renderItemGrid(items) {
    const visible = items.filter(item => !item.hidden).sort((a, b) => a.order - b.order);

    itemsByName = new Map(visible.map(item => [item.name, item]));
    isLocked = false;
    gridVersion++;
    grid.innerHTML = visible.map(tileHtml).join('');
    tiles().forEach(updateLabel);
    showDefaultCaption();
}

/** The selected items' data, with `pieces` set to how many the player still needs. */
export function getSelectedItems() {
    return Array.from(grid.querySelectorAll('.item-box.selected'), box => ({
        ...itemsByName.get(box.dataset.name),
        pieces: Number(box.dataset.selectedPieces)
    }));
}

export function setAllItems(select) {
    grid.querySelectorAll('.item-box:not(:disabled)').forEach(box => {
        box.classList.toggle('selected', select);
        if (select) setPieces(box, Number(box.dataset.defaultPieces));
        updateLabel(box);
    });

    showDefaultCaption();
    onChange();
}

/** Which enabled tiles are selected and how many pieces each needs, so a change can be undone. */
export function getSelection() {
    const enabled = Array.from(tiles()).filter(box => !box.disabled);
    return {
        version: gridVersion,
        tiles: enabled.map(box => ({
            name: box.dataset.name,
            isSelected: box.classList.contains('selected'),
            pieces: box.dataset.selectedPieces
        }))
    };
}

/** Puts back a getSelection() snapshot; returns false (changing nothing) if the grid was rebuilt or relocked since. */
export function restoreSelection(snapshot) {
    if (snapshot.version !== gridVersion) return false;

    snapshot.tiles.forEach(({ name, isSelected, pieces }) => {
        const box = grid.querySelector(`.item-box[data-name="${CSS.escape(name)}"]`);
        box.classList.toggle('selected', isSelected);
        setPieces(box, pieces);
        updateLabel(box);
    });

    showDefaultCaption();
    onChange();
    return true;
}

/** Restricts the grid to `allowedNames` (e.g. a sacrifice option), or restores it when given null. */
export function lockItems(allowedNames) {
    const shouldLock = allowedNames !== null;
    if (shouldLock === isLocked) return;
    isLocked = shouldLock;
    gridVersion++;

    tiles().forEach(box => {
        if (shouldLock) {
            box.dataset.wasSelected = box.classList.contains('selected');
            const isAllowed = allowedNames.includes(box.dataset.name);
            box.classList.toggle('selected', isAllowed);
            box.disabled = !isAllowed;
        } else {
            box.classList.toggle('selected', box.dataset.wasSelected === 'true');
            delete box.dataset.wasSelected;
            box.disabled = false;
        }
        updateLabel(box);
    });

    showDefaultCaption();
}
