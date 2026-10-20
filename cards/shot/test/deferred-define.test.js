// Regression test for #184: glp-card must defer its custom-element
// registration until Home Assistant's frontend is up, and must read the
// global `customElements` at that moment instead of the one it saw at load
// time. HA's app.js installs the @webcomponents/scoped-custom-element-registry
// polyfill, which replaces window.customElements with a shim that only sees
// definitions made after it was installed; a card injected via
// add_extra_js_url that loads before app.js would otherwise define itself in
// the native registry the shim can't see, so Lovelace shows "Custom element
// doesn't exist: glp-card".
//
// Loads the real, unmodified glp-card.js into a vm context backed by a fake
// registry, then swaps the registry mid-flight to reproduce that cold-load
// sequence.
//
// Intentionally NOT migrated to test/helpers/load-card.cjs (#180, slice 1b):
// that helper patches the card's custom-element registration call and stubs
// the registry, whereas this suite must drive the real, unpatched define()
// through its own swappable fake registry — so it keeps a local loader by
// design.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WWW_BUNDLE = path.join(__dirname, '..', '..', '..', 'custom_components', 'gaggiuino_profiler', 'www', 'glp-card.js');
const SRC = fs.readFileSync(WWW_BUNDLE, 'utf8');

function makeRegistry() {
  const defined = new Map();
  const pending = new Map();
  const defineCalls = [];
  return {
    defineCalls,
    define(name, ctor) {
      defined.set(name, ctor);
      defineCalls.push(name);
      const resolvers = pending.get(name);
      if (resolvers) {
        pending.delete(name);
        for (const resolve of resolvers) resolve(ctor);
      }
    },
    get(name) { return defined.get(name); },
    whenDefined(name) {
      if (defined.has(name)) return Promise.resolve(defined.get(name));
      return new Promise(resolve => {
        const resolvers = pending.get(name) || [];
        resolvers.push(resolve);
        pending.set(name, resolvers);
      });
    },
  };
}

function loadCard(customElements) {
  class HTMLElement {}
  const context = {
    HTMLElement,
    customElements,
    window: {},
    // The bundle now inlines Lit's runtime, which calls
    // document.createTreeWalker while its module graph loads. This stub is
    // required by Lit itself, not a missing-package shim; no render runs here.
    document: { createTreeWalker() { return {}; } },
    console: { info() {} },
    URL,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(SRC, context, { filename: WWW_BUNDLE });
  return context;
}

test('the card does not define itself while HA is not up yet', () => {
  const registryA = makeRegistry();
  const context = loadCard(registryA);

  assert.equal(registryA.get('glp-card'), undefined,
    'glp-card must not be defined before HA is available');
  assert.ok(!registryA.defineCalls.includes('glp-card'),
    'the card registered too early, in the registry the polyfill will discard');
  assert.equal(context.window.customCards.length, 1);
  assert.equal(context.window.customCards[0].type, 'glp-card');
});

test('a card that loads first still defines into the registry the polyfill swapped in', async () => {
  const registryA = makeRegistry();
  const context = loadCard(registryA);

  // HA's app.js installs the scoped-registry shim, replacing the global the
  // card called whenDefined() on.
  const registryB = makeRegistry();
  context.customElements = registryB;

  registryB.define('home-assistant', class {});
  registryA.define('home-assistant', class {}); // resolves A's pending whenDefined
  await new Promise(resolve => setImmediate(resolve));

  const card = registryB.get('glp-card');
  assert.equal(typeof card, 'function');
  assert.equal(card.name, 'GlpCard');
  assert.deepEqual(registryB.defineCalls, ['home-assistant', 'glp-card']);
  assert.ok(!registryA.defineCalls.includes('glp-card'),
    'the deferred define must land in the live global, not the stale one');
});

test('a card that loads after HA defines synchronously and is idempotent', () => {
  const registry = makeRegistry();
  registry.define('home-assistant', class {});

  loadCard(registry);
  assert.equal(registry.get('glp-card').name, 'GlpCard');
  assert.deepEqual(registry.defineCalls, ['home-assistant', 'glp-card']);

  // A re-injected script must not throw on a duplicate define — the
  // `customElements.get(...) ||` guard short-circuits the second one.
  assert.doesNotThrow(() => loadCard(registry));
  assert.deepEqual(registry.defineCalls, ['home-assistant', 'glp-card']);
});
