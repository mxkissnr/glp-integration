// Click-driven action wiring (#225). The card's action handlers are bound on
// 'click' now, not 'pointerdown', so a scroll gesture over a control (which
// fires pointerdown/pointercancel but never click) must not call a service, a
// real click must, and keyboard Enter/Space activation (which only emits click)
// must reach the control. Renders the card into a real happy-dom document and
// drives events on it, like test/ready-by.test.js and test/render-guard.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
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

const P = 'sensor.gaggiuino_local_profiler_';

// Machine on and idle with a maintenance sensor present, so the hero view
// (power button) and the shot/maint tab bar both render.
function hass(calls = []) {
  return {
    language: 'en',
    callService: (...args) => calls.push(args),
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
      [`${P}maintenance_backflush`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
    },
  };
}

function makeCard(h) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._hass = h;
  // The fake hass carries no fetchWithAuth, and a render arms the interval
  // tickers that would otherwise keep node --test alive; this suite drives
  // events only, so the tickers are stubbed out.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  card._render();
  return card;
}

function fire(el, type) {
  el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true, composed: true }));
}

test('a scroll gesture over the power button (pointerdown then pointercancel) calls no service', () => {
  const calls = [];
  const card = makeCard(hass(calls));
  const btn = card.shadowRoot.querySelector('[data-action="toggle-switch"]');
  assert.ok(btn, 'the power button is rendered');

  fire(btn, 'pointerdown');
  fire(btn, 'pointercancel');

  assert.equal(calls.length, 0, 'a touch that turns into a scroll must not reach a service call');
});

test('a click on the power button calls switch.toggle exactly once', () => {
  const calls = [];
  const card = makeCard(hass(calls));
  const btn = card.shadowRoot.querySelector('[data-action="toggle-switch"]');
  assert.ok(btn, 'the power button is rendered');

  fire(btn, 'click');

  assert.equal(calls.length, 1, 'exactly one service call');
  assert.deepEqual(calls[0], ['switch', 'toggle', { entity_id: 'switch.gaggiuino' }]);
});

test('a click on a tab button switches the tab', () => {
  const card = makeCard(hass());
  const tab = card.shadowRoot.querySelector('[data-tab="maint"]');
  assert.ok(tab, 'the maintenance tab button is rendered');

  fire(tab, 'click');

  assert.equal(card._activeTab, 'maint', 'the maintenance tab is active after the click');
});

test('the only pointerdown handler in the card is the header long-press', () => {
  const src = readFileSync(path.join(__dirname, '..', 'src', 'glp-card.ts'), 'utf8');
  const handlers = src.match(/'pointerdown', \(e: Event\) => \{/g) || [];
  assert.equal(handlers.length, 1, 'control actions stay on click; only the header press uses pointerdown');
});

// #267/#265: the maintenance row with a confirm flow is the card's only action
// that is not a native <button> — it carries role="button", so it must also be
// reachable with Tab and operable with Enter/Space. It now opens the shared
// bottom sheet instead of stretching the card with an inline confirm row. A
// grinder status row has no confirm flow behind it (no `task`) and must stay
// out of the tab order and inert.
function maintCard(h) {
  const card = makeCard(h);
  card._activeTab = 'maint';
  card._render();
  return card;
}

function maintHass() {
  const h = hass();
  h.states[`${P}maintenance_grinders`] = {
    state: 'ok',
    attributes: { Niche: { status: 'ok', pct: 0.5, days_since: 2, shots_since: 3 } },
  };
  return h;
}

function keydown(el, key) {
  const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true });
  el.dispatchEvent(ev);
  return ev;
}

test('a maintenance row with a task is in the tab order', () => {
  const card = maintCard(maintHass());
  const row = card.shadowRoot.querySelector('.maint-row[data-maint-task="backflush"]');
  assert.ok(row, 'the backflush row is rendered');
  assert.equal(row.getAttribute('tabindex'), '0', 'the actionable row is keyboard reachable');
  assert.equal(row.getAttribute('role'), 'button');
});

test('Enter on a maintenance row opens the confirmation sheet', () => {
  const card = maintCard(maintHass());
  const row = card.shadowRoot.querySelector('.maint-row[data-maint-task="backflush"]');

  keydown(row, 'Enter');

  assert.equal(card._sheet?.isOpen, true, 'the confirm flow opens from the keyboard');
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-title').textContent, 'Backflush');
  assert.ok(card.shadowRoot.querySelector('[data-maint-done="backflush"]'),
    'the sheet carries the done action for this task');
});

test('Space on a maintenance row opens the sheet and prevents page scroll', () => {
  const card = maintCard(maintHass());
  const row = card.shadowRoot.querySelector('.maint-row[data-maint-task="backflush"]');

  const ev = keydown(row, ' ');

  assert.equal(card._sheet?.isOpen, true, 'Space activates the row');
  assert.equal(ev.defaultPrevented, true, 'Space must not scroll the page');
});

test('a maintenance row without a task is not focusable', () => {
  const card = maintCard(maintHass());
  const rows = [...card.shadowRoot.querySelectorAll('.maint-row')];
  const grinderRow = rows.find(r => !r.hasAttribute('data-maint-task'));
  assert.ok(grinderRow, 'the grinder row renders without a task');

  assert.equal(grinderRow.hasAttribute('tabindex'), false, 'a static row stays out of the tab order');
  assert.equal(grinderRow.hasAttribute('role'), false, 'a static row is not announced as a button');

  const ev = keydown(grinderRow, 'Enter');
  assert.equal(card._sheet?.isOpen ?? false, false, 'a static row does not open a confirmation');
  assert.equal(ev.defaultPrevented, false);
});
