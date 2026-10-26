// Barista actions live in the shared bottom sheet (#264): an order row is a
// read-only summary and a tap opens the order, so a long queue no longer grows
// the card with a button row per order. This suite drives the real card in
// happy-dom (same setup as test/sheet-profile-maint.test.js) and checks the
// whole path: what opens the sheet, what it shows, which request each action
// sends, and what a failure or a concurrent handling on another device does.
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

// Two minutes of waiting, so the sheet's waiting line is a fixed number.
const CREATED_AT = Date.now() - 130000;

function pending(over = {}) {
  return {
    id: 'o1', item: 'Coffee', variant: 'Single', customer: 'Ann', note: 'no sugar',
    status: 'pending', createdAt: CREATED_AT, ...over,
  };
}

function accepted(over = {}) {
  return {
    id: 'o2', item: 'Tea', status: 'accepted', createdAt: CREATED_AT,
    acceptedAt: Date.now() - 60000, eta: 5, ...over,
  };
}

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

// Records every request and answers /api/glp/orders with `orders`, everything
// else with an empty list. `actionResponse` decides what a POST to an order
// answers.
function recordingFetch(orders, actionResponse = () => okJson({})) {
  const calls = [];
  const fetchWithAuth = async (path, init) => {
    calls.push({ path, init });
    if (path === '/api/glp/orders') return okJson(typeof orders === 'function' ? orders() : orders);
    if (init && init.method === 'POST') return actionResponse(path);
    return okJson([]);
  };
  fetchWithAuth.calls = calls;
  fetchWithAuth.posts = () => calls.filter(c => c.init && c.init.method === 'POST');
  return fetchWithAuth;
}

function hass(fetchWithAuth) {
  return {
    language: 'en',
    fetchWithAuth,
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
    },
  };
}

function makeCard(orders, { tab = 'orders', fetch } = {}) {
  const fetchWithAuth = fetch || recordingFetch(orders);
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._activeTab = tab;
  // A render arms the poll/ticker intervals that would otherwise keep
  // node --test alive; this suite drives the sheet and _fetchOrders directly.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  window.document.body.appendChild(card);
  // The list has to be in place before the first hass push renders, otherwise
  // the view model sees no orders and drops the Orders tab back to the shot.
  card._orders = orders;
  card.hass = hass(fetchWithAuth);
  card._activeTab = tab;
  card._render();
  return { card, fetchWithAuth };
}

function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

function keydown(el, key) {
  el.dispatchEvent(new window.KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true, composed: true,
  }));
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// An action awaits its own request and then a full refetch, so a single
// setImmediate is not enough to see the settled sheet.
async function settle() {
  for (let i = 0; i < 5; i++) await flush();
}

// Home Assistant events the card fires on itself (bubbling and composed).
function haEvents(card) {
  const seen = [];
  for (const type of ['hass-notification', 'haptic']) {
    card.addEventListener(type, (e) => seen.push({ type, detail: e.detail }));
  }
  return {
    toasts() { return seen.filter((e) => e.type === 'hass-notification').map(e => e.detail.message); },
    haptics() { return seen.filter((e) => e.type === 'haptic').map(e => e.detail); },
  };
}

const row = (card, id) => card.shadowRoot.querySelector(`[data-order-id="${id}"]`);
const sheetTitle = (card) => card.shadowRoot.querySelector('.glp-sheet-title')?.textContent;
const sheetBody = (card) => card.shadowRoot.querySelector('.glp-sheet-body')?.textContent ?? '';

// ── the row is a summary, the sheet is the control surface ─────────────────

test('a row carries no buttons and opens the sheet when tapped', () => {
  const { card } = makeCard([pending()]);

  const r = row(card, 'o1');
  assert.ok(r, 'the order renders as a row');
  assert.equal(r.getAttribute('role'), 'button', 'the row itself is the control');
  assert.equal(r.getAttribute('tabindex'), '0', 'and is reachable with the keyboard');
  assert.equal(r.querySelectorAll('button').length, 0, 'no inline action buttons are left');

  click(r);

  assert.equal(card._sheet?.isOpen, true);
  assert.equal(sheetTitle(card), 'Coffee · Single');
  assert.equal(card.shadowRoot.querySelectorAll('dialog').length, 1, 'one sheet, never a second one');
});

test('Enter on a row opens the sheet too', () => {
  const { card } = makeCard([pending()]);

  keydown(row(card, 'o1'), 'Enter');

  assert.equal(card._sheet?.isOpen, true);
  assert.equal(sheetTitle(card), 'Coffee · Single');
});

test('the sheet repeats the order as a summary, with how long it has waited', () => {
  const { card } = makeCard([pending()]);

  click(row(card, 'o1'));

  const body = sheetBody(card);
  assert.match(body, /Single/, 'the variant');
  assert.match(body, /Ann/, 'the customer');
  assert.match(body, /no sugar/, 'the note');
  assert.match(body, /waiting 2 min/, 'the waiting time since createdAt');
  assert.doesNotMatch(body, /ready in/, 'a pending order promises no time yet');
});

test('an accepted order shows its ready-in line in the sheet', () => {
  const { card } = makeCard([accepted()]);

  click(row(card, 'o2'));

  assert.match(sheetBody(card), /ready in ~4 min/, 'the minutes left, as the row promised');
  assert.equal(sheetTitle(card), 'Tea');
});

test('an order without createdAt says just now and one without eta has no time line', () => {
  const { card } = makeCard([accepted({ createdAt: undefined, eta: undefined })]);

  click(row(card, 'o2'));

  assert.match(sheetBody(card), /just now/, 'a fresh order has no waiting minutes');
  assert.match(sheetBody(card), /being prepared/, 'an accepted order without an eta claims no time');
});

// ── pending: accept with an eta, or decline ────────────────────────────────

test('Accept swaps the actions to the ETA choice without a second sheet', () => {
  const { card } = makeCard([pending()]);

  click(row(card, 'o1'));
  click(card.shadowRoot.querySelector('[data-ord-eta="o1"]'));

  assert.equal(card.shadowRoot.querySelectorAll('dialog').length, 1, 'the same sheet, refreshed');
  assert.ok(card._sheet?.isOpen);
  assert.match(card.shadowRoot.querySelector('.glp-sheet-actions').textContent, /Ready in:/);
  assert.deepEqual([...card.shadowRoot.querySelectorAll('[data-ord-accept]')].map(b => b.getAttribute('data-eta')),
    ['3', '5', '8', '10'], 'the fixed ETA choices');
});

test('choosing 5 min posts accept once, closes the sheet, toasts and vibrates', async () => {
  const { card, fetchWithAuth } = makeCard([pending()]);
  const seen = haEvents(card);
  click(row(card, 'o1'));
  click(card.shadowRoot.querySelector('[data-ord-eta="o1"]'));

  click(card.shadowRoot.querySelector('[data-ord-accept="o1"][data-eta="5"]'));
  await settle();

  const posts = fetchWithAuth.posts();
  assert.equal(posts.length, 1, 'exactly one request');
  assert.equal(posts[0].path, '/api/glp/orders/o1/accept');
  assert.deepEqual(JSON.parse(posts[0].init.body), { eta: 5 });
  assert.equal(card._sheet?.isOpen, false, 'the sheet closes on success');
  assert.deepEqual(seen.toasts(), ['Order accepted · ready in 5 min']);
  assert.deepEqual(seen.haptics(), ['success']);
});

test('an accepted order offers Done, which posts complete once and closes', async () => {
  const { card, fetchWithAuth } = makeCard([accepted()]);
  const seen = haEvents(card);
  click(row(card, 'o2'));

  click(card.shadowRoot.querySelector('[data-ord-done="o2"]'));
  await settle();

  const posts = fetchWithAuth.posts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/api/glp/orders/o2/complete');
  assert.equal(card._sheet?.isOpen, false);
  assert.deepEqual(seen.toasts(), ['Order done']);
  assert.deepEqual(seen.haptics(), ['success']);
});

test('Decline asks first, and Yes declines once with its own toast', async () => {
  const { card, fetchWithAuth } = makeCard([pending()]);
  const seen = haEvents(card);
  click(row(card, 'o1'));

  click(card.shadowRoot.querySelector('[data-ord-decline="o1"]'));
  assert.match(card.shadowRoot.querySelector('.glp-sheet-actions').textContent, /Decline\?/,
    'the confirmation question replaces the actions');

  click(card.shadowRoot.querySelector('[data-ord-decline-yes="o1"]'));
  await settle();

  const posts = fetchWithAuth.posts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/api/glp/orders/o1/decline');
  assert.equal(card._sheet?.isOpen, false);
  assert.deepEqual(seen.toasts(), ['Order declined']);
});

test('Cancel in the decline question posts nothing and returns to the actions', () => {
  const { card, fetchWithAuth } = makeCard([pending()]);
  click(row(card, 'o1'));
  click(card.shadowRoot.querySelector('[data-ord-decline="o1"]'));

  click(card.shadowRoot.querySelector('[data-ord-cancel]'));

  assert.equal(fetchWithAuth.posts().length, 0, 'cancelling is not an action');
  assert.equal(card._sheet?.isOpen, true, 'the sheet stays open');
  assert.ok(card.shadowRoot.querySelector('[data-ord-eta="o1"]'), 'the normal actions are back');
  assert.equal(card.shadowRoot.querySelector('[data-ord-decline-yes]'), null);
});

test('Cancel in the ETA choice posts nothing and returns to the actions', () => {
  const { card, fetchWithAuth } = makeCard([pending()]);
  click(row(card, 'o1'));
  click(card.shadowRoot.querySelector('[data-ord-eta="o1"]'));

  click(card.shadowRoot.querySelector('[data-ord-cancel]'));

  assert.equal(fetchWithAuth.posts().length, 0);
  assert.equal(card._sheet?.isOpen, true);
  assert.ok(card.shadowRoot.querySelector('[data-ord-eta="o1"]'));
});

// ── failure and concurrent handling ────────────────────────────────────────

test('a 500 keeps the sheet open and reports the failure', async () => {
  const { card } = makeCard([pending()], {
    fetch: recordingFetch([pending()], () => ({ ok: false, status: 500, json: async () => ({}) })),
  });
  const seen = haEvents(card);
  click(row(card, 'o1'));
  click(card.shadowRoot.querySelector('[data-ord-eta="o1"]'));

  click(card.shadowRoot.querySelector('[data-ord-accept="o1"][data-eta="3"]'));
  await settle();

  assert.equal(card._sheet?.isOpen, true, 'a failed action leaves the order to retry');
  assert.deepEqual(seen.toasts(), ['Action failed']);
  assert.deepEqual(seen.haptics(), ['failure']);
});

test('a poll that drops the open order closes the sheet without a toast', async () => {
  let orders = [pending()];
  const fetchWithAuth = recordingFetch(() => orders);
  const { card } = makeCard([pending()], { fetch: fetchWithAuth });
  const seen = haEvents(card);
  click(row(card, 'o1'));
  assert.equal(card._sheet?.isOpen, true);

  orders = [];
  await card._fetchOrders(true);
  await settle();

  assert.equal(card._sheet?.isOpen, false, 'the order was handled on another device');
  assert.deepEqual(seen.toasts(), [], 'nothing to report — it was not this card’s action');
});

test('a poll that keeps the open order refreshes the sheet in place', async () => {
  let orders = [pending()];
  const fetchWithAuth = recordingFetch(() => orders);
  const { card } = makeCard([pending()], { fetch: fetchWithAuth });
  click(row(card, 'o1'));

  orders = [pending({ status: 'accepted', acceptedAt: Date.now(), eta: 3 })];
  await card._fetchOrders(true);

  assert.equal(card._sheet?.isOpen, true, 'the order is still there');
  assert.equal(card.shadowRoot.querySelectorAll('dialog').length, 1, 'one sheet, refreshed');
  assert.match(card.shadowRoot.querySelector('.glp-sheet-actions').textContent, /Done/,
    'the actions follow the new status');
});

test('tapping a row whose order is already gone opens nothing', () => {
  const { card } = makeCard([pending()]);
  const r = row(card, 'o1');
  card._orders = [];

  click(r);

  assert.equal(card._sheet?.isOpen ?? false, false);
});
