// Machine colour theme config tests (#62). Loads the real glp-order-card.js
// through the shared test/helpers/load-card.cjs harness so _resolveTheme()/
// _applyThemeVars()/_machineGlyphHtml() can be exercised directly against the
// real, shipped code — not a re-implementation.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

function makeStyleStub() {
  const props = new Map();
  return {
    setProperty(name, value) { props.set(name, value); },
    getPropertyValue(name) { return props.get(name) || ''; },
    _props: props,
  };
}

const { GlpOrderCard } = loadCard();

// assert.deepEqual also compares prototypes, which trips on the freshly built
// {a,b} objects even when their shape matches — compare the fields individually
// instead.
function assertThemePair(actual, a, b) {
  assert.equal(actual?.a, a);
  assert.equal(actual?.b, b);
}

function makeInstance(config, hass) {
  const inst = Object.create(GlpOrderCard.prototype);
  inst._config = config;
  inst._instanceId = 1;
  inst._hass = hass;
  inst.style = makeStyleStub();
  return inst;
}

test('_resolveTheme() returns null when no theme/accent config is set', () => {
  const inst = makeInstance({});
  assert.equal(inst._resolveTheme(), null);
});

test('_resolveTheme() resolves a known preset key to its exact hex pair', () => {
  const inst = makeInstance({ theme: 'ember-espresso' });
  assertThemePair(inst._resolveTheme(), '#dc4a1f', '#f5a623');
});

test('_resolveTheme() returns null for an unknown preset key', () => {
  const inst = makeInstance({ theme: 'not-a-real-preset' });
  assert.equal(inst._resolveTheme(), null);
});

test('_resolveTheme() resolves accent_color to a flat a===b pair', () => {
  const inst = makeInstance({ accent_color: '#123abc' });
  assertThemePair(inst._resolveTheme(), '#123abc', '#123abc');
});

test('_resolveTheme() rejects an invalid accent_color and falls back (no theme configured)', () => {
  const inst = makeInstance({ accent_color: 'red' });
  assert.equal(inst._resolveTheme(), null);
});

test('_resolveTheme() rejects a CSS/markup-injection accent_color value', () => {
  const inst = makeInstance({ accent_color: '#fff"><script>alert(1)</script>' });
  assert.equal(inst._resolveTheme(), null);
});

test('_resolveTheme() resolves a valid accent_gradient two-stop array', () => {
  const inst = makeInstance({ accent_gradient: ['#111111', '#eeeeee'] });
  assertThemePair(inst._resolveTheme(), '#111111', '#eeeeee');
});

test('_resolveTheme() rejects an accent_gradient with one invalid stop', () => {
  const inst = makeInstance({ accent_gradient: ['#111111', 'not-a-hex'] });
  assert.equal(inst._resolveTheme(), null);
});

test('_resolveTheme() precedence: accent_gradient wins over accent_color and theme', () => {
  const inst = makeInstance({
    theme: 'ember-espresso',
    accent_color: '#000000',
    accent_gradient: ['#111111', '#eeeeee'],
  });
  assertThemePair(inst._resolveTheme(), '#111111', '#eeeeee');
});

test('_resolveTheme() precedence: accent_color wins over theme', () => {
  const inst = makeInstance({ theme: 'ember-espresso', accent_color: '#000000' });
  assertThemePair(inst._resolveTheme(), '#000000', '#000000');
});

test('_applyThemeVars() sets --glp-accent-start/--glp-accent-end to the resolved theme', () => {
  const inst = makeInstance({ theme: 'twilight-turkish' });
  inst._applyThemeVars();
  assert.equal(inst.style.getPropertyValue('--glp-accent-start'), '#0891b2');
  assert.equal(inst.style.getPropertyValue('--glp-accent-end'), '#4338ca');
});

test('_applyThemeVars() falls back to the --primary-color default when no theme is configured', () => {
  const inst = makeInstance({});
  inst._applyThemeVars();
  assert.equal(inst.style.getPropertyValue('--glp-accent-start'), 'var(--primary-color, #f59e0b)');
  assert.equal(inst.style.getPropertyValue('--glp-accent-end'), 'var(--primary-color, #f59e0b)');
});

// #701 — app-synced theme (via hass state) takes precedence over this
// card's own YAML config.
test('_appMachineTheme() returns null with no hass set (standalone/no-app-sync mode, unchanged pre-#701 behavior)', () => {
  assert.equal(makeInstance({})._appMachineTheme(), null);
});

test('_appMachineTheme() returns null when no *_machine_status entity carries a machines[] attribute', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: {} } } };
  assert.equal(makeInstance({}, hass)._appMachineTheme(), null);
});

test('_appMachineTheme() resolves the isDefault machine\'s theme when `machine` is not configured', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { preset: 'twilight-turkish' } },
    { id: 2, name: 'Kitchen GaggiMate', isDefault: false, theme: { preset: 'ember-espresso' } },
  ] } } } };
  assertThemePair(makeInstance({}, hass)._appMachineTheme(), '#0891b2', '#4338ca');
});

test('_appMachineTheme() resolves the machine matching `_config.machine` by name', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: null },
    { id: 2, name: 'Kitchen GaggiMate', isDefault: false, theme: { preset: 'ember-espresso' } },
  ] } } } };
  assertThemePair(makeInstance({ machine: 'Kitchen GaggiMate' }, hass)._appMachineTheme(), '#dc4a1f', '#f5a623');
});

test('_appMachineTheme() resolves a custom {a,b} theme', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { a: '#111111', b: '#222222' } },
  ] } } } };
  assertThemePair(makeInstance({}, hass)._appMachineTheme(), '#111111', '#222222');
});

test('_appMachineTheme() rejects a malformed custom theme from hass state', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { a: 'not-hex', b: '#222222' } },
  ] } } } };
  assert.equal(makeInstance({}, hass)._appMachineTheme(), null);
});

test('_resolveTheme(): the app-synced theme wins over this card\'s own YAML config', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { preset: 'twilight-turkish' } },
  ] } } } };
  const inst = makeInstance({ theme: 'ember-espresso' }, hass);
  assertThemePair(inst._resolveTheme(), '#0891b2', '#4338ca');
});

test('_resolveTheme(): falls back to YAML config when the app has no theme set for this machine', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: null },
  ] } } } };
  const inst = makeInstance({ theme: 'ember-espresso' }, hass);
  assertThemePair(inst._resolveTheme(), '#dc4a1f', '#f5a623');
});

test('_machineGlyphHtml() embeds a per-instance-unique gradient id and the given size class', () => {
  const inst = makeInstance({});
  const html = inst._machineGlyphHtml('header', 'hdr');
  assert.match(html, /class="machine-glyph header"/);
  assert.match(html, /id="glp-oc-icon-1-hdr"/);
  assert.match(html, /url\(#glp-oc-icon-1-hdr\)/);
});

test('_machineGlyphHtml() gives header and status usages distinct gradient ids on the same instance', () => {
  const inst = makeInstance({});
  const header = inst._machineGlyphHtml('header', 'hdr');
  const status = inst._machineGlyphHtml('status', 'stat');
  assert.notEqual(header.match(/id="([^"]+)"/)[1], status.match(/id="([^"]+)"/)[1]);
});
