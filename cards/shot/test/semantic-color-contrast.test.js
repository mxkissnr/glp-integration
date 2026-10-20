// Proves _applySemanticColorContrast() actually RUNS and picks the correct
// --glp-ok/--glp-warn/--glp-err (by --glp-bg luminance) and --glp-accent-text
// (by the DARKER of --glp-accent-start/--glp-accent-end's luminance,
// independently — #87's per-machine gradient theme) — not just that the
// method exists. Card loaded via the shared test helper
// (test/helpers/load-card.cjs), which evaluates the real glp-card.js; the
// helper's `context` option supplies this suite's extra document/
// getComputedStyle stubs, and makeInstance() adds a minimal style/shadowRoot
// stub sufficient to drive the method end-to-end without a full custom-
// element/shadow-DOM constructor. Real color normalization (hex/named-color
// -> rgb()) is exactly what the browser's engine does and is NOT
// re-implemented here — that layer is covered by scripts/screenshot.mts's
// real Playwright renders instead; this test only proves the
// luminance-decision logic itself fires.
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
  };
}

const fakeDocument = {
  createElement() { return { style: makeStyleStub(), remove() {} }; },
  // Lit calls document.createTreeWalker while it is imported. This stub is
  // required by Lit itself, not a missing-package shim; this test never calls
  // render(), so the rest of the DOM surface is not needed.
  createTreeWalker() { return {}; },
};
const { GlpCard } = loadCard({
  context: {
    document: fakeDocument,
    getComputedStyle(el) { return el.style; },
  },
});

function makeInstance() {
  const inst = Object.create(GlpCard.prototype);
  inst.style = makeStyleStub();
  inst.shadowRoot = { appendChild() {} };
  return inst;
}

test('_applySemanticColorContrast() picks light-safe --glp-ok/--glp-warn/--glp-err for a white --glp-bg', () => {
  const inst = makeInstance();
  inst.style.setProperty('--glp-bg', 'rgb(255, 255, 255)');
  inst._applySemanticColorContrast();
  assert.equal(inst.style.getPropertyValue('--glp-ok'), '#15803d');
  assert.equal(inst.style.getPropertyValue('--glp-warn'), '#a16207');
  assert.equal(inst.style.getPropertyValue('--glp-err'), '#dc2626');
});

test('_applySemanticColorContrast() picks dark-safe --glp-ok/--glp-warn/--glp-err for a near-black --glp-bg', () => {
  const inst = makeInstance();
  inst.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  inst._applySemanticColorContrast();
  assert.equal(inst.style.getPropertyValue('--glp-ok'), '#22c55e');
  assert.equal(inst.style.getPropertyValue('--glp-warn'), '#eab308');
  assert.equal(inst.style.getPropertyValue('--glp-err'), '#ef4444');
});

test('_applySemanticColorContrast() picks dark --glp-accent-text for a light flat accent (amber)', () => {
  const inst = makeInstance();
  inst.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  // flat colour: start and end are the same, as GLP-TOKENS' default chain produces
  inst.style.setProperty('--glp-accent-start', 'rgb(245, 158, 11)'); // #f59e0b, GLP Dark's default primary
  inst.style.setProperty('--glp-accent-end', 'rgb(245, 158, 11)');
  inst._applySemanticColorContrast();
  assert.equal(inst.style.getPropertyValue('--glp-accent-text'), '#000');
});

test('_applySemanticColorContrast() picks light --glp-accent-text for a dark flat accent (indigo)', () => {
  const inst = makeInstance();
  inst.style.setProperty('--glp-bg', 'rgb(255, 255, 255)');
  inst.style.setProperty('--glp-accent-start', 'rgb(26, 35, 126)'); // #1a237e, Material Indigo 900 — a common dark theme primary
  inst.style.setProperty('--glp-accent-end', 'rgb(26, 35, 126)');
  inst._applySemanticColorContrast();
  assert.equal(inst.style.getPropertyValue('--glp-accent-text'), '#fff');
});

test('_applySemanticColorContrast() picks --glp-accent-text off the DARKER gradient stop, whichever side it is', () => {
  // "Copper Cortado" preset (#87): a light start (#c2703d, luminance ~.12,
  // dark-safe) paired with a much lighter end (#e8b4a0, luminance ~.47,
  // light-safe) — the light end alone would wrongly pick white text.
  const inst = makeInstance();
  inst.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  inst.style.setProperty('--glp-accent-start', 'rgb(194, 112, 61)');  // #c2703d
  inst.style.setProperty('--glp-accent-end', 'rgb(232, 180, 160)');   // #e8b4a0
  inst._applySemanticColorContrast();
  assert.equal(inst.style.getPropertyValue('--glp-accent-text'), '#000');

  // Same pair, reversed which stop is "start" vs "end" — still the darker wins.
  const inst2 = makeInstance();
  inst2.style.setProperty('--glp-bg', 'rgb(24, 24, 27)');
  inst2.style.setProperty('--glp-accent-start', 'rgb(232, 180, 160)'); // #e8b4a0
  inst2.style.setProperty('--glp-accent-end', 'rgb(194, 112, 61)');    // #c2703d
  inst2._applySemanticColorContrast();
  assert.equal(inst2.style.getPropertyValue('--glp-accent-text'), '#000');
});

test('_applySemanticColorContrast() is a no-op (does not throw) when --glp-bg/--glp-accent-start/-end are unset', () => {
  const inst = makeInstance();
  assert.doesNotThrow(() => inst._applySemanticColorContrast());
  assert.equal(inst.style.getPropertyValue('--glp-ok'), '');
  assert.equal(inst.style.getPropertyValue('--glp-accent-text'), '');
});
