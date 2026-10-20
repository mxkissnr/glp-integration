// Shared test loader for the card source (#143). The card ships as a classic
// script bundled into an IIFE, so its class and top-level helpers are not
// reachable from the page; the tests instead import them straight from
// src/glp-order-card.ts, which Node loads via native type stripping. The module
// is evaluated once per test process, so every test file calls loadCard() once.
'use strict';

function loadCard({ expose = [], context = {} } = {}) {
  const stubs = {
    HTMLElement: class HTMLElement {},
    customElements: { define() {}, get() {}, whenDefined() { return new Promise(() => {}); } },
    window: {},
    navigator: { language: 'en-US' },
    ...context,
  };
  // defineProperty, not assignment: Node already defines `navigator` as a
  // getter-only global, so a plain `globalThis.navigator = ...` would throw.
  for (const [name, value] of Object.entries(stubs)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }

  const mod = require('../../src/glp-order-card.ts');
  const result = { GlpOrderCard: mod.GlpOrderCard };
  for (const name of expose) result[name] = mod[name];
  return result;
}

// Machine-entity fixture for _machineOff()/_getSwitchEntity() tests (#183).
// The app exposes `sensor.<prefix>machine_status`, carrying the optional
// switch entity in its attributes, and GaggiMate setups add the companion
// `binary_sensor.<prefix>machine_standby` the card treats as off.
function makeMachineHass({ prefix = 'gaggiuino_local_profiler', standby, switchState, switchEntity } = {}) {
  const states = {
    [`sensor.${prefix}_machine_status`]: {
      state: 'idle',
      attributes: {
        friendly_name: 'Gaggiuino Machine Status',
        ...(switchEntity ? { switch_entity: switchEntity } : {}),
      },
    },
  };
  if (standby != null) {
    states[`binary_sensor.${prefix}_machine_standby`] = { state: standby, attributes: {} };
  }
  if (switchEntity && switchState != null) {
    states[switchEntity] = { state: switchState, attributes: {} };
  }
  return { states };
}

module.exports = { loadCard, makeMachineHass };
