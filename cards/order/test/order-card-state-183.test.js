// Order-card state and accessibility fixes (#183). Loads the real class from
// src/ through the shared harness and drives it with stubbed fetches; the
// rendering tests run against a real DOM (happy-dom) like
// render-escaping.test.js so the emitted elements can be inspected.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard, makeMachineHass } = require('./helpers/load-card.cjs');

const window = new Window();
window.customElements.define('home-assistant', class extends window.HTMLElement {});
const { GlpOrderCard } = loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    // _selectItem()/_placeOrder() now dispatch HA events on the card, so the
    // CustomEvent they construct has to be happy-dom's.
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

function makeCard() {
  const card = window.document.createElement('glp-order-card');
  card._config = {};
  card._lang = 'en';
  card._enabled = true;
  card._menu = [];
  card._activeBeans = [];
  card._hass = { states: {}, user: { id: 'user-1', name: 'Test' }, language: 'en' };
  return card;
}

function makeStatusCard(fetchImpl) {
  const card = makeCard();
  card._activeOrder = { id: 'o1', status: 'pending' };
  card._lastShot = null;
  card._fetch = fetchImpl;
  return card;
}

// --- 1. no zombie poll -------------------------------------------------------

// Lets the timer callback's `await this._loadStatus()` continuation run.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

test('_schedulePoll() does not re-arm after the card disconnected mid-poll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard();
  let polls = 0;
  card._loadStatus = async () => {
    polls += 1;
    card._stopPoll(); // disconnectedCallback() while the request is in flight
  };

  card._pollTimer = null;
  card._schedulePoll();
  t.mock.timers.tick(10000);
  await flushMicrotasks();
  assert.equal(polls, 1);

  // Any re-armed timer would fire on this tick and poll again.
  t.mock.timers.tick(10000);
  await flushMicrotasks();

  assert.equal(polls, 1, 'a detached card must not schedule another poll');
  assert.equal(card._pollTimer, null);
});

test('_schedulePoll() keeps polling while the card stays connected', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard();
  Object.defineProperty(card, 'isConnected', { value: true, configurable: true });
  let polls = 0;
  card._loadStatus = async () => { polls += 1; };

  card._pollTimer = null;
  card._schedulePoll();
  t.mock.timers.tick(10000);
  await flushMicrotasks();
  assert.equal(polls, 1);

  t.mock.timers.tick(10000);
  await flushMicrotasks();
  assert.equal(polls, 2);

  card._stopPoll();
});

// --- 2. keep the pending order on errors -------------------------------------

test('_loadStatus() keeps the pending order when the response is not ok', async () => {
  const card = makeStatusCard(() => Promise.resolve({ ok: false, json: async () => [] }));
  await card._loadStatus(true);
  assert.equal(card._activeOrder?.id, 'o1');
});

test('_loadStatus() keeps the pending order when the body is not an array', async () => {
  const card = makeStatusCard(() => Promise.resolve({ ok: true, json: async () => ({ error: 'nope' }) }));
  await card._loadStatus(true);
  assert.equal(card._activeOrder?.id, 'o1');
});

test('_loadStatus() keeps the pending order when the fetch throws', async () => {
  const card = makeStatusCard(() => Promise.reject(new Error('offline')));
  await card._loadStatus(true);
  assert.equal(card._activeOrder?.id, 'o1');
});

// --- 3. failed order message -------------------------------------------------

test('_placeOrder() keeps the selection and shows a message on a non-ok response', async () => {
  const card = makeCard();
  card._selected = 'Latte';
  card._fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });

  await card._placeOrder();

  assert.equal(card._selected, 'Latte');
  assert.equal(card._orderError, 'Order could not be sent. Please try again.');
});

test('_placeOrder() shows the message when the request throws', async () => {
  const card = makeCard();
  card._selected = 'Latte';
  card._fetch = () => Promise.reject(new Error('offline'));

  await card._placeOrder();

  assert.equal(card._selected, 'Latte');
  assert.equal(card._orderError, 'Order could not be sent. Please try again.');
});

test('_placeOrder() clears the message after a successful retry', async () => {
  const card = makeCard();
  card._selected = 'Latte';
  card._orderError = 'previous failure';
  card._fetch = () => Promise.resolve({
    ok: true,
    json: async () => ({ id: 'n1', status: 'pending', item: 'Latte' }),
  });

  await card._placeOrder();

  assert.equal(card._orderError, null);
  assert.equal(card._selected, null);
  assert.equal(card._activeOrder?.id, 'n1');
});

test('_selectItem() clears the failed-order message when the selection changes', () => {
  const card = makeCard();
  card._menu = [{ name: 'Latte' }];
  card._orderError = 'previous failure';
  card._selectItem('Latte');
  assert.equal(card._orderError, null);
});

// --- 4. standby counts as off ------------------------------------------------

function machineCard(hass, config = {}) {
  const card = makeCard();
  card._config = config;
  card._hass = hass;
  return card;
}

test('_machineOff() returns true when the machine standby entity is on', () => {
  const card = machineCard(makeMachineHass({ standby: 'on' }));
  assert.equal(card._machineOff(), true);
});

test('_machineOff() works without a switch entity when standby is on', () => {
  const card = machineCard(makeMachineHass({ standby: 'on' }));
  assert.equal(card._getSwitchEntity(), null);
  assert.equal(card._machineOff(), true);
});

test('_machineOff() falls back to the switch entity when no standby entity exists', () => {
  const card = machineCard(makeMachineHass({ switchEntity: 'switch.gaggiuino', switchState: 'off' }));
  assert.equal(card._machineOff(), true);
});

test('_machineOff() is false while the standby entity is off and no switch says off', () => {
  const card = machineCard(makeMachineHass({ standby: 'off' }));
  assert.equal(card._machineOff(), false);
});

// --- 5. another person's shot ------------------------------------------------

test('a done order without shotId fetches no shot and shows no summary', async () => {
  const seen = [];
  const card = makeCard();
  card._fetch = (path) => {
    seen.push(path);
    if (path.startsWith('api/orders/mine')) {
      return Promise.resolve({ ok: true, json: async () => [{ id: 'o1', status: 'done', completedAt: Date.now() }] });
    }
    return Promise.resolve({ ok: true, json: async () => ({ duration: 100 }) });
  };

  await card._loadStatus(true);

  assert.equal(card._activeOrder?.id, 'o1');
  assert.equal(card._lastShot, null);
  assert.equal(seen.some(p => p.includes('api/shots')), false, 'api/shots/last must not be used');
});

test('a done order with shotId fetches exactly that shot', async () => {
  const seen = [];
  const card = makeCard();
  card._fetch = (path) => {
    seen.push(path);
    if (path.startsWith('api/orders/mine')) {
      return Promise.resolve({ ok: true, json: async () => [{ id: 'o1', status: 'done', shotId: 's1', completedAt: Date.now() }] });
    }
    return Promise.resolve({ ok: true, json: async () => ({ duration: 120 }) });
  };

  await card._loadStatus(true);

  assert.ok(seen.includes('api/shots/s1'));
  assert.equal(card._lastShot?.duration, 120);
});

// --- 6. language from hass ---------------------------------------------------

test('the hass setter takes the language from hass.language (German)', () => {
  const card = makeCard();
  card._menu = [];
  card.hass = { states: {}, language: 'de-DE' };

  assert.equal(card._lang, 'de');
  clearTimeout(card._hassRenderTimer);
  card._render();
  assert.ok(card.shadowRoot.textContent.includes('Bestellen'));
});

test('an unsupported language falls back to English', () => {
  const card = makeCard();
  assert.equal(card._normalizeLang('xx-YY'), 'en');
  assert.equal(card._normalizeLang(undefined), 'en');
});

test('the failed-order message is localised', async () => {
  const card = makeCard();
  card._lang = 'de';
  card._selected = 'Latte';
  card._fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });

  await card._placeOrder();

  assert.equal(card._orderError, 'Bestellung konnte nicht gesendet werden. Bitte erneut versuchen.');
});

// --- 7. menu tiles and variant chips are buttons -----------------------------

test('menu tiles and variant chips render as <button type="button">', () => {
  const card = makeCard();
  card._menu = [{ name: 'Flat White', variants: ['Single', 'Double'] }];
  card._selected = 'Flat White';
  card._selectedVariant = 'Single';
  card._render();

  const tiles = card.shadowRoot.querySelectorAll('.menu-item');
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].tagName, 'BUTTON');
  assert.equal(tiles[0].getAttribute('type'), 'button');
  assert.equal(tiles[0].getAttribute('data-item'), 'Flat White');

  const chips = card.shadowRoot.querySelectorAll('.variant-chip');
  assert.equal(chips.length, 2);
  for (const chip of chips) {
    assert.equal(chip.tagName, 'BUTTON');
    assert.equal(chip.getAttribute('type'), 'button');
  }
});

// --- 8. malformed variants ---------------------------------------------------

test('a non-array variants value renders no chips and does not throw', () => {
  const card = makeCard();
  assert.deepEqual([...card._getVariants({ name: 'Bad', variants: 'Single' })], []);

  card._menu = [{ name: 'Bad', variants: 'Single' }];
  card._selected = 'Bad';
  card._render();

  assert.equal(card.shadowRoot.querySelectorAll('.variant-chip').length, 0);
});

test('non-string entries inside a variants array are dropped', () => {
  const card = makeCard();
  assert.deepEqual([...card._getVariants({ name: 'Mixed', variants: ['Single', 42, null] })], ['Single']);
});

// Keep the export reachable so an accidental rename of the class is caught.
assert.equal(typeof GlpOrderCard, 'function');
