// The Shot Card is the shared bottom sheet's first user (#265): the profile
// picker and the maintenance confirmation moved out of the card body and into
// GlpSheet, so neither stretches the card any more. This suite drives the real
// card in happy-dom (same setup as test/click-actions.test.js) and checks both
// sheets end to end: what opens them, what the body shows, what the actions
// call, and that a view switch or a removed card closes them.
'use strict';

// Fixed timezone so the last-done date formats identically everywhere.
process.env.TZ = 'UTC';

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

// happy-dom's <dialog> may not implement the modal parts; a stub keeps the
// sheet's showModal()/close() path exercised either way (see test/sheet.test.js).
const dialogProto = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
if (dialogProto && typeof dialogProto.showModal !== 'function') {
  dialogProto.showModal = function showModal() { this.setAttribute('open', ''); };
}
if (dialogProto && typeof dialogProto.close !== 'function') {
  dialogProto.close = function close() { this.removeAttribute('open'); };
}

const P = 'sensor.gaggiuino_local_profiler_';
const S = 'select.gaggiuino_local_profiler_';
const PROFILES = ['Espresso', 'Flat White', 'Turbo'];

// Machine on and idle, with a profile select and the backflush maintenance
// sensor. `machineState` lets a test drive the machine-off view.
function hass({ calls = [], machineState = 'on', lastDate = '2026-07-20T09:15:00.000Z' } = {}) {
  return {
    language: 'en',
    callService: (...args) => calls.push(args),
    states: {
      'switch.gaggiuino': { state: machineState },
      [`${P}machine_status`]: {
        state: machineState === 'on' ? 'online' : 'offline',
        attributes: { recent_shots: [] },
      },
      [`${P}preheat_elapsed`]: { state: machineState === 'on' ? '600' : '0' },
      [`${S}profile`]: { state: 'Flat White', attributes: { options: PROFILES } },
      [`${P}maintenance_backflush`]: {
        state: 'ok',
        attributes: { pct: 0.2, days_since: 3, shots_since: 12, last_date: lastDate },
      },
    },
  };
}

function makeCard(h, { tab = 'shot' } = {}) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._activeTab = tab;
  // A render arms the poll/ticker intervals that would otherwise keep
  // node --test alive; this suite drives the sheets only.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  // Connected, so focus() lands in the document the way a real dashboard does.
  window.document.body.appendChild(card);
  // Through the real setter, so the card's language is set the way a dashboard
  // push sets it.
  card.hass = h;
  return card;
}

// A profile selection arms the 8s optimistic-state timer; leaving it running
// would hold node --test open after the assertion has passed.
function releaseTimers(card) {
  clearTimeout(card._pendingProfileTimer);
  card._pendingProfileTimer = null;
}

function keydown(el, key) {
  el.dispatchEvent(new window.KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true, composed: true,
  }));
}

function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Home Assistant events the card fires on itself (bubbling and composed).
function haEvents(card) {
  const seen = [];
  for (const type of ['hass-notification', 'haptic']) {
    card.addEventListener(type, (e) => seen.push({ type, detail: e.detail }));
  }
  return {
    only(type) { return seen.filter((e) => e.type === type); },
  };
}

function options(card) {
  return [...card.shadowRoot.querySelectorAll('.profile-sheet-opt')];
}

// Focus tracking by spying on focus() itself: happy-dom's activeElement for
// nodes inside a shadow root is not reliable enough to assert on, and what the
// card promises is exactly "this option receives focus".
function spyFocus(t) {
  const proto = window.HTMLElement.prototype;
  const original = proto.focus;
  const seen = [];
  proto.focus = function recordFocus(...args) {
    seen.push(this);
    return original.apply(this, args);
  };
  t.after(() => { proto.focus = original; });
  return { get last() { return seen.length ? seen[seen.length - 1] : null; } };
}

// ── profile picker ─────────────────────────────────────────────────────────

test('the current-profile button opens the sheet with one option per profile', () => {
  const card = makeCard(hass());

  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));

  assert.equal(card._sheet?.isOpen, true, 'the picker moved into the shared sheet');
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-title').textContent, 'Profile');
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-close').getAttribute('aria-label'), 'Close',
    'the sheet carries the card-translated close label');
  const opts = options(card);
  assert.deepEqual(opts.map(o => o.getAttribute('data-profile-opt')), PROFILES);
  assert.equal(opts.length, PROFILES.length, 'one option per profile');
  assert.equal(card.shadowRoot.querySelectorAll('.profile-opts').length, 0,
    'the inline list is gone');
  assert.equal(opts[0].getAttribute('role'), 'option');
  assert.equal(opts[0].closest('[role="listbox"]').getAttribute('aria-label'), 'Profile');
});

test('the active profile is marked selected and carries the check icon', () => {
  const card = makeCard(hass());

  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));

  const opts = options(card);
  const active = opts.filter(o => o.getAttribute('aria-selected') === 'true');
  assert.deepEqual(active.map(o => o.getAttribute('data-profile-opt')), ['Flat White']);
  assert.ok(active[0].classList.contains('active'), 'the active option is styled as such');
  assert.equal(active[0].querySelector('svg'), active[0].querySelector('.glp-i'),
    'the check icon is the drawn icon set, not a glyph');
  assert.equal(opts[0].getAttribute('aria-selected'), 'false');
  assert.equal(opts[0].querySelector('svg'), null, 'only the active option shows a check');
});

test('choosing an option calls select.select_option once and closes the sheet', () => {
  const calls = [];
  const card = makeCard(hass({ calls }));

  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));
  click(options(card)[2]);

  assert.equal(calls.length, 1, 'exactly one service call');
  assert.deepEqual(calls[0], [
    'select', 'select_option',
    { entity_id: 'select.gaggiuino_local_profiler_profile', option: 'Turbo' },
  ]);
  assert.equal(card._sheet?.isOpen, false, 'the sheet closes on selection');
  releaseTimers(card);
});

test('the picker opens on the active option', (t) => {
  const focus = spyFocus(t);
  const card = makeCard(hass());

  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));

  assert.equal(focus.last, card.shadowRoot.querySelector('.profile-sheet-opt.active'),
    'a long profile list starts where the current profile is');
});

test('ArrowDown/ArrowUp move focus between options and wrap at both ends', (t) => {
  const focus = spyFocus(t);
  const card = makeCard(hass());
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));
  const opts = options(card);

  // The sheet opened on the active profile (index 1).
  keydown(opts[1], 'ArrowDown');
  assert.equal(focus.last, opts[2], 'down moves to the next option');

  keydown(opts[2], 'ArrowDown');
  assert.equal(focus.last, opts[0], 'down wraps to the first option');

  keydown(opts[0], 'ArrowUp');
  assert.equal(focus.last, opts[2], 'up wraps to the last option');

  keydown(opts[2], 'ArrowUp');
  assert.equal(focus.last, opts[1], 'up moves to the previous option');
});

test('Home and End jump to the first and last option', (t) => {
  const focus = spyFocus(t);
  const card = makeCard(hass());
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));
  const opts = options(card);

  keydown(opts[1], 'End');
  assert.equal(focus.last, opts[2]);
  keydown(opts[2], 'Home');
  assert.equal(focus.last, opts[0]);
});

test('Enter selects the focused option and closes the sheet', (t) => {
  const focus = spyFocus(t);
  const calls = [];
  const card = makeCard(hass({ calls }));
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));
  const opts = options(card);

  keydown(opts[1], 'ArrowDown');            // active is index 1 → focus Turbo
  assert.equal(focus.last, opts[2]);
  keydown(opts[2], 'Enter');

  assert.equal(calls.length, 1, 'Enter activates the focused option once');
  assert.deepEqual(calls[0][2], {
    entity_id: 'select.gaggiuino_local_profiler_profile',
    option: 'Turbo',
  });
  assert.equal(card._sheet?.isOpen, false);
  releaseTimers(card);
});

test('Escape closes the picker without selecting anything', () => {
  const calls = [];
  const card = makeCard(hass({ calls }));
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));

  card.shadowRoot.querySelector('dialog')
    .dispatchEvent(new window.Event('cancel', { bubbles: false, cancelable: true }));

  assert.equal(card._sheet?.isOpen, false, 'the native dialog cancel closes the sheet');
  assert.equal(calls.length, 0, 'closing is not a selection');
});

// ── maintenance ────────────────────────────────────────────────────────────

function maintRow(card) {
  return card.shadowRoot.querySelector('.maint-row[data-maint-task="backflush"]');
}

test('tapping a maintenance row opens the sheet with the task name and last date', () => {
  const card = makeCard(hass(), { tab: 'maint' });

  click(maintRow(card));

  assert.equal(card._sheet?.isOpen, true);
  assert.equal(card.shadowRoot.querySelector('.glp-sheet-title').textContent, 'Backflush');
  const body = card.shadowRoot.querySelector('.glp-sheet-body');
  assert.match(body.textContent, /Last done/, 'the last-done label is shown');
  assert.match(body.textContent, /07\/20\/2026/, 'the last_date attribute is formatted for this locale');
  assert.match(body.textContent, /3 days ago · 12 shots/, 'the counters the row already shows');
  assert.match(body.textContent, /OK/, 'the status pill the row already shows');
  assert.doesNotMatch(body.textContent, /interval/i,
    'the sensors carry no interval, so the sheet must not invent one');
  assert.equal(card.shadowRoot.querySelectorAll('.maint-confirm').length, 0,
    'the inline confirm row is gone');
});

test('a missing last_date renders as a dash instead of an empty line', () => {
  const card = makeCard(hass({ lastDate: null }), { tab: 'maint' });

  click(maintRow(card));

  assert.equal(card.shadowRoot.querySelector('.maint-detail-val').textContent, '—');
});

test('older DD.MM.YYYY last dates are read as that date, not as a US one', () => {
  const card = makeCard(hass({ lastDate: '05.03.2026' }), { tab: 'maint' });

  click(maintRow(card));

  assert.equal(card.shadowRoot.querySelector('.maint-detail-val').textContent, '03/05/2026');
});

test('an unparsable last_date is shown as it arrived', () => {
  const card = makeCard(hass({ lastDate: 'unknown' }), { tab: 'maint' });

  click(maintRow(card));

  assert.equal(card.shadowRoot.querySelector('.maint-detail-val').textContent, 'unknown');
});

test('Done today calls maintenance_done once with the task and closes', () => {
  const calls = [];
  const card = makeCard(hass({ calls }), { tab: 'maint' });
  click(maintRow(card));

  click(card.shadowRoot.querySelector('[data-maint-done="backflush"]'));

  assert.equal(calls.length, 1, 'exactly one service call');
  assert.deepEqual(calls[0], ['gaggiuino_profiler', 'maintenance_done', { task: 'backflush' }]);
  assert.equal(card._sheet?.isOpen, false, 'the sheet closes after confirming');
});

test('Done today toasts the task name and vibrates on success', async () => {
  const card = makeCard(hass(), { tab: 'maint' });
  const seen = haEvents(card);
  click(maintRow(card));

  click(card.shadowRoot.querySelector('[data-maint-done="backflush"]'));
  await flush();

  assert.deepEqual(seen.only('hass-notification').map(e => e.detail),
    [{ message: 'Backflush marked as done' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['success']);
});

test('Cancel calls no service and only closes the sheet', () => {
  const calls = [];
  const card = makeCard(hass({ calls }), { tab: 'maint' });
  click(maintRow(card));

  click(card.shadowRoot.querySelector('[data-maint-cancel]'));

  assert.equal(calls.length, 0, 'cancelling is not an action on the machine');
  assert.equal(card._sheet?.isOpen, false);
});

test('a rejected maintenance_done fires the failure toast', async () => {
  const card = makeCard(hass(), { tab: 'maint' });
  card._hass.callService = () => Promise.reject(new Error('nope'));
  const seen = haEvents(card);
  click(maintRow(card));

  click(card.shadowRoot.querySelector('[data-maint-done="backflush"]'));
  await flush();

  assert.deepEqual(seen.only('hass-notification').map(e => e.detail), [{ message: 'Action failed' }]);
  assert.deepEqual(seen.only('haptic').map(e => e.detail), ['failure']);
});

test('a static grinder row still opens no sheet', () => {
  const h = hass();
  h.states[`${P}maintenance_grinders`] = {
    state: 'ok',
    attributes: { Niche: { status: 'ok', pct: 0.5, days_since: 2, shots_since: 3 } },
  };
  const card = makeCard(h, { tab: 'maint' });

  const grinderRow = [...card.shadowRoot.querySelectorAll('.maint-row')]
    .find(r => !r.hasAttribute('data-maint-task'));
  assert.ok(grinderRow, 'the grinder row renders without a task');
  click(grinderRow);

  assert.equal(card._sheet?.isOpen ?? false, false, 'a row without a task opens nothing');
});

// ── lifecycle ──────────────────────────────────────────────────────────────

test('the machine-off view closes an open sheet', () => {
  const card = makeCard(hass());
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));
  assert.equal(card._sheet?.isOpen, true);

  card.hass = hass({ machineState: 'off' });

  assert.equal(card._sheet?.isOpen, false, 'the sheet has nothing left to act on when the machine is off');
});

test('a removed card closes an open sheet and trims its history entry', () => {
  const card = makeCard(hass());
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));
  assert.equal(card._sheet?.isOpen, true);

  card.remove();

  assert.equal(card._sheet?.isOpen, false, 'a detached card must not leave a sheet behind');
});

test('the card still renders its own controls while a sheet is open', () => {
  const card = makeCard(hass());
  click(card.shadowRoot.querySelector('[data-action="toggle-profile"]'));

  // A hass push re-renders the card; the sheet lives in its own slot node, so
  // Lit cannot eject it.
  card._render();

  assert.equal(card.shadowRoot.querySelectorAll('dialog').length, 1, 'one sheet, never a duplicate');
  assert.ok(card.shadowRoot.querySelector('.profile-current-btn'), 'the card itself is still rendered');
});
