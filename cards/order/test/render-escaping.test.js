// Lit-template escaping test (#143). Lit escapes every interpolated value
// before it reaches the DOM, so the manual _esc() calls that used to guard the
// innerHTML-built render no longer apply. This renders the order form into a
// real DOM (happy-dom) with attacker-shaped data — a menu item name and a bean
// note — and proves both land as text, never as live elements. Since #274 the
// note lives in the bean details sheet, so the test opens that sheet first.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const NAME_PAYLOAD = '<img src=x onerror=alert(1)>';
const NOTE_PAYLOAD = '<script>alert(1)</script>';

// One happy-dom Window for the whole file: node --test loads the card (and
// therefore Lit) once per process, and Lit binds to whatever global document
// exists when it is first imported. The window must be installed before
// loadCard() requires the card.
const window = new Window();
// The bean details sheet (#274) pushes and trims a history entry per open;
// counters keep that away from happy-dom's real navigation state.
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
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

function makeCard() {
  // happy-dom forbids constructing its element classes with `new` directly, so
  // the card is built and upgraded through its custom-element registry.
  const card = window.document.createElement('glp-order-card');
  card._config = {};
  card._lang = 'en';
  card._enabled = true;
  card._menu = [
    { name: NAME_PAYLOAD, variants: ['Single'] },
    { name: 'Coffee', useBeans: true },
  ];
  card._activeBeans = [{ id: 1, name: 'Ethiopia', notes: NOTE_PAYLOAD }];
  card._selected = 'Coffee';
  card._selectedVariant = 'Ethiopia';
  card._selectedBeanId = 1;
  return card;
}

test('a menu item name and a bean note render as text, not as elements', (t) => {
  const card = makeCard();
  t.after(() => { if (card._sheet) card._sheet.close(); });
  card._render();

  const root = card.shadowRoot;
  assert.equal(root.querySelector('img'), null, 'the menu item name must not become an <img> element');
  assert.ok(root.textContent.includes(NAME_PAYLOAD), 'the menu item name is preserved as text');
  assert.ok(root.getElementById('oc-submit').querySelector('svg'),
    'the coffee icon is on the order button once a drink is selected');

  // The note is bean data, now shown in the details sheet (#274).
  root.querySelector('.bean-info-btn').click();
  assert.equal(root.querySelector('script'), null, 'the bean note must not become a <script> element');
  assert.ok(root.querySelector('.glp-sheet-body').textContent.includes(NOTE_PAYLOAD),
    'the bean note is preserved as text');
});

test('the order-form submit button is disabled until an item and variant are selected', () => {
  const card = makeCard();
  card._selected = null;
  card._selectedVariant = null;
  card._render();

  const btn = card.shadowRoot.getElementById('oc-submit');
  assert.equal(btn.disabled, true);
  assert.equal(btn.querySelector('svg'), null,
    'the coffee icon stays off the order button while no drink is selected');
});
