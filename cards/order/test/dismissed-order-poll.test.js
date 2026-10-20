// "New order" dismissal tests (#169). The poll re-selects a finished
// (done/declined) order from the last 120 s on every tick, so pressing
// **New order** used to bring the dismissed order straight back. Loads the
// real class from src/ through the shared harness and drives _loadStatus()
// with a stubbed _fetch.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpOrderCard } = loadCard();

function makeInstance(orders) {
  const inst = Object.create(GlpOrderCard.prototype);
  inst._hass = { user: { id: 'user-1' } };
  inst._menu = [];
  inst._dismissedOrderId = null;
  inst._render = () => {};
  inst._fetch = (path) => {
    if (path.startsWith('api/orders/mine')) {
      return Promise.resolve({ ok: true, json: async () => orders });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };
  return inst;
}

test('_loadStatus() shows a declined order completed 10 s ago', async () => {
  const inst = makeInstance([
    { id: 'o1', status: 'declined', completedAt: Date.now() - 10000 },
  ]);
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o1');
});

test('_newOrder() dismisses the declined order and the next poll keeps the menu', async () => {
  const inst = makeInstance([
    { id: 'o1', status: 'declined', completedAt: Date.now() - 10000 },
  ]);
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o1');

  inst._newOrder();
  assert.equal(inst._activeOrder, null);

  await inst._loadStatus(true);
  assert.equal(inst._activeOrder, null);
});

test('a later declined order with another id is shown after the dismissal', async () => {
  const inst = makeInstance([
    { id: 'o1', status: 'declined', completedAt: Date.now() - 10000 },
    { id: 'o2', status: 'declined', completedAt: Date.now() - 5000 },
  ]);
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o1');

  inst._newOrder();
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o2');
});

test('a pending order with the dismissed id is still shown', async () => {
  const inst = makeInstance([
    { id: 'o1', status: 'pending', completedAt: Date.now() - 10000 },
  ]);
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o1');

  inst._newOrder();
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o1');
});

// #183: a transient poll failure now keeps the last known state instead of
// falling back to the menu — after a dismissal there is nothing to keep, so
// the dismissed order must stay dismissed and the menu stays visible.
test('a transient poll error does not bring a dismissed order back', async () => {
  const inst = makeInstance([
    { id: 'o1', status: 'declined', completedAt: Date.now() - 10000 },
  ]);
  await inst._loadStatus(true);
  assert.equal(inst._activeOrder?.id, 'o1');

  inst._newOrder();
  inst._fetch = () => Promise.resolve({ ok: false, json: async () => [] });

  await inst._loadStatus(true);
  assert.equal(inst._activeOrder, null);
});
