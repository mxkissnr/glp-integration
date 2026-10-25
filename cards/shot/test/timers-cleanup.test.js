// Shot-card background work must stop with the card (#270, slice A):
// disconnectedCallback has to clear every timer the card owns, a detached card
// must not arm a new one from a late hass push, a 404 from /api/glp/orders
// stops the orders poll for that instance, and only a 404 from beans-info
// switches bean details off. The suites drive a real happy-dom element and
// node:test's fake timers, like test/ready-by.test.js does for #214.
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

// Machine on and idle: the render arms the uptime ticker.
function onHass(fetchWithAuth) {
  return {
    language: 'en',
    callService: () => {},
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
      'select.gaggiuino_local_profiler_profile': { state: 'Espresso', attributes: { options: ['Espresso'] } },
    },
    ...(fetchWithAuth ? { fetchWithAuth } : {}),
  };
}

// Machine off with nothing scheduled: the render shows the ready-by picker and
// arms the ready-by ticker.
function offHass(fetchWithAuth) {
  return {
    language: 'en',
    callService: () => {},
    states: {
      'switch.gaggiuino': { state: 'off' },
      [`${P}machine_status`]: { state: 'offline', attributes: {} },
      [`${P}preheat_elapsed`]: { state: '0' },
    },
    ...(fetchWithAuth ? { fetchWithAuth } : {}),
  };
}

// Records every path the card requests and answers from a fixed handler.
function recordingFetch(handler) {
  const paths = [];
  const fetchWithAuth = async (path, init) => {
    paths.push(path);
    return handler(path, init);
  };
  fetchWithAuth.paths = paths;
  fetchWithAuth.ordersCalls = () => paths.filter(p => p === '/api/glp/orders').length;
  return fetchWithAuth;
}

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
const statusOnly = (status) => ({ ok: false, status, json: async () => ({}) });

function makeCard(hass) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  if (hass) card._hass = hass;
  return card;
}

// Lets every already-resolved fetch promise chain settle.
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

const OWNED_TIMERS = [
  '_uptimeTimer', '_ordersPoll', '_ordersRetry',
  '_readyByTimer', '_pendingProfileTimer', '_pendingReadyByTimer',
];

function assertNoTimers(card, why) {
  for (const key of OWNED_TIMERS) {
    assert.equal(card[key], null, `${key} must be cleared ${why}`);
  }
}

// ── removal clears every timer ─────────────────────────────────────────────

test('a removed card clears every timer it owns and stops requesting (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const fetchWithAuth = recordingFetch(() => okJson([]));

  // Machine on: the render arms the uptime ticker.
  const running = makeCard();
  window.document.body.appendChild(running);
  running.hass = onHass(fetchWithAuth);
  await flush();
  assert.ok(running._ordersPoll, 'the attached card polls orders');
  assert.ok(running._uptimeTimer, 'the attached card runs its uptime ticker');
  running.remove();
  await flush();
  assertNoTimers(running, 'after the machine-on card is removed from the DOM');

  // Machine off: the render arms the ready-by ticker and the ready-by picker.
  const card = makeCard();
  window.document.body.appendChild(card);
  card.hass = offHass(fetchWithAuth);
  await flush();
  assert.ok(card._ordersPoll, 'the attached card polls orders');
  assert.ok(card._readyByTimer, 'the attached card runs its ready-by ticker');
  assert.equal(fetchWithAuth.ordersCalls(), 2, 'each attached card fetches orders once');

  // Arm the two pending-confirmation timers the card keeps for optimistic UI.
  card.shadowRoot.getElementById('glp-readyby-input').value = '07:30';
  card.shadowRoot.querySelector('[data-action="set-ready-by"]')
    .dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true, composed: true }));
  assert.ok(card._pendingReadyByTimer, 'the Set arms its fallback timer');
  card._selectProfile('Espresso');
  assert.ok(card._pendingProfileTimer, 'picking a profile arms its fallback timer');

  const callsBeforeRemoval = fetchWithAuth.paths.length;
  card.remove();
  await flush();
  assertNoTimers(card, 'after the card is removed from the DOM');

  // Nothing the card owns may fire again, however far the clock advances.
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(fetchWithAuth.paths.length, callsBeforeRemoval, 'a removed card sends no further request');
});

test('a removed card clears the orders retry it armed before the proxy was ready (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const card = makeCard();

  window.document.body.appendChild(card);
  card.hass = offHass();                    // no fetchWithAuth yet
  assert.ok(card._ordersRetry, 'a card without the proxy schedules a retry');

  card.remove();
  await flush();
  assertNoTimers(card, 'after removal');

  t.mock.timers.tick(10000);
  await flush();
  assert.equal(card._ordersPoll, null, 'the retry does not restart the poll on a removed card');
});

// ── a late hass push must not restart the poll ─────────────────────────────

test('a hass push to a detached card starts no poll (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const fetchWithAuth = recordingFetch(() => okJson([]));
  const card = makeCard();

  card.hass = offHass(fetchWithAuth);
  await flush();
  assertNoTimers(card, 'while the card is not in the DOM');

  t.mock.timers.tick(5000);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), 0, 'a detached card asks for no orders');
});

// ── re-attaching restarts the poll ─────────────────────────────────────────

test('re-attaching the card restarts the orders poll (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const fetchWithAuth = recordingFetch(() => okJson([]));
  const card = makeCard();

  window.document.body.appendChild(card);
  card.hass = offHass(fetchWithAuth);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), 1);

  card.remove();
  await flush();
  assert.equal(card._ordersPoll, null);

  window.document.body.appendChild(card);   // dashboard edit mode, view switch
  await flush();
  assert.ok(card._ordersPoll, 'the re-attached card polls again');
  assert.equal(fetchWithAuth.ordersCalls(), 2, 'and fetches once on re-attach');

  // The interval is live again, not just an immediate fetch.
  t.mock.timers.tick(6000);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), 3);

  card.remove();
  await flush();
  assertNoTimers(card, 'after the second removal');
});

// ── orders 404 means the feature is off ────────────────────────────────────

test('a 404 from the orders endpoint stops the poll for this card (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const fetchWithAuth = recordingFetch((path) =>
    path === '/api/glp/orders' ? statusOnly(404) : okJson([]));
  const card = makeCard();

  window.document.body.appendChild(card);
  card.hass = offHass(fetchWithAuth);
  await flush();

  assert.equal(fetchWithAuth.ordersCalls(), 1);
  assert.equal(card._ordersPoll, null, 'the interval is stopped on 404');

  t.mock.timers.tick(60000);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), 1, 'no further orders requests are made');

  // Re-attaching must not resurrect a feature the app switched off.
  card.remove();
  window.document.body.appendChild(card);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), 1, 'the off switch survives a re-attach');

  card.remove();
});

test('a 503 from the orders endpoint keeps the poll running (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const fetchWithAuth = recordingFetch((path) =>
    path === '/api/glp/orders' ? statusOnly(503) : okJson([]));
  const card = makeCard();

  window.document.body.appendChild(card);
  card.hass = offHass(fetchWithAuth);
  await flush();
  assert.ok(card._ordersPoll, 'a transient error does not stop the poll');

  t.mock.timers.tick(6000);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), 2, 'the next tick polls again');

  card.remove();
});

// ── beans info: only a 404 disables it ─────────────────────────────────────

test('a 503 from beans-info keeps bean details available, and a later 200 loads them (#270)', async (t) => {
  // Only Date is faked, so the cache window can be crossed without waiting
  // for it; `now` keeps Date.now() away from 0, which the cache check reads
  // as "never loaded".
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let attempts = 0;
  const fetchWithAuth = recordingFetch(() => {
    attempts += 1;
    return attempts === 1
      ? statusOnly(503)
      : okJson([{ id: 7, name: 'Kenya Nyeri', variety: 'SL28', roastDate: null }]);
  });
  const card = makeCard(offHass(fetchWithAuth));

  await card._loadBeansInfo();
  assert.equal(card._beansInfoUnavailable, false, 'a transient error must not switch bean info off');
  assert.equal(card._beansInfo, null);

  // Once the cache window has passed the next attempt runs again and fills
  // both lookups — the card is not left without bean details.
  t.mock.timers.tick(300001);
  await card._loadBeansInfo();

  assert.equal(card._beansInfoUnavailable, false);
  assert.equal(card._beansInfoById.get(7).name, 'Kenya Nyeri');
  assert.equal(card._beansInfo.get('kenya nyeri').variety, 'SL28');
  assert.equal(fetchWithAuth.paths.filter(p => p === '/api/glp/library/beans-info').length, 2);
});

test('a 404 from beans-info disables the feature for this card (#270)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const fetchWithAuth = recordingFetch(() => statusOnly(404));
  const card = makeCard(offHass(fetchWithAuth));

  await card._loadBeansInfo();
  assert.equal(card._beansInfoUnavailable, true, 'a 404 means the proxy or app is too old');

  // Disabled means no further requests, even after the cache window.
  t.mock.timers.tick(300001);
  await card._loadBeansInfo();
  assert.equal(fetchWithAuth.paths.filter(p => p === '/api/glp/library/beans-info').length, 1);
});
