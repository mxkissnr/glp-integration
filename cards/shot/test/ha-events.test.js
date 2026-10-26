// Home Assistant's documented custom-card events in the Shot Card (#266).
// Two halves: the shared helpers in cards/shared/ha-events.ts dispatch the
// right event with the right detail, and the card uses them where a user
// expects Home Assistant's own behaviour — a tap on a live value opens that
// entity's history, a long press on the header opens the machine, and every
// action confirms with a toast and a vibration.
'use strict';

process.env.TZ = 'UTC';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

// One happy-dom Window for the whole file: node --test loads the card (and
// Lit) once per process, and Lit binds to whatever global document exists
// when it is first imported. The window must be installed before loadCard().
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

const { moreInfo, toast, haptic } = require('../../shared/ha-events.ts');

const P = 'sensor.gaggiuino_local_profiler_';

// ── the shared helpers ─────────────────────────────────────────────────────

// A happy-dom element is the target the card really dispatches on; the
// helpers themselves only build and dispatch an event.
function newTarget() {
  return window.document.createElement('div');
}

function record(target) {
  const seen = [];
  for (const type of ['hass-more-info', 'hass-notification', 'haptic']) {
    target.addEventListener(type, (e) => seen.push({ type, detail: e.detail, bubbles: e.bubbles, composed: e.composed }));
  }
  return seen;
}

test('moreInfo() fires hass-more-info with the entity id, bubbling and composed', () => {
  const target = newTarget();
  const events = record(target);

  moreInfo(target, `${P}machine_temperature`);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'hass-more-info');
  assert.deepEqual(events[0].detail, { entityId: `${P}machine_temperature` });
  assert.equal(events[0].bubbles, true, 'HA listens on an ancestor, so the event must bubble');
  assert.equal(events[0].composed, true, 'the card lives in a shadow root, so it must cross it');
});

test('toast() fires hass-notification with the message', () => {
  const target = newTarget();
  const events = record(target);

  toast(target, 'Profile Espresso selected');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'hass-notification');
  assert.deepEqual(events[0].detail, { message: 'Profile Espresso selected' });
  assert.equal(events[0].bubbles, true);
  assert.equal(events[0].composed, true);
});

test('haptic() fires haptic with the type as its detail', () => {
  const target = newTarget();
  const events = record(target);

  haptic(target, 'selection');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'haptic');
  assert.equal(events[0].detail, 'selection');
  assert.equal(events[0].bubbles, true);
  assert.equal(events[0].composed, true);
});

// ── the card ───────────────────────────────────────────────────────────────

function onHass(extra = {}) {
  return {
    language: 'en',
    callService: () => {},
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
      [`${P}machine_temperature`]: { state: '93.2' },
      [`${P}machine_target_temperature`]: { state: '93.0' },
      [`${P}machine_live_pressure`]: { state: '9.0' },
      [`${P}machine_live_weight`]: { state: '35.0' },
      [`${P}machine_water_level`]: { state: '65' },
      [`${P}shots_today`]: { state: '3' },
      [`${P}maintenance_backflush`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
      ...extra,
    },
  };
}

function offHass(extra = {}) {
  return {
    language: 'en',
    callService: () => {},
    states: {
      'switch.gaggiuino': { state: 'off' },
      [`${P}machine_status`]: { state: 'offline', attributes: {} },
      [`${P}preheat_elapsed`]: { state: '0' },
      ...extra,
    },
  };
}

// Collects every HA event the card dispatches on itself.
function haEvents(card) {
  const seen = [];
  for (const type of ['hass-more-info', 'hass-notification', 'haptic']) {
    card.addEventListener(type, (e) => seen.push({ type, detail: e.detail }));
  }
  seen.only = (type) => seen.filter(e => e.type === type);
  return seen;
}

function makeCard(hass, config = {}) {
  // The switch entity falls back to localStorage, which every test here
  // shares; a stale value from an earlier case would decide the header's
  // more-info target.
  window.localStorage.clear();
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino', ...config };
  card._hass = hass;
  // No fetchWithAuth and no interest in the tickers: these cases drive events.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  card._render();
  return card;
}

function fire(el, type, init = {}) {
  el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...init }));
}

function click(el) {
  fire(el, 'click');
}

function releaseTimers(card) {
  for (const key of ['_pendingProfileTimer', '_pendingReadyByTimer', '_headerPressTimer']) {
    if (card[key]) { clearTimeout(card[key]); clearInterval(card[key]); card[key] = null; }
  }
}

// ── tapping a live value opens its history ─────────────────────────────────

test('every live tile opens its own entity history', () => {
  const card = makeCard(onHass());
  const seen = haEvents(card);
  const tiles = [...card.shadowRoot.querySelectorAll('.lm-tile')];
  assert.equal(tiles.length, 3, 'temperature, pressure and weight all render');

  const expected = [
    `${P}machine_temperature`,
    `${P}machine_live_pressure`,
    `${P}machine_live_weight`,
  ];
  tiles.forEach(tile => click(tile));

  assert.deepEqual(seen.only('hass-more-info').map(e => e.detail), expected.map(id => ({ entityId: id })));
  releaseTimers(card);
});

test('the footer water level opens the water-level history', () => {
  const card = makeCard(onHass());
  const seen = haEvents(card);
  const water = card.shadowRoot.querySelector('.footer-history');
  assert.ok(water, 'the water level is a button now');

  click(water);

  assert.deepEqual(seen.only('hass-more-info').map(e => e.detail), [{ entityId: `${P}machine_water_level` }]);
  releaseTimers(card);
});

test('a live tile carries a history aria-label with its own label', () => {
  const card = makeCard(onHass());
  const tile = card.shadowRoot.querySelector('.lm-tile');
  const label = tile.getAttribute('aria-label');
  assert.match(label, /Show history$/, 'the button announces what tapping it does');
  assert.match(label, /Temp/, 'and which value it belongs to');
  assert.match(label, /93\.2°/, 'and the value it shows, which the aria-label would otherwise hide');
  assert.equal(tile.getAttribute('type'), 'button');
  releaseTimers(card);
});

// ── long press on the header ───────────────────────────────────────────────

test('a long press on the header opens the configured switch entity', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass());
  const seen = haEvents(card);

  fire(card.shadowRoot.querySelector('.title'), 'pointerdown', { clientX: 10, clientY: 10 });
  t.mock.timers.tick(499);
  assert.equal(seen.length, 0, 'nothing happens before the press is a long press');

  t.mock.timers.tick(1);

  assert.deepEqual(seen.only('hass-more-info').map(e => e.detail), [{ entityId: 'switch.gaggiuino' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection']);
  releaseTimers(card);
});

test('without a switch entity the header long press opens machine_status', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass(), { switch_entity: null });
  const seen = haEvents(card);

  fire(card.shadowRoot.querySelector('.title'), 'pointerdown', { clientX: 10, clientY: 10 });
  t.mock.timers.tick(500);

  assert.deepEqual(seen.only('hass-more-info').map(e => e.detail), [{ entityId: `${P}machine_status` }]);
  releaseTimers(card);
});

test('a short tap on the header opens nothing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass());
  const seen = haEvents(card);
  const title = card.shadowRoot.querySelector('.title');

  fire(title, 'pointerdown', { clientX: 10, clientY: 10 });
  fire(title, 'pointerup', { clientX: 10, clientY: 10 });
  t.mock.timers.tick(1000);

  assert.deepEqual([...seen], []);
  releaseTimers(card);
});

test('a pointer that moves past the slop cancels the long press', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass());
  const seen = haEvents(card);
  const title = card.shadowRoot.querySelector('.title');

  fire(title, 'pointerdown', { clientX: 10, clientY: 10 });
  fire(title, 'pointermove', { clientX: 40, clientY: 40 });
  t.mock.timers.tick(1000);

  assert.deepEqual([...seen], [], 'a scroll or swipe over the header is not a long press');
  releaseTimers(card);
});

test('a pointercancel on the header cancels the long press', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass());
  const seen = haEvents(card);
  const title = card.shadowRoot.querySelector('.title');

  fire(title, 'pointerdown', { clientX: 10, clientY: 10 });
  fire(title, 'pointercancel');
  t.mock.timers.tick(1000);

  assert.deepEqual([...seen], []);
  releaseTimers(card);
});

test('a press on the power button is not a header long press', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass());
  const seen = haEvents(card);
  const power = card.shadowRoot.querySelector('.power-btn');
  assert.ok(power, 'the power button is rendered');

  fire(power, 'pointerdown', { clientX: 10, clientY: 10 });
  t.mock.timers.tick(1000);

  assert.deepEqual(seen.only('hass-more-info'), [], 'the power button keeps its own gesture');
  releaseTimers(card);
});

test('a removed card clears the header press timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard(onHass());
  const seen = haEvents(card);

  fire(card.shadowRoot.querySelector('.title'), 'pointerdown', { clientX: 10, clientY: 10 });
  assert.ok(card._headerPressTimer, 'the press arms its timer');
  card.disconnectedCallback();
  t.mock.timers.tick(1000);

  assert.deepEqual([...seen], []);
});

// ── profile pick ───────────────────────────────────────────────────────────

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('picking a profile vibrates, then toasts the profile name and confirms', async () => {
  let resolveCall;
  const card = makeCard(onHass());
  card._hass.callService = () => new Promise((resolve) => { resolveCall = resolve; });
  const seen = haEvents(card);

  card._selectProfile('Flat White');
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection'], 'the pick is felt at once');

  resolveCall();
  await flush();

  assert.deepEqual(seen.only('hass-notification').map(e => e.detail), [{ message: 'Profile Flat White selected' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection', 'success']);
  releaseTimers(card);
});

test('a rejected profile pick clears the optimistic profile and reports the failure', async () => {
  const card = makeCard(onHass());
  card._hass.callService = () => Promise.reject(new Error('nope'));
  const seen = haEvents(card);

  card._selectProfile('Flat White');
  assert.equal(card._pendingProfile, 'Flat White', 'shown optimistically until the machine answers');
  await flush();

  assert.equal(card._pendingProfile, null, 'the failed pick is rolled back');
  assert.deepEqual(seen.only('hass-notification').map(e => e.detail), [{ message: 'Action failed' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection', 'failure']);
  releaseTimers(card);
});

test('a service call that returns nothing still counts as a success', async () => {
  const card = makeCard(onHass());
  card._hass.callService = () => {};          // an HA stub that returns undefined
  const seen = haEvents(card);

  card._selectProfile('Espresso');
  await flush();

  assert.deepEqual(seen.only('hass-notification').map(e => e.detail), [{ message: 'Profile Espresso selected' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection', 'success']);
  releaseTimers(card);
});

// ── ready-by ───────────────────────────────────────────────────────────────

function setReadyBy(card, value) {
  const input = card.shadowRoot.getElementById('glp-readyby-input');
  assert.ok(input, 'the ready-by picker is rendered on a machine that is off');
  input.value = value;
  click(card.shadowRoot.querySelector('[data-action="set-ready-by"]'));
}

test('a set ready-by toasts the time and confirms with a success vibration', async () => {
  const card = makeCard(offHass());
  const seen = haEvents(card);

  setReadyBy(card, '07:30');
  await flush();

  const toasts = seen.only('hass-notification');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].detail.message, /^Ready by /, 'the toast carries the formatted time');
  assert.match(toasts[0].detail.message, /07:30|7:30/, 'and it is the time that was picked');
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['success']);
  releaseTimers(card);
});

test('a rejected set ready-by drops the optimistic value and reports the failure', async () => {
  const card = makeCard(offHass());
  card._hass.callService = () => Promise.reject(new Error('nope'));
  const seen = haEvents(card);

  setReadyBy(card, '07:30');
  assert.ok(card._pendingReadyByTargetAt, 'shown optimistically until the machine answers');
  await flush();

  assert.equal(card._pendingReadyByTargetAt, null, 'the failed set is rolled back');
  assert.deepEqual(seen.only('hass-notification').map(e => e.detail), [{ message: 'Action failed' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['failure']);
  releaseTimers(card);
});

test('a cancel ready-by confirms with a success vibration and no toast', async () => {
  // Far enough ahead that the schedule still counts as pending whenever the
  // suite runs; the card offers Cancel for any future target.
  const card = makeCard(offHass({
    [`${P}preheat_ready_by_target_at`]: { state: '2030-07-28T07:00:00.000Z' },
    [`${P}preheat_planned_switch_on_at`]: { state: '2030-07-28T06:40:00.000Z' },
  }));
  const seen = haEvents(card);
  const cancel = card.shadowRoot.querySelector('[data-action="cancel-ready-by"]');
  assert.ok(cancel, 'a scheduled ready-by offers a Cancel');

  click(cancel);
  await flush();

  assert.deepEqual(seen.only('hass-notification'), []);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['success']);
  releaseTimers(card);
});

// ── tabs ───────────────────────────────────────────────────────────────────

test('switching tabs vibrates once, and re-picking the same tab does nothing', () => {
  const card = makeCard(onHass());
  const seen = haEvents(card);

  click(card.shadowRoot.querySelector('[data-tab="maint"]'));
  assert.equal(card._activeTab, 'maint');
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection']);

  card._selectTab('maint');
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['selection'], 'the active tab is not a change');
  releaseTimers(card);
});

// ── power ──────────────────────────────────────────────────────────────────

test('a successful power toggle confirms with a success vibration', async () => {
  const card = makeCard(onHass());
  const seen = haEvents(card);

  click(card.shadowRoot.querySelector('[data-action="toggle-switch"]'));
  await flush();

  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['success']);
  assert.deepEqual(seen.only('hass-notification'), []);
  releaseTimers(card);
});

test('a failed power toggle reports the failure', async () => {
  const card = makeCard(onHass());
  card._hass.callService = () => Promise.reject(new Error('nope'));
  const seen = haEvents(card);

  click(card.shadowRoot.querySelector('[data-action="toggle-switch"]'));
  await flush();

  assert.deepEqual(seen.only('hass-notification').map(e => e.detail), [{ message: 'Action failed' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['failure']);
  releaseTimers(card);
});
