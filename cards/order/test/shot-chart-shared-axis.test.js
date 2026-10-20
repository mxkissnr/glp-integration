// Proves _shotChart() normalizes series onto SHARED axis scales rather than
// each series independently over its own min/max. Before this fix, a nearly
// flat temperature curve (e.g. 93.0-93.4°C, typical for a real shot) got
// stretched to fill the full chart height exactly like the pressure curve
// (0-9 bar), making the curves' relative shapes meaningless when overlaid.
// Loads the real glp-order-card.js through the shared test/helpers/load-card.cjs
// harness and calls the real _shotChart() — it doesn't use `this` internally,
// so it's called detached off the prototype.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

class HTMLElement {
  attachShadow() { this.shadowRoot = {}; return this.shadowRoot; }
}

const registry = { 'home-assistant': class extends HTMLElement {} };
const { GlpOrderCard } = loadCard({
  context: {
    HTMLElement,
    // Lit calls document.createTreeWalker while it is imported; required by Lit
    // itself, not a missing-package shim. Nothing renders here.
    document: { createElement() { return {}; }, createTreeWalker() { return {}; } },
    customElements: { define(tag, cls) { registry[tag] = cls; }, get(tag) { return registry[tag]; }, whenDefined(tag) { return Promise.resolve(registry[tag]); } },
  },
});

const shotChart = shot => GlpOrderCard.prototype._shotChart.call(null, shot);

// Values are stored *10 (matches the app's datapoint format; _shotChart
// divides by scale=10). 20 samples each.
function makeDp() {
  const n = 20;
  const pressure    = Array.from({ length: n }, (_, i) => Math.round((i / (n - 1)) * 90));       // 0 -> 9.0 bar
  const temperature = Array.from({ length: n }, (_, i) => 930 + Math.round((i / (n - 1)) * 4));   // 93.0 -> 93.4 °C, nearly flat
  const weightFlow  = Array.from({ length: n }, () => 15);                                       // flat 1.5 ml/s
  const shotWeight  = Array.from({ length: n }, (_, i) => Math.round((i / (n - 1)) * 360));       // 0 -> 36.0 g
  return { pressure, temperature, weightFlow, shotWeight };
}

function yRangeFor(svgAndLegend, seriesIndex) {
  const polylines = [...svgAndLegend.matchAll(/<polyline points="([^"]+)"/g)];
  assert.ok(polylines.length > seriesIndex, `expected at least ${seriesIndex + 1} polylines, got ${polylines.length}`);
  const points = polylines[seriesIndex][1].trim().split(/\s+/).map(p => parseFloat(p.split(',')[1]));
  return Math.max(...points) - Math.min(...points);
}

test('_shotChart() keeps a nearly-flat temperature curve nearly flat (shared axis, not its own min/max)', () => {
  const out = shotChart({ datapoints: makeDp() });
  assert.ok(out, 'expected chart output for a shot with datapoints');
  // series order in _shotChart(): pressure, temperature, weightFlow, shotWeight
  const tempRange = yRangeFor(out, 1);
  // Real range is 0.4°C against a shared axis with a floor of 110 (H-2*pad=68px
  // drawable height) -> expected pixel range ~ (0.4/110)*68 ≈ 0.25px. The old
  // per-series-normalized bug would have stretched this to ~68px (the full
  // drawable height, same as the pressure line) — assert it's nowhere close.
  assert.ok(tempRange < 3, `temperature curve should render nearly flat on the shared axis, got a ${tempRange.toFixed(2)}px y-range`);
});

test('_shotChart() still lets a genuinely wide-swinging series (pressure) use most of the chart height', () => {
  const out = shotChart({ datapoints: makeDp() });
  const pressureRange = yRangeFor(out, 0);
  // 0 -> 9 bar against the fixed 0-12 bar left axis -> (9/12)*68 ≈ 51px.
  assert.ok(pressureRange > 30, `pressure curve should still span most of the chart height, got a ${pressureRange.toFixed(2)}px y-range`);
});

test('_shotChart() returns empty string when the shot has no datapoints', () => {
  assert.equal(shotChart({}), '');
  assert.equal(shotChart(null), '');
});
