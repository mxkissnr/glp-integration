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

const DEFAULT_ID = 'sensor.gaggiuino_local_profiler_machine_status';

// The two additional-machine sensors plus the default one, each with a live
// state (a registered entity without one is skipped).
const KITCHEN_ENTITIES = {
  [DEFAULT_ID]: {
    entity_id: DEFAULT_ID,
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
  'sensor.kitchen_2_machine_status': {
    entity_id: 'sensor.kitchen_2_machine_status',
    platform: 'gaggiuino_profiler',
    translation_key: 'machine_status',
    device_id: 'dev_kitchen_2',
  },
};

const KITCHEN_DEVICES = {
  dev_default: { name: 'Gaggiuino Local Profiler' },
  dev_kitchen: { name: 'Kitchen' },
  dev_kitchen_2: { name: 'Kitchen 2' },
};

function kitchenStates(extra = {}) {
  return {
    [DEFAULT_ID]: { attributes: { friendly_name: 'Gaggiuino Local Profiler Machine Status' } },
    'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Kitchen Machine Status' } },
    'sensor.kitchen_2_machine_status': { attributes: { friendly_name: 'Kitchen 2 Machine Status' } },
    ...extra,
  };
}

// A hass with the registries, defaulting to the three-machine kitchen setup.
function registryHass({ states, entities, devices } = {}) {
  return {
    states: states ?? kitchenStates(),
    entities: entities ?? KITCHEN_ENTITIES,
    devices: devices ?? KITCHEN_DEVICES,
  };
}

test('a renamed device is matched by name_by_user, whatever its entity is called', () => {
  const hass = registryHass({
    devices: {
      dev_default: { name: 'Gaggiuino Local Profiler' },
      dev_kitchen: { name: 'Gaggiuino Local Profiler', name_by_user: 'Kitchen' },
      dev_kitchen_2: { name: 'Gaggiuino Local Profiler', name_by_user: 'Kitchen 2' },
    },
  });
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen 2'), 'sensor.kitchen_2_machine_status');
});

test('a translated friendly name ("Maschinenstatus") no longer hides the sensor', () => {
  const hass = registryHass({
    entities: {
      [DEFAULT_ID]: KITCHEN_ENTITIES[DEFAULT_ID],
      'sensor.kitchen_machine_status': KITCHEN_ENTITIES['sensor.kitchen_machine_status'],
    },
    states: {
      [DEFAULT_ID]: { attributes: { friendly_name: 'Gaggiuino Local Profiler Maschinenstatus' } },
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Küche Maschinenstatus' } },
    },
    devices: { dev_default: { name: 'Gaggiuino Local Profiler' }, dev_kitchen: { name: 'Kitchen' } },
  });
  assert.equal(findMachineStatusEntity(hass), DEFAULT_ID);
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
});

test('"Kitchen" does not resolve to "Kitchen 2", in either entity order', () => {
  for (const entities of [KITCHEN_ENTITIES, Object.fromEntries(Object.entries(KITCHEN_ENTITIES).reverse())]) {
    const hass = registryHass({ entities });
    assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
    assert.equal(findMachineStatusEntity(hass, 'Kitchen 2'), 'sensor.kitchen_2_machine_status');
  }
});

test('a main-entity style friendly name equal to the device name still resolves', () => {
  const hass = registryHass({
    states: kitchenStates({
      // "Main entity": the entity shows only the device name, no "Machine Status".
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Kitchen' } },
      'sensor.kitchen_2_machine_status': { attributes: { friendly_name: 'Kitchen 2' } },
    }),
  });
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
});

test('without `machine` the first registration in entity-id order answers', () => {
  const hass = registryHass({
    entities: Object.fromEntries(Object.entries(KITCHEN_ENTITIES).reverse()),
  });
  assert.equal(findMachineStatusEntity(hass), DEFAULT_ID);
});

test('an unmatched `machine` still falls back to a real machine, not undefined', () => {
  // The pre-#323 behaviour the cards relied on: the first Gaggiuino-named
  // status entity, else the first candidate. A stale or misspelt option must
  // never leave the card without a machine (and the Order Card without a
  // switch) just because the registry answered the candidate list.
  const hass = registryHass();
  assert.equal(findMachineStatusEntity(hass, 'Nowhere'), DEFAULT_ID);

  // Without any Gaggiuino-named entity the first candidate answers.
  const noGaggiuino = registryHass({
    states: kitchenStates({
      [DEFAULT_ID]: { attributes: { friendly_name: 'Umbenannt' } },
    }),
  });
  assert.equal(findMachineStatusEntity(noGaggiuino, 'Nowhere'), DEFAULT_ID);
});

test('a registered entity without a state is skipped', () => {
  // A disabled or not-yet-added entity has no `hass.states` entry; its
  // attributes are unreadable, so it must not be picked as the machine.
  const hass = registryHass({
    states: {
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Küche Maschinenstatus' } },
    },
  });
  assert.equal(findMachineStatusEntity(hass), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');

  // Nothing registered has a state: fall back to the plain name match.
  const noneLive = registryHass({ states: {} });
  assert.equal(findMachineStatusEntity(noneLive), undefined);
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
      'sensor.kitchen_machine_status': KITCHEN_ENTITIES['sensor.kitchen_machine_status'],
    },
    states: kitchenStates({ 'sensor.aa_other_machine_status': { attributes: {} } }),
    devices: KITCHEN_DEVICES,
  });
  assert.equal(findMachineStatusEntity(hass), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
});

test('with no registry the friendly-name match still answers (fallback)', () => {
  const hass = {
    states: {
      [DEFAULT_ID]: { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
      'sensor.kitchen_machine_status': { attributes: { friendly_name: 'Kitchen Machine Status' } },
    },
  };
  assert.equal(findMachineStatusEntity(hass), DEFAULT_ID);
  assert.equal(findMachineStatusEntity(hass, 'Kitchen'), 'sensor.kitchen_machine_status');
  assert.equal(findMachineStatusEntity(hass, 'GaggiMat'), DEFAULT_ID);
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
  assert.equal(shotCard({ entity_prefix: 'sensor.custom_', machine: 'Kitchen' }, registryHass())._resolvePrefix(),
    'sensor.custom_');
});

test('the Shot Card resolves its prefix through the registry when `machine` is set', () => {
  assert.equal(shotCard({ machine: 'Kitchen 2' }, registryHass())._resolvePrefix(), 'sensor.kitchen_2_');
});

test('an unmatched `machine` keeps the Shot Card on the first real machine', () => {
  assert.equal(shotCard({ machine: 'Nowhere' }, registryHass())._resolvePrefix(),
    'sensor.gaggiuino_local_profiler_');
});
