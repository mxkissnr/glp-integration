// Multi-machine `machine` config option tests (#29). Loads the real
// GlpOrderCard class from src/glp-order-card.ts through the shared
// test/helpers/load-card.cjs harness, so _findMachineStatusEntity()/
// _getSwitchEntity() can be exercised directly.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpOrderCard } = loadCard();

function makeInstance({ config, states }) {
  const inst = Object.create(GlpOrderCard.prototype);
  inst._config = config;
  inst._hass = states ? { states } : null;
  return inst;
}

test('_findMachineStatusEntity() without `machine` keeps the existing behavior (first entity found)', () => {
  const inst = makeInstance({
    config: {},
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
    },
  });
  assert.equal(inst._findMachineStatusEntity(), 'sensor.gaggiuino_local_profiler_machine_status');
});

test('_findMachineStatusEntity() with `machine` matches the entity whose friendly_name references it', () => {
  const inst = makeInstance({
    config: { machine: 'Kitchen GaggiMate' },
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
      'sensor.kitchen_gaggimate_machine_status': { attributes: { friendly_name: 'Kitchen GaggiMate Machine Status' } },
    },
  });
  assert.equal(inst._findMachineStatusEntity(), 'sensor.kitchen_gaggimate_machine_status');
});

test('_getSwitchEntity() prefers explicit switch_entity config over machine-based lookup', () => {
  const inst = makeInstance({
    config: { switch_entity: 'switch.explicit', machine: 'Kitchen GaggiMate' },
    states: {
      'sensor.kitchen_gaggimate_machine_status': { attributes: { switch_entity: 'switch.from_entity' } },
    },
  });
  assert.equal(inst._getSwitchEntity(), 'switch.explicit');
});

test('_getSwitchEntity() falls back to the machine-matched entity\'s switch_entity attribute', () => {
  const inst = makeInstance({
    config: { machine: 'Kitchen GaggiMate' },
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { switch_entity: 'switch.default' } },
      'sensor.kitchen_gaggimate_machine_status': { attributes: { switch_entity: 'switch.kitchen' } },
    },
  });
  assert.equal(inst._getSwitchEntity(), 'switch.kitchen');
});

test('_findMachineStatusEntity() resolves through the entity registry (#323), names aside', () => {
  const inst = makeInstance({ config: { machine: 'Kitchen' }, states: null });
  inst._hass = {
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Local Profiler' } },
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Küche Maschinenstatus' } },
    },
    entities: {
      'sensor.gaggiuino_local_profiler_machine_status': {
        entity_id: 'sensor.gaggiuino_local_profiler_machine_status',
        platform: 'gaggiuino_profiler',
        translation_key: 'machine_status',
        device_id: 'dev_default',
      },
      'sensor.kitchen_machine_status': {
        entity_id: 'sensor.kitchen_machine_status',
        platform: 'gaggiuino_profiler',
        translation_key: 'machine_status',
        device_id: 'dev_kitchen',
      },
    },
    devices: {
      dev_default: { name: 'Gaggiuino Local Profiler' },
      dev_kitchen: { name: 'Kitchen', name_by_user: 'Kitchen' },
    },
  };
  assert.equal(inst._findMachineStatusEntity(), 'sensor.kitchen_machine_status');
  assert.equal(inst._getSwitchEntity(), null);
});

test('_getSwitchEntity() follows the registry-matched entity\'s switch_entity attribute', () => {
  const inst = makeInstance({ config: { machine: 'Kitchen 2' }, states: { 'switch.kitchen_2': { state: 'on' } } });
  inst._hass = {
    ...inst._hass,
    states: {
      'sensor.kitchen_machine_status': { attributes: { switch_entity: 'switch.kitchen' } },
      'sensor.kitchen_2_machine_status': { attributes: { switch_entity: 'switch.kitchen_2' } },
    },
    entities: {
      'sensor.kitchen_machine_status': {
        entity_id: 'sensor.kitchen_machine_status',
        platform: 'gaggiuino_profiler',
        translation_key: 'machine_status',
        device_id: 'dev_kitchen',
      },
      'sensor.kitchen_2_machine_status': {
        entity_id: 'sensor.kitchen_2_machine_status',
        platform: 'gaggiuino_profiler',
        translation_key: 'machine_status',
        device_id: 'dev_kitchen_2',
      },
    },
    devices: { dev_kitchen: { name: 'Kitchen' }, dev_kitchen_2: { name: 'Kitchen 2' } },
  };
  assert.equal(inst._getSwitchEntity(), 'switch.kitchen_2');
});

test('_findMachineStatusEntity() returns null without hass (no crash before first render)', () => {
  const inst = makeInstance({ config: { machine: 'Kitchen GaggiMate' }, states: null });
  assert.equal(inst._findMachineStatusEntity(), null);
});
