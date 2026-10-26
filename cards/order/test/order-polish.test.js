// Order Card polish (#273): the popular row fills with a single drink, the
// order button names the drink only and stays on one line, and the bean choice
// needs one heading less. Renders the real GlpOrderCard into a happy-dom
// window, like render-escaping.test.js, so the assertions cover the markup the
// card actually ships.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const window = new Window();
// The bean details sheet pushes and trims a history entry per open; counters
// keep that away from happy-dom's real navigation state.
try {
  Object.defineProperty(window, 'history', {
    configurable: true,
    writable: true,
    value: { pushState() {}, back() {} },
  });
} catch {
  window.history.pushState = () => {};
  window.history.back = () => {};
}
// Publish `home-assistant` first so the card's deferred define (#145) fires
// synchronously and registers `glp-order-card` in this window's registry.
window.customElements.define('home-assistant', class extends window.HTMLElement {});
loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

function makeCard({ menu, activeBeans = [], selected = null, selectedVariant = null } = {}) {
  const card = window.document.createElement('glp-order-card');
  card._config = {};
  card._lang = 'en';
  card._enabled = true;
  card._menu = menu;
  card._activeBeans = activeBeans;
  card._selected = selected;
  card._selectedVariant = selectedVariant;
  card._render();
  return card;
}

const popular = (name) => ({ name, trending: true });
const plain = (name) => ({ name });

test('a single popular drink fills the row', () => {
  const card = makeCard({ menu: [popular('Flat White'), plain('Latte')] });
  const tiles = [...card.shadowRoot.querySelectorAll('.menu-item')];
  const popularTile = tiles.find(el => el.dataset.item === 'Flat White');
  assert.ok(popularTile.classList.contains('menu-item-full'),
    'the lone popular tile spans the full row');
});

test('two popular drinks keep the normal grid', () => {
  const card = makeCard({ menu: [popular('Flat White'), popular('Espresso'), plain('Latte')] });
  const fullRow = [...card.shadowRoot.querySelectorAll('.menu-item-full')];
  assert.deepEqual(fullRow, [], 'two popular drinks stay in the normal grid');
});

test('the order button names the drink only and keeps the variant in title and aria-label', () => {
  const card = makeCard({
    menu: [{ name: 'Filterkaffee' }],
    selected: 'Filterkaffee',
    selectedVariant: 'Yirgacheffe Chelelektu',
  });
  const btn = card.shadowRoot.getElementById('oc-submit');
  const label = btn.querySelector('.order-btn-label');
  assert.ok(label, 'the label text sits in its own span');
  assert.ok(label.textContent.includes('Filterkaffee'), 'the button names the drink');
  assert.ok(!label.textContent.includes('Yirgacheffe'), 'the button does not repeat the variant');
  assert.ok(btn.title.includes('Filterkaffee') && btn.title.includes('Yirgacheffe'),
    'the title keeps the drink and the variant');
  assert.ok(btn.getAttribute('aria-label').includes('Filterkaffee')
    && btn.getAttribute('aria-label').includes('Yirgacheffe'),
    'the accessible name keeps the drink and the variant');
  assert.ok(btn.querySelector('svg'), 'the coffee icon stays on the button');
});

test('both bean groups merge the Variant heading into each group heading', () => {
  const card = makeCard({
    menu: [{ name: 'Coffee', useBeans: true }],
    activeBeans: [
      { id: 1, name: 'Ethiopia', category: 'speciality' },
      { id: 2, name: 'House Blend', category: 'normal' },
    ],
    selected: 'Coffee',
  });
  const headings = [...card.shadowRoot.querySelectorAll('.menu-section-title')]
    .map(el => el.textContent.trim());
  assert.deepEqual(headings, ['Variant · Speciality', 'Variant · Normal']);
  assert.equal(card.shadowRoot.querySelector('.variant-label'), null,
    'the standalone Variant heading is not rendered');
});

test('flat variants show only the plain Variant heading', () => {
  const card = makeCard({
    menu: [{ name: 'Flat White', variants: ['Single', 'Doppio'] }],
    selected: 'Flat White',
  });
  const headings = [...card.shadowRoot.querySelectorAll('.menu-section-title')]
    .map(el => el.textContent.trim());
  assert.deepEqual(headings, [], 'a flat list adds no group headings');
  assert.equal(card.shadowRoot.querySelector('.variant-label').textContent.trim(), 'Variant');
});
