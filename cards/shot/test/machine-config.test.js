// Multi-machine `machine` config option tests (#50). The card is loaded via
// the shared test helper (test/helpers/load-card.cjs), which evaluates the
// real glp-card.js in a vm sandbox and exposes the GlpCard class (a top-level
// `class` declaration doesn't become a context property on its own) so
// _resolvePrefix()/_switchStorageKey() can be exercised directly without a
// full custom-element/shadow-DOM harness.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpCard } = loadCard();

function makeInstance({ config, states }) {
  const inst = Object.create(GlpCard.prototype);
  inst._config = config;
  inst._hass = { states };
  return inst;
}

test('_resolvePrefix() without `machine` keeps the existing behavior (first Gaggiuino-named entity)', () => {
  const inst = makeInstance({
    config: {},
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
      'sensor.kitchen_gaggimate_machine_status': { attributes: { friendly_name: 'Kitchen GaggiMate Machine Status' } },
    },
  });
  assert.equal(inst._resolvePrefix(), 'sensor.gaggiuino_local_profiler_');
});

test('_resolvePrefix() with `machine` matches the entity whose friendly_name references it', () => {
  const inst = makeInstance({
    config: { machine: 'Kitchen GaggiMate' },
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
      'sensor.kitchen_gaggimate_machine_status': { attributes: { friendly_name: 'Kitchen GaggiMate Machine Status' } },
    },
  });
  assert.equal(inst._resolvePrefix(), 'sensor.kitchen_gaggimate_');
});

test('_resolvePrefix() with `machine` falls back to the Gaggiuino/any heuristic when nothing matches', () => {
  const inst = makeInstance({
    config: { machine: 'Nonexistent Machine' },
    states: {
      'sensor.gaggiuino_local_profiler_machine_status': { attributes: { friendly_name: 'Gaggiuino Machine Status' } },
    },
  });
  assert.equal(inst._resolvePrefix(), 'sensor.gaggiuino_local_profiler_');
});

test('entity_prefix still wins over `machine` (explicit override, unchanged precedence)', () => {
  const inst = makeInstance({
    config: { machine: 'Kitchen GaggiMate', entity_prefix: 'sensor.custom_' },
    states: {},
  });
  assert.equal(inst._resolvePrefix(), 'sensor.custom_');
});

test('_switchStorageKey() is the unscoped global key when `machine` is not set', () => {
  const inst = makeInstance({ config: {}, states: {} });
  assert.equal(inst._switchStorageKey(), 'glp_switch_entity');
});

test('_switchStorageKey() is machine-slugged when `machine` is set, so two cards on one dashboard do not collide', () => {
  const inst = makeInstance({ config: { machine: 'Kitchen GaggiMate' }, states: {} });
  assert.equal(inst._switchStorageKey(), 'glp_switch_entity_kitchen_gaggimate');
});
