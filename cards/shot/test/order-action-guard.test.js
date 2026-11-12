// #391: a quick double tap on an order button posted the action twice, and
// bean details only appeared with the next state push. This suite drives the
// real _orderAction()/_loadBeansInfo() in a happy-dom window (same setup as
// test/sheet-orders.test.js) and counts requests, toasts and renders. Uses the
// shared loader from test/helpers/load-card.cjs, unchanged, as cards/CLAUDE.md
// asks every DOM suite in this folder to do.
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

const BEANS = [{ id: 7, name: 'Kenya Nyeri', variety: 'SL28', roastDate: '2026-10-20' }];

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

// Records every request: an order POST answers ok, the orders list stays
// empty and the bean library answers BEANS.
function recordingFetch() {
  const calls = [];
  const fetchWithAuth = async (path, init) => {
    calls.push({ path, init });
    if (path === '/api/glp/library/beans-info') return okJson(BEANS);
    if (path === '/api/glp/orders') return okJson([]);
    return okJson({});
  };
  fetchWithAuth.calls = calls;
  fetchWithAuth.posts = () => calls.filter(c => c.init && c.init.method === 'POST');
  return fetchWithAuth;
}

function makeCard(fetchWithAuth) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._hass = {
    language: 'en',
    fetchWithAuth,
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
    },
  };
  // Renders would arm the poll/ticker intervals that keep node --test alive.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  return card;
}

// Home Assistant events the card fires on itself (bubbling and composed).
function collectToasts(card) {
  const seen = [];
  card.addEventListener('hass-notification', (e) => seen.push(e.detail.message));
  return seen;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ── one tap, one action ────────────────────────────────────────────────────

test('a second _orderAction while the first is in flight sends nothing (#391)', async () => {
  const fetchWithAuth = recordingFetch();
  const card = makeCard(fetchWithAuth);
  const seen = collectToasts(card);

  // Both calls start before the first one awaits anything: the guard has to
  // drop the second even though the first has not settled yet.
  const first = card._orderAction('o1', 'accept', { eta: 5 });
  const second = card._orderAction('o1', 'accept', { eta: 5 });
  await Promise.all([first, second, flush()]);

  assert.equal(fetchWithAuth.posts().length, 1, 'the double tap posts the action once');
  assert.deepEqual(seen, ['Order accepted · ready in 5 min'], 'and confirms it once');
});

test('the guard is released after the refetch, so the next action still goes out (#391)', async () => {
  const fetchWithAuth = recordingFetch();
  const card = makeCard(fetchWithAuth);

  await card._orderAction('o1', 'accept', { eta: 5 });
  await card._orderAction('o2', 'complete', {});

  assert.equal(fetchWithAuth.posts().length, 2, 'each tap sends its own action');
});

// ── bean details appear without waiting for the next state push ────────────

test('a successful _loadBeansInfo renders the card right away (#391)', async () => {
  const fetchWithAuth = recordingFetch();
  const card = makeCard(fetchWithAuth);
  let renders = 0;
  const real = card._render.bind(card);
  card._render = () => { renders += 1; real(); };
  card._beansInfoAt = 0;

  await card._loadBeansInfo();
  await flush();

  assert.equal(card._beansInfoById.get(7).name, 'Kenya Nyeri');
  assert.equal(renders, 1, 'the shot on screen picks up the bean details at once');
});
