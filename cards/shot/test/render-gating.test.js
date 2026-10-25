// Render gating (#270). Home Assistant pushes a new `hass` object on every
// state change of ANY entity, so the card used to repaint the whole shadow DOM
// many times a second for changes it never shows. The `hass` setter now renders
// only when something the card shows actually changed: HA replaces a state
// object only when that entity changes, so object identity is the signal.
// These tests drive the real `hass` setter in a happy-dom window (same setup as
// test/render-guard.test.js) and count real renders/prefix scans/contrast runs.
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
const S = 'select.gaggiuino_local_profiler_';

// Machine on and idle: the shot tab with the profile picker available.
function cardStates(extra = {}) {
  return {
    'switch.gaggiuino': { state: 'on' },
    [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
    [`${P}preheat_elapsed`]: { state: '600' },
    [`${S}profile`]: { state: 'Espresso', attributes: { options: ['Espresso', 'Flat White'] } },
    ...extra,
  };
}

// Builds the hass object around an existing state map, the way HA does: the
// states map is a new object on every push, but each entity's state object
// keeps its identity until THAT entity changes.
function hass(states, extra = {}) {
  return { language: 'en', states: { ...states, ...extra } };
}

function makeCard(states, config = {}) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino', ...config };
  card._hass = hass(states);
  // These fakes carry no fetchWithAuth, so the orders poll would retry forever
  // (and keep node --test alive); the poll is not what these tests exercise.
  card._startOrdersPoll = () => {};
  return card;
}

// Counts calls to the card's own _render(), leaving the real one in place.
function spyOnRender(card) {
  const real = card._render.bind(card);
  const spy = { count: 0 };
  card._render = () => { spy.count += 1; real(); };
  return spy;
}

function stopTickers(card) {
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll', '_ordersRetry']) {
    if (card[key]) { clearInterval(card[key]); clearTimeout(card[key]); card[key] = null; }
  }
}

test('a hass push that only changes an unrelated entity does not render', () => {
  const states = cardStates();
  const card = makeCard(states);
  card._render();                       // prime the render-input snapshot
  const rendered = spyOnRender(card);

  card.hass = hass(states, { 'sensor.kitchen_temperature': { state: '21.4' } });
  card.hass = hass(states, { 'climate.living_room': { state: 'heat' } });

  assert.equal(rendered.count, 0, 'unrelated entities must not repaint the card');
  stopTickers(card);
});

test('a push that changes one of the card\'s own entities renders exactly once', () => {
  const states = cardStates();
  const card = makeCard(states);
  card._render();
  const rendered = spyOnRender(card);

  // Same entity set; HA hands over a new state object for the one that changed.
  card.hass = hass({ ...states, [`${P}preheat_elapsed`]: { state: '601' } });

  assert.equal(rendered.count, 1, 'a change to a watched entity repaints once');
  stopTickers(card);
});

test('the first hass after setConfig always renders', () => {
  const card = window.document.createElement('glp-card');
  card.setConfig({ entity_prefix: P, switch_entity: 'switch.gaggiuino' });
  card._startOrdersPoll = () => {};
  card._hass = hass(cardStates());
  card._render();
  const rendered = spyOnRender(card);

  // Same state objects, so nothing the card shows changed — but a new config
  // invalidated the snapshot, so the next push must still repaint.
  card.setConfig({ entity_prefix: P, switch_entity: 'switch.gaggiuino' });
  card.hass = card._hass;

  assert.equal(rendered.count, 1, 'setConfig() forces the next hass push to render');
  stopTickers(card);
});

test('an entity appearing under the prefix renders again', () => {
  const states = cardStates();
  const card = makeCard(states);
  card._render();
  const rendered = spyOnRender(card);

  card.hass = hass(states, { [`${P}maintenance_backflush`]: { state: 'ok', attributes: { pct: 0.4 } } });

  assert.equal(rendered.count, 1, 'a newly added entity of the card repaints it');
  stopTickers(card);
});

test('_resolvePrefix() scans the state map once per hass.states object', () => {
  // No entity_prefix, so the prefix really has to be discovered by scanning.
  const card = makeCard(cardStates(), { entity_prefix: null, switch_entity: null });

  const realKeys = Object.keys;
  let scans = 0;
  Object.keys = (obj) => { scans += 1; return realKeys(obj); };
  try {
    for (let i = 0; i < 25; i++) assert.equal(card._resolvePrefix(), P);
  } finally {
    Object.keys = realKeys;
  }
  assert.equal(scans, 1, '25 lookups on one hass.states object scan it once');

  // A new states map (what HA builds on every push) invalidates the cache.
  card._hass = hass(cardStates());
  Object.keys = (obj) => { scans += 1; return realKeys(obj); };
  try {
    card._resolvePrefix();
  } finally {
    Object.keys = realKeys;
  }
  assert.equal(scans, 2, 'a new hass.states object is scanned again');
});

test('the contrast pass runs once across renders with the same theme and again after the theme changes', () => {
  const states = cardStates();
  const card = makeCard(states);

  // The pass is the only thing that reads the card host's resolved colours;
  // Lit's own rendering never does, so counting those reads counts the passes.
  const realGcs = globalThis.getComputedStyle;
  let reads = 0;
  globalThis.getComputedStyle = (el, ...rest) => {
    if (el === card) reads += 1;
    return realGcs(el, ...rest);
  };
  try {
    card._render();
    const afterFirst = reads;
    assert.ok(afterFirst > 0, 'the first render runs the contrast pass');

    card._render();
    card._render();
    assert.equal(reads, afterFirst, 'later renders with the same theme skip the pass');

    // A theme switch is exactly what the pass reads, so it must run again.
    card._hass = { ...card._hass, themes: { selectedTheme: 'glp-dark', darkMode: true } };
    card._render();
    assert.ok(reads > afterFirst, 'a theme change re-runs the contrast pass');
  } finally {
    globalThis.getComputedStyle = realGcs;
  }
  stopTickers(card);
});

test('100 unrelated hass pushes cause zero renders', () => {
  const states = cardStates();
  const card = makeCard(states);
  card._render();
  const rendered = spyOnRender(card);

  for (let i = 0; i < 100; i++) {
    card.hass = hass(states, { [`sensor.unrelated_${i}`]: { state: String(i) } });
  }

  // Before this change every one of those pushes ended in _render() (100).
  assert.equal(rendered.count, 0, 'unrelated pushes per 100 → 0 renders');
  stopTickers(card);
});
