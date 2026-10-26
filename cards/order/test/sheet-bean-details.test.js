// Bean details behind the info button in the shared bottom sheet (#274).
// Loads the real GlpOrderCard from src/ and renders it in a happy-dom window,
// so the tests exercise the shipped chip markup and the real GlpSheet
// controller rather than a re-implementation:
//
//  - a bean chip with details gets a small info button, a bean without details
//    (and every non-bean variant) does not;
//  - the info button opens the sheet with that bean's details and leaves the
//    selected variant alone, while the chip itself still only selects;
//  - the always-visible details block under the chips is gone;
//  - bean text lands in the sheet as text, never as markup.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const NOTE_PAYLOAD = '<script>alert(1)</script>';

const window = new Window();
// The sheet only drags and slides on phone widths; a desktop-width window
// keeps every open/close synchronous between the click and its assertions.
const desktopMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, dispatchEvent() { return false; },
});
try {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: desktopMedia });
} catch {
  window.matchMedia = desktopMedia;
}
// The sheet pushes and trims a history entry per open. Counters instead of the
// real object keep the open/close pairs independent of navigation behaviour.
function spyHistory() {
  const calls = { push: 0, back: 0 };
  const fake = {
    pushState: () => { calls.push += 1; },
    back: () => { calls.back += 1; },
  };
  try {
    Object.defineProperty(window, 'history', { configurable: true, writable: true, value: fake });
  } catch {
    // A non-configurable history still works for the sheet: it guards
    // pushState itself, and back() only has to not throw.
    try {
      window.history.pushState = fake.pushState;
      window.history.back = fake.back;
    } catch { /* leave the real history in place */ }
  }
  return calls;
}
window.customElements.define('home-assistant', class extends window.HTMLElement {});

loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    // _selectVariant() fires the HA haptic event on the card, so the
    // CustomEvent has to come from this window.
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

// The card is not attached to the document here (attaching would start its
// poll), so showModal() is stubbed to the one effect the sheet relies on:
// the dialog becomes open. close() stays real when happy-dom provides it, so
// the sheet's own close path runs unchanged (same approach as
// cards/shot/test/sheet.test.js).
const dialogProto = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
if (dialogProto) {
  dialogProto.showModal = function showModal() { this.setAttribute('open', ''); };
  if (typeof dialogProto.close !== 'function') {
    dialogProto.close = function close() { this.removeAttribute('open'); };
  }
}
spyHistory();

const BEAN_WITH_DETAILS = {
  id: 1,
  name: 'Ethiopia',
  notes: 'Jasmine and bergamot',
  origins: [{ code: 'ET', percent: 60 }, { code: 'KE' }],
  variety: 'Heirloom',
  process: 'Washed',
};

const BEAN_WITHOUT_DETAILS = { id: 2, name: 'House Blend', origins: [] };

function makeCard({ beans = [BEAN_WITH_DETAILS], menu, selectedVariant = null } = {}) {
  const card = window.document.createElement('glp-order-card');
  card._config = {};
  card._lang = 'en';
  card._enabled = true;
  card._menu = menu || [{ name: 'Coffee', useBeans: true }];
  card._activeBeans = beans;
  card._selected = card._menu[0].name;
  card._selectedVariant = selectedVariant;
  card._selectedBeanId = null;
  return card;
}

// Leaves no open sheet (and no popstate listener) behind for the next test.
function makeCardFor(t, options) {
  const card = makeCard(options);
  t.after(() => { if (card._sheet) card._sheet.close(); });
  return card;
}

function chipFor(card, label) {
  return Array.from(card.shadowRoot.querySelectorAll('.variant-chip'))
    .find(chip => chip.getAttribute('data-variant') === label);
}

// Scoped to the chip's own wrapper: a bare chip's parent is the shared grid,
// where a neighbouring bean's button would otherwise be found.
function infoButtonFor(card, label) {
  const wrap = chipFor(card, label)?.closest('.variant-chip-wrap') ?? null;
  return wrap?.querySelector('.bean-info-btn') ?? null;
}

test('a bean chip with details renders an info button next to the chip', (t) => {
  const card = makeCardFor(t, {
    beans: [BEAN_WITH_DETAILS, BEAN_WITHOUT_DETAILS],
  });
  card._render();

  const chip = chipFor(card, 'Ethiopia');
  assert.ok(chip, 'the bean chip is rendered');
  const button = infoButtonFor(card, 'Ethiopia');
  assert.ok(button, 'a bean with details gets an info button');
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('type'), 'button');
  assert.ok(button.querySelector('svg'), 'the info button carries the drawn info icon');
  assert.match(button.getAttribute('aria-label'), /Ethiopia/,
    'the button names the bean it describes');
  assert.equal(chip.textContent, 'Ethiopia', 'the chip itself stays a plain select button');
  assert.equal(infoButtonFor(card, 'House Blend'), null,
    'the button belongs to its own chip, not to the neighbouring bean');
});

test('a bean chip without details and a non-bean variant get no info button', (t) => {
  const beanCard = makeCardFor(t, {
    beans: [BEAN_WITHOUT_DETAILS],
    menu: [{ name: 'Coffee', useBeans: true }],
  });
  beanCard._render();
  assert.ok(chipFor(beanCard, 'House Blend'), 'the chip is still rendered');
  assert.equal(infoButtonFor(beanCard, 'House Blend'), null,
    'a bean with nothing to show gets no info button');

  // Same bean name, but this menu item is a plain drink with its own variants.
  const plainCard = makeCardFor(t, {
    beans: [BEAN_WITH_DETAILS],
    menu: [{ name: 'Espresso', variants: ['Ethiopia'] }],
  });
  plainCard._render();
  assert.ok(chipFor(plainCard, 'Ethiopia'), 'the plain variant chip is rendered');
  assert.equal(infoButtonFor(plainCard, 'Ethiopia'), null,
    'a non-bean variant never gets bean details');
});

test('the info button opens the sheet with that bean and keeps the selection', (t) => {
  const card = makeCardFor(t);
  card._render();

  infoButtonFor(card, 'Ethiopia').click();

  const dialog = card.shadowRoot.querySelector('dialog.glp-sheet');
  assert.ok(dialog, 'the sheet lives in the card’s shadow root');
  assert.equal(dialog.hasAttribute('open'), true, 'the sheet is opened as a modal dialog');
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-title').textContent, 'Ethiopia');
  const body = card.shadowRoot.querySelector('.glp-sheet-body');
  assert.match(body.textContent, /Jasmine and bergamot/, 'notes are in the sheet');
  assert.match(body.textContent, /Heirloom/, 'variety is in the sheet');
  assert.match(body.textContent, /Washed/, 'process is in the sheet');
  assert.ok(body.querySelector('.bean-info'), 'the sheet body is the bean details block');
  // Origin stays the localized country name with its weighting (+ blends).
  assert.match(body.querySelector('.bean-info-row').textContent, /Ethiopia 60% \+ Kenya/,
    'the origin row renders both origins');
  assert.equal(card._selectedVariant, null, 'opening the details does not select the bean');
});

test('tapping the chip selects the bean and does not open the sheet', (t) => {
  const card = makeCardFor(t);
  card._render();

  chipFor(card, 'Ethiopia').click();

  assert.equal(card._selectedVariant, 'Ethiopia');
  assert.equal(card._selectedBeanId, 1, 'the chip still submits the bean id');
  assert.equal(card.shadowRoot.querySelector('dialog.glp-sheet'), null,
    'the chip never opens the sheet');
  assert.ok(chipFor(card, 'Ethiopia').classList.contains('selected'),
    'the chip itself shows the selection');
});

test('no details block is rendered under the chips anymore', (t) => {
  const card = makeCardFor(t, { selectedVariant: 'Ethiopia' });
  card._render();

  const form = card.shadowRoot.querySelector('.order-form');
  assert.ok(form, 'the order form is rendered');
  assert.equal(form.querySelector('#oc-bean-info'), null,
    'the bean details are only in the sheet');
  assert.equal(form.querySelector('.bean-info'), null);
  // ...while the info button that replaces it is there.
  assert.ok(infoButtonFor(card, 'Ethiopia'));
});

test('removing the card closes an open sheet', (t) => {
  const card = makeCardFor(t);
  card._render();
  infoButtonFor(card, 'Ethiopia').click();
  assert.equal(card._sheet.isOpen, true);

  card.disconnectedCallback();

  assert.equal(card._sheet.isOpen, false, 'the sheet does not outlive the card');
});

test('the sheet follows a card language change', (t) => {
  const card = makeCardFor(t);
  card._render();
  infoButtonFor(card, 'Ethiopia').click();
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-close').getAttribute('aria-label'), 'Close');

  // hass.language lands in _lang; the rebuilt sheet speaks the new language.
  card._lang = 'de';
  card._render();
  infoButtonFor(card, 'Ethiopia').click();
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-close').getAttribute('aria-label'), 'Schließen');
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-title').textContent, 'Ethiopia',
    'the bean name is data, not translated');
});

test('bean text in the sheet is escaped, never markup', (t) => {
  const card = makeCardFor(t, {
    beans: [{ id: 3, name: 'Mystery', notes: NOTE_PAYLOAD, origins: [] }],
  });
  card._render();

  infoButtonFor(card, 'Mystery').click();

  const body = card.shadowRoot.querySelector('.glp-sheet-body');
  assert.equal(body.querySelector('script'), null, 'the notes must not become a <script> element');
  assert.ok(body.textContent.includes(NOTE_PAYLOAD), 'the notes are preserved as text');
});
