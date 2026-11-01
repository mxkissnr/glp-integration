// Machine lookup through Home Assistant's entity registry (#323). HA 2026.11
// composes entity names from device + entity name, lets a user mark a "main
// entity" (which then shows the device name) and deprecates friendly_name, so
// the cards identify their `*_machine_status` sensor by its registry
// translation_key instead of by name. The name-based match stays as the
// fallback for a frontend that exposes no registry. Exercised against the real
// shared helper via Node's native type stripping.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { findMachineStatusEntity } = require('../../shared/machine.ts');
const { loadCard } = require('./helpers/load-card.cjs');

// One config-entry device plus one additional-machine device, both carrying
// the machine_status sensor.
function registryHass({ states = {}, entities, devices } = {}) {
  return { states, entities, devices };
}

const KITCHEN = {
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
  devices: {
    dev_kitchen: { name: 'Kitchen' },
    dev_kitchen_2: { name: 'Kitchen 2' },
  },
};

test('a renamed device is matched by name_by_user, whatever its entity is called', () => {
  const hass = registryHass({
    ...KITCHEN,
    devices: {
      dev_kitchen: { name: 'Gaggiuino Local Profiler', name_by_user: 'Kitchen' },
      dev_kitchen_2: { name: 'Gaggiuino Local Profiler', name_by_user: 'Kitchen 2' },
    },
  });
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen 2'), 'sensor.kitchen_2_machine_status');
});

test('a translated friendly name ("Maschinenstatus") no longer hides the sensor', () => {
  const hass = registryHass({
    ...KITCHEN,
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': {
        attributes: { friendly_name: 'Gaggiuino Local Profiler Maschinenstatus' },
      },
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
    devices: { dev_default: { name: 'Gaggiuino Local Profiler' }, dev_kitchen: { name: 'Kitchen' } },
  });
  assert.equal(findMachineStatusEntity(hass), 'sensor.gaggiuino_local_profiler_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
});

test('"Kitchen" does not resolve to "Kitchen 2", in either entity order', () => {
  for (const entities of [KITCHEN.entities, Object.fromEntries(Object.entries(KITCHEN.entities).reverse())]) {
    const hass = registryHass({ ...KITCHEN, entities });
    assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
    assert.equal(findMachineStatusEntity(hass, 'Kitchen 2'), 'sensor.kitchen_2_machine_status');
  }
});

test('a main-entity style friendly name equal to the device name still resolves', () => {
  const hass = registryHass({
    ...KITCHEN,
    states: {
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Kitchen' } },
      'sensor.kitchen_2_machine_status': { attributes: { friendly_name: 'Kitchen 2' } },
    },
  });
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
});

test('without `machine` the first registration in entity-id order answers', () => {
  const hass = registryHass({
    ...KITCHEN,
    entities: Object.fromEntries(Object.entries(KITCHEN.entities).reverse()),
  });
  assert.equal(findMachineStatusEntity(hass), 'sensor.kitchen_2_machine_status');
});

test('entities of other integrations and other translation keys are ignored', () => {
  const hass = registryHass({
    entities: {
      'sensor.aa_other_machine_status': {
        entity_id: 'sensor.aa_other_machine_status',
        platform: 'other_integration',
        translation_key: 'machine_status',
      },
      'sensor.gaggiuino_local_profiler_shot_count': {
        entity_id: 'sensor.gaggiuino_local_profiler_shot_count',
        platform: 'gaggiuino_profiler',
        translation_key: 'shot_count',
      },
      'sensor.kitchen_machine_status': KITCHEN.entities['sensor.kitchen_machine_status'],
    },
    devices: KITCHEN.devices,
  });
  assert.equal(findMachineStatusEntity(hass), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
});

test('with no registry the friendly-name match still answers (fallback)', () => {
  const hass = {
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Kitchen Machine Status' } },
    },
  };
  assert.equal(findMachineStatusEntity(hass), 'sensor.gaggiuino_local_profiler_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'GaggiMat'), 'sensor.gaggiuino_local_profiler_machine_status');
});

test('no hass yields no entity instead of throwing', () => {
  assert.equal(findMachineStatusEntity(null), undefined);
  assert.equal(findMachineStatusEntity(undefined, 'Kitchen'), undefined);
});

// ─── the Shot Card's entity_prefix path is unchanged ─────────────────────────
const { GlpCard } = loadCard();

function shotCard(config, hass) {
  const inst = Object.create(GlpCard.prototype);
  inst._config = config;
  inst._hass = hass;
  inst._switchEntity = null;
  return inst;
}

test('an explicit entity_prefix still wins over the registry', () => {
  const card = shotCard(
    { entity_prefix: 'sensor.custom_', machine: 'Kitchen' },
    { ...registryHass(KITCHEN), states: {} },
  );
  assert.equal(card._resolvePrefix(), 'sensor.custom_');
});

test('the Shot Card resolves its prefix through the registry when `machine` is set', () => {
  const card = shotCard({ machine: 'Kitchen 2' }, { ...registryHass(KITCHEN), states: {} });
  assert.equal(card._resolvePrefix(), 'sensor.kitchen_2_');
});
