// Direct-URL mode must never ask the app for its API token (#276). The app
// serves /api/token to Supervisor-originating requests, so a browser on the
// LAN only ever got a 401 back; direct-URL mode now relies on the YAML
// `glp_token` alone. Loads the real class from src/ through the shared
// harness, records every fetch() call and checks none of them touch
// /api/token. Zero-config mode (the HA integration proxy) stays untouched.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpOrderCard } = loadCard();

const DIRECT_URL = 'http://192.168.1.50:8099';

// Replaces the global fetch for one test and records the requested URLs.
function withFetchRecorder(t) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = (url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

function makeCard({ glpUrl = DIRECT_URL, token = null, hass = null } = {}) {
  const card = Object.create(GlpOrderCard.prototype);
  card._config = glpUrl ? { glp_url: glpUrl } : {};
  card._token = token;
  card._hass = hass;
  return card;
}

test('direct-URL mode without glp_token never requests /api/token', async (t) => {
  const calls = withFetchRecorder(t);
  const card = makeCard();

  await card._fetch('api/orders/menu');

  assert.ok(calls.every((url) => !url.endsWith('/api/token')), `unexpected token fetch: ${calls.join(', ')}`);
  assert.deepEqual(calls, [`${DIRECT_URL}/api/orders/menu`]);
});

test('repeated direct-URL requests still never request /api/token', async (t) => {
  const calls = withFetchRecorder(t);
  const card = makeCard();

  await card._fetch('api/orders/menu');
  await card._fetch('api/orders/settings');
  await card._fetch('api/orders/queue-eta');

  assert.equal(calls.filter((url) => url.endsWith('/api/token')).length, 0, `unexpected token fetch: ${calls.join(', ')}`);
  assert.equal(calls.length, 3);
});

test('a configured glp_token is sent as X-GLP-Token, still without /api/token', async (t) => {
  const calls = withFetchRecorder(t);
  const seen = [];
  globalThis.fetch = (url, opts) => {
    calls.push(String(url));
    seen.push(opts);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  };
  const card = makeCard({ token: 'secret-token' });

  await card._fetch('api/orders/menu');

  assert.deepEqual(calls, [`${DIRECT_URL}/api/orders/menu`]);
  assert.equal(seen[0].headers['X-GLP-Token'], 'secret-token');
});

test('zero-config mode keeps using the integration proxy via fetchWithAuth', async (t) => {
  const calls = withFetchRecorder(t);
  const proxied = [];
  const card = makeCard({
    glpUrl: null,
    hass: {
      fetchWithAuth: (path, opts) => {
        proxied.push([path, opts]);
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      },
    },
  });

  await card._fetch('api/orders/menu');

  assert.equal(calls.length, 0, `proxy mode must not call fetch() directly: ${calls.join(', ')}`);
  assert.deepEqual(proxied.map(([path]) => path), ['/api/glp/orders/menu']);
});
