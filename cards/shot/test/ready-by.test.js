// Ready-by preheat scheduler tests (#61, #214). Most of the suite drives the
// pure logic directly (_resolveReadyByTarget's today/tomorrow date math,
// _readReadyBy's hass.states parsing) on an Object.create(GlpCard.prototype)
// instance. The #214 fallback-timer tests need the real click handler — which
// is where _pendingReadyByTimer is armed — so those render the card into a
// real happy-dom document (like test/render-guard.test.js), dispatch click and
// advance the clock with node:test's fake timers.
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
// and registers `glp-card` in this window's registry.
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

function makeInstance({ config = {}, states = {} } = {}) {
  const inst = Object.create(GlpCard.prototype);
  inst._config = config;
  inst._hass = { states };
  return inst;
}

// ── _resolveReadyByTarget() ────────────────────────────────────────────────

test('_resolveReadyByTarget() returns today when the picked time has not passed yet', () => {
  const inst = makeInstance();
  const now = new Date(2026, 6, 27, 14, 0, 0);       // 2026-07-27 14:00
  const target = inst._resolveReadyByTarget('18:30', now);
  assert.equal(target.getFullYear(), 2026);
  assert.equal(target.getMonth(), 6);
  assert.equal(target.getDate(), 27);
  assert.equal(target.getHours(), 18);
  assert.equal(target.getMinutes(), 30);
});

test('_resolveReadyByTarget() rolls over to tomorrow when the picked time has already passed today', () => {
  const inst = makeInstance();
  const now = new Date(2026, 6, 27, 22, 0, 0);       // 2026-07-27 22:00
  const target = inst._resolveReadyByTarget('07:00', now);
  assert.equal(target.getFullYear(), 2026);
  assert.equal(target.getMonth(), 6);
  assert.equal(target.getDate(), 28);                // rolled to the next day
  assert.equal(target.getHours(), 7);
  assert.equal(target.getMinutes(), 0);
});

test('_resolveReadyByTarget() treats an exact-now match as already passed (rolls to tomorrow)', () => {
  const inst = makeInstance();
  const now = new Date(2026, 6, 27, 9, 15, 0);
  const target = inst._resolveReadyByTarget('09:15', now);
  assert.equal(target.getDate(), 28);
});

test('_resolveReadyByTarget() returns null for malformed input', () => {
  const inst = makeInstance();
  const now = new Date(2026, 6, 27, 9, 15, 0);
  assert.equal(inst._resolveReadyByTarget('', now), null);
  assert.equal(inst._resolveReadyByTarget('not-a-time', now), null);
  assert.equal(inst._resolveReadyByTarget('25:00', now), null);
  assert.equal(inst._resolveReadyByTarget(undefined, now), null);
});

// ── _readReadyBy() ──────────────────────────────────────────────────────────

test('_readReadyBy() reads scheduled targetAt/plannedAt off hass.states', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });
  const { targetAt, plannedAt } = inst._readReadyBy();
  // note: targetAt/plannedAt are Date instances of the vm context's own
  // realm, not this test file's — `instanceof Date` doesn't hold across
  // realms, so behavior (toISOString) is asserted instead of the class.
  assert.equal(targetAt.toISOString(), '2026-07-28T07:00:00.000Z');
  assert.equal(plannedAt.toISOString(), '2026-07-28T06:40:00.000Z');
});

test('_readReadyBy() returns null targetAt/plannedAt when the sensors are unknown (nothing scheduled)', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: 'unknown' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: 'unknown' },
    },
  });
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, null);
  assert.equal(plannedAt, null);
});

test('_readReadyBy() returns null when the sensor entities do not exist at all', () => {
  const inst = makeInstance({
    states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} } },
  });
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, null);
  assert.equal(plannedAt, null);
});

// ── _readReadyBy() 'unavailable' vs 'unknown' (#68) ─────────────────────────
// 'unavailable' is a transient connectivity blip (coordinator poll failure,
// integration reload, ...) and must NOT be read as "nothing scheduled" — the
// card should keep showing the last successfully-parsed value. Only a
// genuine 'unknown' state (or the entity being missing) is a real "nothing
// scheduled" signal and should clear the display.

test('_readReadyBy() keeps showing the last-known-good target/planned across a transient "unavailable" blip', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });

  // 1) real value — establishes the last-known-good cache
  const first = inst._readReadyBy();
  assert.equal(first.targetAt.toISOString(), '2026-07-28T07:00:00.000Z');
  assert.equal(first.plannedAt.toISOString(), '2026-07-28T06:40:00.000Z');

  // 2) transient 'unavailable' blip — must NOT drop to null, falls back to cache
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_ready_by_target_at'] = { state: 'unavailable' };
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at'] = { state: 'unavailable' };
  const duringBlip = inst._readReadyBy();
  assert.equal(duringBlip.targetAt.toISOString(), '2026-07-28T07:00:00.000Z');
  assert.equal(duringBlip.plannedAt.toISOString(), '2026-07-28T06:40:00.000Z');

  // 3) sensor recovers with a real value again
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_ready_by_target_at'] = { state: '2026-07-28T07:30:00.000Z' };
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at'] = { state: '2026-07-28T07:10:00.000Z' };
  const after = inst._readReadyBy();
  assert.equal(after.targetAt.toISOString(), '2026-07-28T07:30:00.000Z');
  assert.equal(after.plannedAt.toISOString(), '2026-07-28T07:10:00.000Z');
});

test('_readReadyBy() clears to null on a genuine "unknown" (real cancel/completion, not a blip)', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });

  // 1) real value — establishes the last-known-good cache
  const first = inst._readReadyBy();
  assert.equal(first.targetAt.toISOString(), '2026-07-28T07:00:00.000Z');

  // 2) genuine 'unknown' — a real clear, must drop to null (not fall back to cache)
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_ready_by_target_at'] = { state: 'unknown' };
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at'] = { state: 'unknown' };
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, null);
  assert.equal(plannedAt, null);

  // 3) and a later 'unavailable' blip has nothing to fall back to anymore
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_ready_by_target_at'] = { state: 'unavailable' };
  const afterBlip = inst._readReadyBy();
  assert.equal(afterBlip.targetAt, null);
});

test('_readReadyBy() caches targetAt and plannedAt independently — one blipping does not clobber the other', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });
  inst._readReadyBy(); // establish both caches

  // only the planned sensor blips
  inst._hass.states['sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at'] = { state: 'unavailable' };
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt.toISOString(), '2026-07-28T07:00:00.000Z');
  assert.equal(plannedAt.toISOString(), '2026-07-28T06:40:00.000Z');   // held from cache
});

// ── _readReadyBy() optimistic pending override (#66) ───────────────────────
// Same shape as the pre-existing _pendingProfile pattern: a pending value set
// right after the "Set"/"Cancel" service calls is preferred over the live
// sensor read until the sensor confirms it.

test('_readReadyBy() prefers a pending Set target over a still-stale (unknown) sensor', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: 'unknown' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: 'unknown' },
    },
  });
  const pending = new Date(2026, 6, 28, 7, 0, 0);
  inst._pendingReadyByTargetAt = pending;
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, pending);
  assert.equal(plannedAt, null);
  // still pending — the sensor hasn't confirmed yet
  assert.equal(inst._pendingReadyByTargetAt, pending);
});

test('_readReadyBy() clears the pending Set override once the sensor reports a real targetAt', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });
  // pending value constructed from the ISO string (not local y/m/d/h/m/s
  // fields) so the getTime() match against the sensor's UTC state is
  // timezone-independent.
  inst._pendingReadyByTargetAt = new Date('2026-07-28T07:00:00.000Z');
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt.toISOString(), '2026-07-28T07:00:00.000Z');
  assert.equal(plannedAt.toISOString(), '2026-07-28T06:40:00.000Z');
  // resolved — pending override cleared so future renders read the sensor
  assert.equal(inst._pendingReadyByTargetAt, null);
});

test('_readReadyBy() (#70) keeps a pending re-schedule when the sensor still reports the old target', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      // sensor still holds the *old* target — hasn't caught up to the new pick yet
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });
  const newPending = new Date('2026-07-28T08:00:00.000Z'); // 08:00, different from the sensor's 07:00
  inst._pendingReadyByTargetAt = newPending;
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, newPending);
  assert.equal(plannedAt, null);
  // not confirmed yet — a truthy-but-mismatched realTargetAt must not clear it
  assert.equal(inst._pendingReadyByTargetAt, newPending);
});

test('_readReadyBy() (#70) clears a pending re-schedule once the sensor reports the matching new target', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T08:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T07:40:00.000Z' },
    },
  });
  inst._pendingReadyByTargetAt = new Date('2026-07-28T08:00:00.000Z');
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt.toISOString(), '2026-07-28T08:00:00.000Z');
  assert.equal(plannedAt.toISOString(), '2026-07-28T07:40:00.000Z');
  assert.equal(inst._pendingReadyByTargetAt, null);
});

test('_readReadyBy() prefers a pending Cancel (targetAt=null) over a still-stale (set) sensor', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: '2026-07-28T07:00:00.000Z' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: '2026-07-28T06:40:00.000Z' },
    },
  });
  inst._pendingReadyByTargetAt = false;
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, null);
  assert.equal(plannedAt, null);
  assert.equal(inst._pendingReadyByTargetAt, false);
});

test('_readReadyBy() clears the pending Cancel override once the sensor reports no target', () => {
  const inst = makeInstance({
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} },
      'sensor.gaggiuino_local_profiler_preheat_ready_by_target_at': { state: 'unknown' },
      'sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at': { state: 'unknown' },
    },
  });
  inst._pendingReadyByTargetAt = false;
  const { targetAt, plannedAt } = inst._readReadyBy();
  assert.equal(targetAt, null);
  assert.equal(plannedAt, null);
  assert.equal(inst._pendingReadyByTargetAt, null);
});

// ── _readyByCountdownText() ─────────────────────────────────────────────────

test('_readyByCountdownText() returns empty string when nothing is planned or pending', () => {
  const inst = makeInstance();
  assert.equal(inst._readyByCountdownText(null), '');
});

test('_readyByCountdownText() returns the scheduling placeholder when a target is set but plannedAt is not known yet', () => {
  // LANG defaults to 'de' at module load until _render() sets it from
  // hass.language — this suite never calls _render(), so the German string
  // is what T() resolves to here.
  const inst = makeInstance();
  assert.equal(inst._readyByCountdownText(null, new Date()), 'Wird geplant …');
});

// The ready-by input is left uncontrolled in the Lit template, so a typed time
// survives an hass update without any focus/blur render guard; that behaviour
// is covered by test/render-guard.test.js.

// ── optimistic Set/Cancel fallback timing (#214) ────────────────────────────
// The card shows the picked/cancelled value immediately and clears it as soon
// as _readReadyBy() sees the sensor confirm it. The armed timer is only the
// fallback for a service call the backend never applied; #214 sized it to the
// 60 s default poll because the integration's post-call refresh is debounced
// (~10 s) and the sensor regularly confirmed later than the old 8 s.

const P = 'sensor.gaggiuino_local_profiler_';

// Machine off with nothing scheduled: the ready-by picker is rendered.
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

// A target the sensor already reports — the stale read a Cancel has to
// override until the backend confirms the cancel.
function staleTarget() {
  return {
    [`${P}preheat_ready_by_target_at`]: { state: '2026-07-28T07:00:00.000Z' },
    [`${P}preheat_planned_switch_on_at`]: { state: '2026-07-28T06:40:00.000Z' },
  };
}

function makeLiveCard(hass) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._hass = hass;
  // The fake hass carries no fetchWithAuth, and _render() would otherwise arm
  // the setInterval tickers that keep node --test alive; these tests render on
  // demand and drive setTimeout themselves.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._render();
  return card;
}

// Fires the constructor's delegated click handler — the same path a real tap or
// keyboard activation takes (the card binds on 'click').
function press(card, action) {
  const btn = card.shadowRoot.querySelector(`[data-action="${action}"]`);
  assert.ok(btn, `the ${action} button is rendered`);
  btn.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true, composed: true }));
}

test('a pending Set holds through 15 s of unconfirmed hass updates, then clears on the matching sensor value (#214)', (t) => {
  const card = makeLiveCard(offHass());
  card.shadowRoot.getElementById('glp-readyby-input').value = '07:30';

  t.mock.timers.enable({ apis: ['setTimeout'] });
  press(card, 'set-ready-by');
  const pending = card._pendingReadyByTargetAt;
  assert.ok(pending, 'the Set is shown optimistically right after the press');

  // The backend is slow: hass keeps arriving with the target sensor still
  // 'unknown'. The old fixed 8 s timer dropped the optimistic value inside
  // this window; the 60 s fallback must hold it.
  for (let elapsed = 5000; elapsed <= 15000; elapsed += 5000) {
    card.hass = offHass();
    t.mock.timers.tick(5000);
    assert.equal(card._readReadyBy().targetAt, pending, `still pending after ${elapsed} ms`);
  }

  // The sensor catches up with the matching value — the override clears.
  card.hass = offHass({
    [`${P}preheat_ready_by_target_at`]: { state: pending.toISOString() },
    [`${P}preheat_planned_switch_on_at`]: { state: pending.toISOString() },
  });
  assert.equal(card._pendingReadyByTargetAt, null, 'the matching sensor value clears the override');
  assert.equal(card._readReadyBy().targetAt.toISOString(), pending.toISOString());
});

test('a pending Set falls back after 60 s when the sensor never confirms (#214)', (t) => {
  const card = makeLiveCard(offHass());
  card.shadowRoot.getElementById('glp-readyby-input').value = '07:30';

  t.mock.timers.enable({ apis: ['setTimeout'] });
  press(card, 'set-ready-by');
  assert.ok(card._pendingReadyByTargetAt, 'pending right after the press');

  t.mock.timers.tick(59999);
  assert.ok(card._pendingReadyByTargetAt, 'still pending just before the 60 s fallback');

  t.mock.timers.tick(1);
  assert.equal(card._pendingReadyByTargetAt, null, 'the 60 s fallback clears the override');
});

test('a pending Cancel holds while the sensor is still stale, then clears on confirmation (#214)', (t) => {
  const card = makeLiveCard(offHass(staleTarget()));

  t.mock.timers.enable({ apis: ['setTimeout'] });
  press(card, 'cancel-ready-by');
  assert.strictEqual(card._pendingReadyByTargetAt, false, 'the Cancel is shown optimistically');

  for (let elapsed = 5000; elapsed <= 15000; elapsed += 5000) {
    card.hass = offHass(staleTarget());
    t.mock.timers.tick(5000);
    assert.strictEqual(card._pendingReadyByTargetAt, false, `still cancelling after ${elapsed} ms`);
    assert.equal(card._readReadyBy().targetAt, null, 'the picker is still shown while stale');
  }

  card.hass = offHass();   // sensor confirms: nothing scheduled
  assert.equal(card._pendingReadyByTargetAt, null, 'the confirming (unknown) sensor clears the Cancel');
});

test('a pending Cancel falls back after 60 s when the sensor never confirms (#214)', (t) => {
  const card = makeLiveCard(offHass(staleTarget()));

  t.mock.timers.enable({ apis: ['setTimeout'] });
  press(card, 'cancel-ready-by');

  t.mock.timers.tick(59999);
  assert.strictEqual(card._pendingReadyByTargetAt, false, 'still cancelling just before the 60 s fallback');

  t.mock.timers.tick(1);
  assert.equal(card._pendingReadyByTargetAt, null, 'the 60 s fallback clears the Cancel');
});
