// Home Assistant custom-card events for the Order Card (#275): selecting a
// drink or variant vibrates once, and placing an order confirms with a toast
// and a haptic — a success for a created order, a failure (plus the existing
// inline message) otherwise. Loads the real class from src/ through the shared
// harness and listens on the card element, which is where the events fire.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const window = new Window();
window.customElements.define('home-assistant', class extends window.HTMLElement {});
loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    // The card dispatches CustomEvents onto a happy-dom element, so they must
    // be happy-dom's events rather than Node's.
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

function makeCard() {
  const card = window.document.createElement('glp-order-card');
  card._config = {};
  card._lang = 'en';
  card._enabled = true;
  card._menu = [{ name: 'Latte' }];
  card._activeBeans = [];
  card._selected = null;
  card._selectedVariant = null;
  card._selectedBeanId = null;
  card._orderError = null;
  card._submitting = false;
  card._hass = { states: {}, user: { id: 'user-1', name: 'Test' }, language: 'en' };
  card._render = () => {};
  return card;
}

// Records every HA event the card fires, in order.
function recordEvents(card) {
  const events = [];
  for (const type of ['haptic', 'hass-notification']) {
    card.addEventListener(type, (e) => events.push(e));
  }
  return events;
}

const details = (events, type) => events.filter((e) => e.type === type).map((e) => e.detail);

test('selecting a drink fires a selection haptic, deselecting fires none', () => {
  const card = makeCard();
  const events = recordEvents(card);

  card._selectItem('Latte');
  assert.deepEqual(details(events, 'haptic'), ['selection']);

  card._selectItem('Latte');
  assert.equal(details(events, 'haptic').length, 1, 'deselecting must not vibrate');
});

test('selecting a variant fires a selection haptic, deselecting fires none', () => {
  const card = makeCard();
  card._selected = 'Latte';
  const events = recordEvents(card);

  card._selectVariant('Oat', null);
  assert.deepEqual(details(events, 'haptic'), ['selection']);

  card._selectVariant('Oat', null);
  assert.equal(details(events, 'haptic').length, 1, 'deselecting must not vibrate');
});

test('a created order toasts the drink and variant and fires a success haptic', async () => {
  const card = makeCard();
  card._selected = 'Latte';
  card._selectedVariant = 'Oat';
  card._fetch = () => Promise.resolve({
    ok: true,
    json: async () => ({ id: 'n1', status: 'pending', item: 'Latte', variant: 'Oat' }),
  });
  const events = recordEvents(card);

  await card._placeOrder();

  assert.deepEqual(details(events, 'hass-notification'), ['Order sent: Latte · Oat']);
  assert.deepEqual(details(events, 'haptic'), ['success']);
  assert.equal(card._orderError, null);
});

test('a non-ok response toasts the failure, fires a failure haptic and keeps the inline error', async () => {
  const card = makeCard();
  card._selected = 'Latte';
  card._fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
  const events = recordEvents(card);

  await card._placeOrder();

  assert.deepEqual(details(events, 'hass-notification'), ['Order could not be sent. Please try again.']);
  assert.deepEqual(details(events, 'haptic'), ['failure']);
  assert.equal(card._orderError, 'Order could not be sent. Please try again.');
  assert.equal(card._selected, 'Latte', 'the selection stays so the customer can retry');
});

test('a thrown fetch toasts the failure, fires a failure haptic and keeps the inline error', async () => {
  const card = makeCard();
  card._selected = 'Latte';
  card._fetch = () => Promise.reject(new Error('offline'));
  const events = recordEvents(card);

  await card._placeOrder();

  assert.deepEqual(details(events, 'hass-notification'), ['Order could not be sent. Please try again.']);
  assert.deepEqual(details(events, 'haptic'), ['failure']);
  assert.equal(card._orderError, 'Order could not be sent. Please try again.');
});

test('every event bubbles and crosses the shadow root', async () => {
  const card = makeCard();
  card._fetch = () => Promise.resolve({
    ok: true,
    json: async () => ({ id: 'n1', status: 'pending', item: 'Latte', variant: 'Oat' }),
  });
  const events = recordEvents(card);

  card._selectItem('Latte');
  card._selectVariant('Oat', null);
  await card._placeOrder();

  assert.equal(events.length, 4, 'two selection haptics, one toast, one success haptic');
  for (const event of events) {
    assert.equal(event.bubbles, true, `${event.type} must bubble`);
    assert.equal(event.composed, true, `${event.type} must cross shadow roots`);
  }
});
