// Machine scoping for the switch entity and for the machine-name match (#269).
// Two card instances on one dashboard used to share the unscoped
// `glp_switch_entity` localStorage key, so a card configured for one machine
// could power another machine on or off; and the machine-name match used a
// plain `includes`, so "Kitchen" could resolve to "Kitchen 2". Both are
// exercised here against the real source via test/helpers/load-card.cjs, with
// happy-dom where a rendered power button has to be checked.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

// One happy-dom Window for the whole file: node --test loads the card (and
// therefore Lit) once per process, and Lit binds to whatever global document
// exists when it is first imported.
const window = new Window();
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

// A kitchen machine that reports no `switch_entity` attribute of its own, so
// the only way the card can find a switch is localStorage.
function kitchenStates(extra = {}) {
  return {
    language: 'en',
    states: {
      'switch.kitchen': { state: 'on' },
      'sensor.kitchen_machine_status': { state: 'online', attributes: { recent_shots: [] } },
      'sensor.kitchen_preheat_elapsed': { state: '600' },
      ...extra,
    },
  };
}

// Builds and renders a card through its custom-element registry (happy-dom
// forbids `new HTMLElement()`), driving setConfig() so the switch entity comes
// from the same code path the dashboard uses.
function renderCard(config, hass) {
  const card = window.document.createElement('glp-card');
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  card.setConfig(config);
  card._hass = hass;
  card._render();
  return card;
}

function powerButton(card) {
  return card.shadowRoot.querySelector('[data-action="toggle-switch"]');
}

test('a card set to `machine` ignores the global key, so another machine\'s switch is never used', () => {
  window.localStorage.clear();
  window.localStorage.setItem('glp_switch_entity', 'switch.somewhere_else');

  const card = renderCard({ machine: 'Kitchen' }, kitchenStates());

  assert.equal(card._switchEntity, null, 'the unscoped global key must not be adopted');
  assert.equal(powerButton(card), null, 'with no switch entity there is nothing to toggle');
});

test('a card set to `machine` uses its own machine-scoped key', () => {
  window.localStorage.clear();
  window.localStorage.setItem('glp_switch_entity', 'switch.somewhere_else');
  window.localStorage.setItem('glp_switch_entity_kitchen', 'switch.kitchen');

  const card = renderCard({ machine: 'Kitchen' }, kitchenStates());

  assert.equal(card._switchEntity, 'switch.kitchen');
  assert.ok(powerButton(card), 'the power button is rendered for the card\'s own switch');
});

test('a card without `machine` still reads the global key, unchanged', () => {
  window.localStorage.clear();
  window.localStorage.setItem('glp_switch_entity', 'switch.global');

  const card = renderCard({ entity_prefix: P }, {
    language: 'en',
    states: {
      'switch.global': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
    },
  });

  assert.equal(card._switchEntity, 'switch.global');
  assert.ok(powerButton(card));
});

function makeInstance({ config, states }) {
  const inst = Object.create(GlpCard.prototype);
  inst._config = config;
  inst._hass = { states };
  inst._switchEntity = null;
  return inst;
}

// The machine-name match is what _resolvePrefix() exposes to the rest of the
// card, so these assert on the resolved prefix rather than on the helper.
const TWO_MACHINES = {
  'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Kitchen Machine Status' } },
  'sensor.kitchen_2_machine_status': { attributes: { friendly_name: 'Kitchen 2 Machine Status' } },
};
const ORDERINGS = [
  ['insertion order', TWO_MACHINES],
  ['reverse order', Object.fromEntries(Object.entries(TWO_MACHINES).reverse())],
];

for (const [label, states] of ORDERINGS) {
  test(`machine "Kitchen" resolves the Kitchen entity in ${label}, not "Kitchen 2"`, () => {
    const inst = makeInstance({ config: { machine: 'Kitchen' }, states });
    assert.equal(inst._resolvePrefix(), 'sensor.kitchen_');
  });

  test(`machine "Kitchen 2" resolves the Kitchen 2 entity in ${label}`, () => {
    const inst = makeInstance({ config: { machine: 'Kitchen 2' }, states });
    assert.equal(inst._resolvePrefix(), 'sensor.kitchen_2_');
  });
}

test('a needle that only matches partially still resolves, so existing setups keep working', () => {
  const inst = makeInstance({
    config: { machine: 'GaggiMat' },
    states: {
      'sensor.kitchen_gaggimate_machine_status': { attributes: { friendly_name: 'Kitchen GaggiMate Machine Status' } },
    },
  });
  assert.equal(inst._resolvePrefix(), 'sensor.kitchen_gaggimate_');
});
