// Proves _applySemanticColorContrast() actually RUNS and picks the correct
// --glp-ok/--glp-warn/--glp-err (by --glp-bg luminance) and --glp-accent-text
// (by the DARKER of --glp-accent-start/--glp-accent-end's luminance,
// independently — see #62's machine colour theme) — not just that the
// method exists. Loads the real glp-order-card.js through the shared
// test/helpers/load-card.cjs harness with a minimal fake DOM (style objects
// backed by a plain Map, no real CSS engine) sufficient to drive the method
// end-to-end:
// getComputedStyle(this).getPropertyValue('--glp-bg') reads back a
// pre-seeded value simulating what the real CSS cascade would have resolved,
// and the method's own this.style.setProperty(...) calls are inspected
// afterward. Real color normalization (hex/named-color -> rgb()) is exactly
// what the browser's engine does and is NOT re-implemented here — that layer
// is covered by scripts/screenshot.mts's real Playwright renders instead;
// this test only proves the luminance-decision logic itself fires correctly.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

function makeStyleStub() {
  const props = new Map();
  return {
    cssText: '',
    get color() { return props.get('color') || ''; },
    set color(v) { props.set('color', v); },
    setProperty(name, value) { props.set(name, value); },
    getPropertyValue(name) { return props.get(name) || ''; },
    _props: props,
  };
}

class HTMLElement {
  constructor() { this.style = makeStyleStub(); }
  attachShadow() {
    this.shadowRoot = {
      appendChild() {},
      innerHTML: '',
      getElementById() { return null; },
      querySelectorAll() { return []; },
    };
    return this.shadowRoot;
  }
}

const fakeDocument = {
  createElement() { return { style: makeStyleStub(), remove() {} }; },
  // Lit calls document.createTreeWalker while it is imported. This stub is
  // required by Lit itself, not a missing-package shim; this test never calls
  // render(), so the rest of the DOM surface is not needed.
  createTreeWalker() { return {}; },
};

// loadCard() installs the stubs above as globals, imports the card module and
// returns its real `class GlpOrderCard` export, so it can be reused as-is. The
// registry-capturing customElements stub is kept so define() still sees the
// real class.
const registry = { 'home-assistant': class extends HTMLElement {} };
const { GlpOrderCard } = loadCard({
  context: {
    HTMLElement,
    document: fakeDocument,
    getComputedStyle(el) { return el.style; },
    customElements: { define(tag, cls) { registry[tag] = cls; }, get(tag) { return registry[tag]; }, whenDefined(tag) { return Promise.resolve(registry[tag]); } },
  },
});

test('_applySemanticColorContrast() picks the light-safe constants for a white --glp-bg', () => {
  const card = new GlpOrderCard();
  card.style.setProperty('--glp-bg', 'rgb(255, 255, 255)');
  card._applySemanticColorContrast();
  assert.equal(card.style.getPropertyValue('--glp-ok'), '#15803d');
  assert.equal(card.style.getPropertyValue('--glp-warn'), '#a16207');
  assert.equal(card.style.getPropertyValue('--glp-err'), '#dc2626');
});

test('_applySemanticColorContrast() picks the dark-safe constants for a near-black --glp-bg', () => {
  const card = new GlpOrderCard();
  card.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  card._applySemanticColorContrast();
  assert.equal(card.style.getPropertyValue('--glp-ok'), '#22c55e');
  assert.equal(card.style.getPropertyValue('--glp-warn'), '#eab308');
  assert.equal(card.style.getPropertyValue('--glp-err'), '#ef4444');
});

test('_applySemanticColorContrast() picks dark --glp-accent-text for a flat light accent (amber)', () => {
  const card = new GlpOrderCard();
  card.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  // Flat theme: start === end, #f59e0b GLP Dark's default primary
  card.style.setProperty('--glp-accent-start', 'rgb(245, 158, 11)');
  card.style.setProperty('--glp-accent-end', 'rgb(245, 158, 11)');
  card._applySemanticColorContrast();
  assert.equal(card.style.getPropertyValue('--glp-accent-text'), '#000');
});

test('_applySemanticColorContrast() picks light --glp-accent-text for a flat dark accent (indigo) — the .order-btn bug', () => {
  const card = new GlpOrderCard();
  card.style.setProperty('--glp-bg', 'rgb(255, 255, 255)');
  // Flat theme: start === end, #1a237e Material Indigo 900 — a common dark theme primary
  card.style.setProperty('--glp-accent-start', 'rgb(26, 35, 126)');
  card.style.setProperty('--glp-accent-end', 'rgb(26, 35, 126)');
  card._applySemanticColorContrast();
  assert.equal(card.style.getPropertyValue('--glp-accent-text'), '#fff');
});

test('_applySemanticColorContrast() picks --glp-accent-text for the DARKER of the two gradient stops (worst case)', () => {
  const card = new GlpOrderCard();
  card.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  // Gradient theme: light amber start, dark indigo end — .order-btn's fill
  // sweeps across both, so text must stay readable against the indigo end,
  // not just default to the (readable-for-black-text) amber start.
  card.style.setProperty('--glp-accent-start', 'rgb(245, 158, 11)');
  card.style.setProperty('--glp-accent-end', 'rgb(26, 35, 126)');
  card._applySemanticColorContrast();
  assert.equal(card.style.getPropertyValue('--glp-accent-text'), '#fff');
});

test('_applySemanticColorContrast() is a no-op (does not throw) when --glp-bg/--glp-accent-start/--glp-accent-end are unset', () => {
  const card = new GlpOrderCard();
  assert.doesNotThrow(() => card._applySemanticColorContrast());
  assert.equal(card.style.getPropertyValue('--glp-ok'), '');
  assert.equal(card.style.getPropertyValue('--glp-accent-text'), '');
});
