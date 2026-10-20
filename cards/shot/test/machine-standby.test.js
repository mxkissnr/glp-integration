// Machine standby tests (#195). Card loaded via the shared test helper
// (test/helpers/load-card.cjs), which evaluates the real glp-card.js and
// exposes GlpCard.prototype methods to the test directly, without a real
// shadow DOM/customElements — covers only the pure-logic decisions made by
// _isMachineOff() and _isSwitchOff(), not markup.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpCard } = loadCard();

function makeInstance(switchEntity) {
  const inst = Object.create(GlpCard.prototype);
  inst._switchEntity = switchEntity ?? null;
  return inst;
}

// ── _isMachineOff() ─────────────────────────────────────────────────────────

test('_isMachineOff() is true when a configured switch is off', () => {
  const inst = makeInstance('switch.machine');
  assert.equal(inst._isMachineOff({ state: 'off' }, null), true);
});

test('_isMachineOff() is true when the switch is on but the machine is in standby', () => {
  const inst = makeInstance('switch.machine');
  assert.equal(inst._isMachineOff({ state: 'on' }, { state: 'on' }), true);
});

test('_isMachineOff() is true with no switch configured but the machine in standby', () => {
  const inst = makeInstance(null);
  assert.equal(inst._isMachineOff(null, { state: 'on' }), true);
});

test('_isMachineOff() is false with no switch configured and standby off', () => {
  const inst = makeInstance(null);
  assert.equal(inst._isMachineOff(null, { state: 'off' }), false);
});

test('_isMachineOff() is false with no switch configured and no standby entity', () => {
  const inst = makeInstance(null);
  assert.equal(inst._isMachineOff(null, undefined), false);
});

test('_isMachineOff() is false when the switch is on and no standby entity exists', () => {
  const inst = makeInstance('switch.machine');
  assert.equal(inst._isMachineOff({ state: 'on' }, undefined), false);
});

// ── _isSwitchOff() ──────────────────────────────────────────────────────────

test('_isSwitchOff() is false when the switch is on, even with the machine in standby', () => {
  const inst = makeInstance('switch.machine');
  assert.equal(inst._isSwitchOff({ state: 'on' }), false);
  // and the same input still selects the off view
  assert.equal(inst._isMachineOff({ state: 'on' }, { state: 'on' }), true);
});

test('_isSwitchOff() is true when the switch is off', () => {
  const inst = makeInstance('switch.machine');
  assert.equal(inst._isSwitchOff({ state: 'off' }), true);
  assert.equal(inst._isMachineOff({ state: 'off' }, null), true);
});
