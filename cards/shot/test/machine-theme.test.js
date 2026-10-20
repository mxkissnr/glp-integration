// Per-machine colour theme config tests (#87). Card loaded via the shared
// test helper (test/helpers/load-card.cjs), which evaluates the real
// glp-card.js and exposes GlpCard so _resolveMachineTheme()/
// _applyMachineTheme() can be exercised directly, without a full
// custom-element/shadow-DOM harness.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

function makeStyleStub() {
  const props = new Map();
  return {
    setProperty(name, value) { props.set(name, value); },
    removeProperty(name) { props.delete(name); },
    getPropertyValue(name) { return props.get(name) || ''; },
  };
}

const { GlpCard } = loadCard();

function makeInstance(config, hass) {
  const inst = Object.create(GlpCard.prototype);
  inst._config = config;
  inst._hass = hass;
  inst.style = makeStyleStub();
  return inst;
}

// THEME_PRESETS/the vm sandbox live in a separate realm from this test file,
// so a plain object literal here is never reference-equal to one returned
// from across the realm boundary (assert.deepEqual's prototype check fails
// even when the values match) — compare the two fields directly instead.
function assertTheme(result, a, b) {
  assert.equal(result.a, a);
  assert.equal(result.b, b);
}

test('_resolveMachineTheme() returns null when nothing is configured', () => {
  assert.equal(makeInstance({})._resolveMachineTheme(), null);
});

test('_resolveMachineTheme() resolves a valid `theme` preset key', () => {
  const inst = makeInstance({ theme: 'ember-espresso' });
  assertTheme(inst._resolveMachineTheme(), '#dc4a1f', '#f5a623');
});

test('_resolveMachineTheme() ignores an unknown `theme` key', () => {
  const inst = makeInstance({ theme: 'not-a-real-preset' });
  assert.equal(inst._resolveMachineTheme(), null);
});

test('_resolveMachineTheme() resolves `accent_color` to a flat a===b pair', () => {
  const inst = makeInstance({ accent_color: '#123abc' });
  assertTheme(inst._resolveMachineTheme(), '#123abc', '#123abc');
});

test('_resolveMachineTheme() rejects a non-hex `accent_color`', () => {
  assert.equal(makeInstance({ accent_color: 'red' })._resolveMachineTheme(), null);
  assert.equal(makeInstance({ accent_color: '<script>' })._resolveMachineTheme(), null);
  assert.equal(makeInstance({ accent_color: '#12345' })._resolveMachineTheme(), null);   // too short
  assert.equal(makeInstance({ accent_color: '#1234567' })._resolveMachineTheme(), null); // too long
});

test('_resolveMachineTheme() resolves a valid `accent_gradient` pair', () => {
  const inst = makeInstance({ accent_gradient: ['#0891b2', '#4338ca'] });
  assertTheme(inst._resolveMachineTheme(), '#0891b2', '#4338ca');
});

test('_resolveMachineTheme() rejects a malformed `accent_gradient`', () => {
  assert.equal(makeInstance({ accent_gradient: ['#0891b2'] })._resolveMachineTheme(), null);
  assert.equal(makeInstance({ accent_gradient: ['#0891b2', 'not-hex'] })._resolveMachineTheme(), null);
  assert.equal(makeInstance({ accent_gradient: 'not-an-array' })._resolveMachineTheme(), null);
});

test('_resolveMachineTheme() precedence: accent_gradient > accent_color > theme', () => {
  const inst = makeInstance({
    theme: 'ember-espresso',
    accent_color: '#111111',
    accent_gradient: ['#222222', '#333333'],
  });
  assertTheme(inst._resolveMachineTheme(), '#222222', '#333333');

  const inst2 = makeInstance({ theme: 'ember-espresso', accent_color: '#111111' });
  assertTheme(inst2._resolveMachineTheme(), '#111111', '#111111');
});

test('_applyMachineTheme() sets --glp-accent-start/-end inline when a theme resolves', () => {
  const inst = makeInstance({ theme: 'twilight-turkish' });
  inst._applyMachineTheme();
  assert.equal(inst.style.getPropertyValue('--glp-accent-start'), '#0891b2');
  assert.equal(inst.style.getPropertyValue('--glp-accent-end'), '#4338ca');
});

test('_applyMachineTheme() clears any previously-set inline override when no theme resolves', () => {
  const inst = makeInstance({});
  inst.style.setProperty('--glp-accent-start', '#ffffff');
  inst.style.setProperty('--glp-accent-end', '#000000');
  inst._applyMachineTheme();
  assert.equal(inst.style.getPropertyValue('--glp-accent-start'), '');
  assert.equal(inst.style.getPropertyValue('--glp-accent-end'), '');
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
  assertTheme(makeInstance({}, hass)._appMachineTheme(), '#0891b2', '#4338ca');
});

test('_appMachineTheme() resolves the machine matching `_config.machine` by name', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: null },
    { id: 2, name: 'Kitchen GaggiMate', isDefault: false, theme: { preset: 'ember-espresso' } },
  ] } } } };
  assertTheme(makeInstance({ machine: 'Kitchen GaggiMate' }, hass)._appMachineTheme(), '#dc4a1f', '#f5a623');
});

test('_appMachineTheme() resolves a custom {a,b} theme', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { a: '#111111', b: '#222222' } },
  ] } } } };
  assertTheme(makeInstance({}, hass)._appMachineTheme(), '#111111', '#222222');
});

test('_appMachineTheme() rejects a malformed custom theme from hass state', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { a: 'not-hex', b: '#222222' } },
  ] } } } };
  assert.equal(makeInstance({}, hass)._appMachineTheme(), null);
});

test('_resolveMachineTheme(): the app-synced theme wins over this card\'s own YAML config', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: { preset: 'twilight-turkish' } },
  ] } } } };
  const inst = makeInstance({ theme: 'ember-espresso' }, hass);
  assertTheme(inst._resolveMachineTheme(), '#0891b2', '#4338ca');
});

test('_resolveMachineTheme(): falls back to YAML config when the app has no theme set for this machine', () => {
  const hass = { states: { 'sensor.gaggiuino_local_profiler_machine_status': { attributes: { machines: [
    { id: 1, name: 'Gaggiuino', isDefault: true, theme: null },
  ] } } } };
  const inst = makeInstance({ theme: 'ember-espresso' }, hass);
  assertTheme(inst._resolveMachineTheme(), '#dc4a1f', '#f5a623');
});
