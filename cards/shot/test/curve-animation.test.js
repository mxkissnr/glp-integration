// Guided metric line + curve draw-in animation gating (#120). Card loaded via
// the shared test helper (test/helpers/load-card.cjs), which evaluates the real
// glp-card.js in a vm sandbox and exposes the shipped function/prototype-method
// declarations (metricLineHtml, GlpCard) directly, without a real shadow
// DOM/customElements.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpCard, metricLineHtml } = loadCard({ expose: ['metricLineHtml'] });

function makeInstance() {
  return Object.create(GlpCard.prototype);
}

// ── _shotChartKeyChanged() — gates the shot-load curve draw-in so it plays
// once per actual shot change, not on every incidental re-render an hass
// push triggers while looking at the same shot (same problem the nav-dot
// "changed" tracking solves for the dots — see ready-by.test.js for that
// precedent). ─────────────────────────────────────────────────────────────

test('_shotChartKeyChanged() is true on first load (prevKey null, a shot is showing)', () => {
  const inst = makeInstance();
  assert.equal(inst._shotChartKeyChanged(null, 'shot-1'), true);
});

test('_shotChartKeyChanged() is true when the displayed shot id changes', () => {
  const inst = makeInstance();
  assert.equal(inst._shotChartKeyChanged('shot-1', 'shot-2'), true);
});

test('_shotChartKeyChanged() is false when the key is unchanged (incidental re-render)', () => {
  const inst = makeInstance();
  assert.equal(inst._shotChartKeyChanged('shot-1', 'shot-1'), false);
});

test('_shotChartKeyChanged() is false when nothing is showing (currentKey null)', () => {
  const inst = makeInstance();
  assert.equal(inst._shotChartKeyChanged('shot-1', null), false);
  assert.equal(inst._shotChartKeyChanged(null, null), false);
});

// ── metricLineHtml() — the guided metric line that replaced the two
// separate three-tile box rows (.metric-trio / .live-stats). ──────────────

test('metricLineHtml() returns empty string for no items', () => {
  assert.equal(metricLineHtml([]), '');
  assert.equal(metricLineHtml([null, null]), '');
});

test('metricLineHtml() renders one .metric-item per non-null entry, tagged with its role', () => {
  const html = metricLineHtml([
    { role: 'recipe', num: '1:2', unit: '', label: 'Ratio' },
    null,
    { role: 'result', num: '18.4', unit: 'g', label: 'Yield' },
  ]);
  const itemCount = (html.match(/class="metric-item /g) || []).length;
  assert.equal(itemCount, 2);
  assert.ok(html.includes('role-recipe'));
  assert.ok(html.includes('role-result'));
  assert.ok(!html.includes('role-process'));
});

test('metricLineHtml() escapes num/label — no unescaped markup from item content', () => {
  const html = metricLineHtml([
    { role: 'process', num: '<script>1</script>', unit: '', label: '<img src=x onerror=alert(1)>' },
  ]);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('metricLineHtml() only renders a unit span when unit is non-empty', () => {
  const withUnit = metricLineHtml([{ role: 'process', num: '5', unit: 's', label: 'Duration' }]);
  const withoutUnit = metricLineHtml([{ role: 'recipe', num: '1:2', unit: '', label: 'Ratio' }]);
  assert.ok(withUnit.includes('class="unit"'));
  assert.ok(!withoutUnit.includes('class="unit"'));
});
