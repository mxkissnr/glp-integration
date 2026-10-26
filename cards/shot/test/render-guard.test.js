// Render-guard contract after the move to Lit templates (#180). The card used
// to rebuild its whole shadow DOM from an innerHTML string on every `hass`
// update, so it deferred those renders while an open picker, a focused input,
// an in-flight touch or an animation could be destroyed by the rebuild. Lit's
// render() patches the existing DOM in place, so those deferral guards are gone
// and interactive state simply survives the update. These tests render the card
// into a real DOM (happy-dom, like test/render-escaping.test.js) and prove that
// an open sheet (the profile picker and the maintenance confirmation moved into
// the shared bottom sheet in #265) and a typed ready-by time each survive a
// `hass` update.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

// One happy-dom Window for the whole file: node --test loads the card (and
// therefore Lit) once per process, and Lit binds to whatever global document
// exists when it is first imported. The window must be installed before
// loadCard() requires the card.
const window = new Window();
// Publish `home-assistant` first so the card's deferred define (#184) fires
// synchronously and registers `glp-card` in this window's registry.
window.customElements.define('home-assistant', class extends window.HTMLElement {});
const { GlpCard } = loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    getComputedStyle: window.getComputedStyle.bind(window),
    localStorage: window.localStorage,
  },
});
assert.equal(typeof GlpCard, 'function', 'the card must register in the happy-dom window');

const P = 'sensor.gaggiuino_local_profiler_';
const S = 'select.gaggiuino_local_profiler_';

// Machine on and idle: the shot tab with the profile picker available.
function onStates(extra = {}) {
  return {
    language: 'en',
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
      [`${S}profile`]: { state: 'Espresso', attributes: { options: ['Espresso', 'Flat White'] } },
      ...extra,
    },
  };
}

// Machine off: the ready-by picker (its time input) is shown.
function offStates() {
  return {
    language: 'en',
    states: {
      'switch.gaggiuino': { state: 'off' },
      [`${P}machine_status`]: { state: 'offline', attributes: {} },
      [`${P}preheat_elapsed`]: { state: '0' },
    },
  };
}

function makeCard(hass) {
  // happy-dom forbids constructing its element classes with `new` directly, so
  // the card is built and upgraded through its custom-element registry.
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._hass = hass;
  // These fakes carry no fetchWithAuth, so the orders poll would retry forever
  // (and keep node --test alive); the poll is not what these tests exercise.
  card._startOrdersPoll = () => {};
  return card;
}

// Drives the real `set hass` path (not just `_render()`), so the update goes
// through exactly the entry point that used to defer to the render guards.
function pushHass(card, hass) {
  card.hass = hass;
}

function stopTickers(card) {
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll']) {
    if (card[key]) { clearInterval(card[key]); card[key] = null; }
  }
}

test('an open profile picker sheet survives a hass update', () => {
  const card = makeCard(onStates());
  card._render();
  card._openProfileSheet();
  assert.equal(card._sheet?.isOpen, true, 'the profile picker opens');

  pushHass(card, onStates({ [`${P}machine_temperature`]: { state: '93.0' } }));

  assert.equal(card._sheet?.isOpen, true, 'the picker is still open after a hass update');
  assert.equal(card.shadowRoot.querySelectorAll('.profile-sheet-opt').length, 2,
    'the options are still there');
  stopTickers(card);
});

test('an open maintenance confirmation sheet survives a hass update', () => {
  const card = makeCard(onStates({
    [`${P}maintenance_backflush`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
  }));
  card._activeTab = 'maint';
  card._render();
  card.shadowRoot.querySelector('.maint-row[data-maint-task="backflush"]')
    .dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true, composed: true }));
  assert.equal(card._sheet?.isOpen, true, 'the confirmation sheet is shown');

  pushHass(card, onStates({
    [`${P}maintenance_backflush`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
  }));

  assert.equal(card._sheet?.isOpen, true,
    'the confirmation sheet is still shown after a hass update');
  stopTickers(card);
});

test('a typed ready-by time survives a hass update', () => {
  const card = makeCard(offStates());
  card._render();
  const input = card.shadowRoot.getElementById('glp-readyby-input');
  assert.ok(input, 'the ready-by time input is shown while the machine is off');

  input.value = '07:30';   // as a user typing into <input type="time"> would

  pushHass(card, offStates());

  const after = card.shadowRoot.getElementById('glp-readyby-input');
  assert.equal(after, input, 'the update reuses the same input element');
  assert.equal(after.value, '07:30', 'the typed time is not reset by the update');
  stopTickers(card);
});
