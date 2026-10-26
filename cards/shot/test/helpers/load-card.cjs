// Shared test loader for the card source (#180). The card ships as a classic
// script bundled into a single IIFE, so its class and top-level helpers are not
// reachable from the page; the tests instead import them straight from
// src/glp-card.ts, which Node loads via native type stripping. The module is
// evaluated once per test process, so every test file calls loadCard() once.
// `expose` adds named module exports to the result; `context` overrides the
// browser globals below (the DOM suites pass a happy-dom document).
// test/deferred-define.test.js keeps its own loader: it must replace the
// registry the card reads at load time, which this direct import cannot do.
'use strict';

function loadCard({ expose = [], context = {} } = {}) {
  const stubs = {
    HTMLElement: class HTMLElement {},
    customElements: { define() {}, get() {}, whenDefined() { return new Promise(() => {}); } },
    window: {},
    navigator: { language: 'en-US' },
    // Lit's runtime calls document.createTreeWalker while it is imported; the
    // DOM-rendering suites override this with a real happy-dom document.
    document: { createTreeWalker() { return {}; } },
    // A DOM suite dispatches the card's Home Assistant events on happy-dom
    // elements, and happy-dom rejects an Event built by another realm
    // ("parameter 1 is not of type 'Event'"). The card constructs its events
    // with the global CustomEvent, so point that at the suite's own window.
    ...(context.window && context.window.CustomEvent ? { CustomEvent: context.window.CustomEvent } : {}),
    ...context,
  };
  // defineProperty, not assignment: Node already defines some of these (e.g.
  // `navigator`) as getter-only globals, so a plain `globalThis.navigator = ...`
  // would throw.
  for (const [name, value] of Object.entries(stubs)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }

  const mod = require('../../src/glp-card.ts');
  const result = { GlpCard: mod.GlpCard };
  for (const name of expose) result[name] = mod[name];
  return result;
}

module.exports = { loadCard };
