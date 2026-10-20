// Bean speciality/normal grouping tests (#36). Loads the real
// glp-order-card.js through the shared test/helpers/load-card.cjs harness,
// which exposes the GlpOrderCard class via a test-only source patch, so
// _getVariantsGrouped() can be exercised directly.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpOrderCard } = loadCard();

function makeInstance({ activeBeans } = {}) {
  const inst = Object.create(GlpOrderCard.prototype);
  inst._activeBeans = activeBeans;
  return inst;
}

// _getVariantsGrouped() returns freshly built arrays/objects; round-tripping
// through JSON normalizes them to plain data for the prototype-sensitive
// assert.deepEqual comparisons below.
function plain(x) { return JSON.parse(JSON.stringify(x)); }

test('_getVariantsGrouped() returns a flat list for non-bean items (no category concept)', () => {
  const inst = makeInstance({ activeBeans: [{ name: 'Ethiopia', category: 'speciality' }] });
  const result = inst._getVariantsGrouped({ variants: ['Single', 'Double'] });
  assert.deepEqual(plain(result), { flat: ['Single', 'Double'] });
});

test('_getVariantsGrouped() returns a flat empty list for a null/undefined item', () => {
  const inst = makeInstance({ activeBeans: [] });
  assert.deepEqual(plain(inst._getVariantsGrouped(null)), { flat: [] });
  assert.deepEqual(plain(inst._getVariantsGrouped(undefined)), { flat: [] });
});

test('_getVariantsGrouped() splits bean-backed items into speciality/normal by category', () => {
  const inst = makeInstance({
    activeBeans: [
      { name: 'Ethiopia Yirgacheffe', category: 'speciality' },
      { name: 'House Blend', category: 'normal' },
      { name: 'Colombia Supremo' }, // untagged → defaults to normal
    ],
  });
  const result = inst._getVariantsGrouped({ useBeans: true });
  assert.deepEqual(plain(result), {
    speciality: ['Ethiopia Yirgacheffe'],
    normal: ['House Blend', 'Colombia Supremo'],
  });
});

test('_getVariantsGrouped() applies the decaf label suffix within each group', () => {
  const inst = makeInstance({
    activeBeans: [
      { name: 'Ethiopia', category: 'speciality', decaf: true },
      { name: 'House Blend', category: 'normal' },
    ],
  });
  const result = inst._getVariantsGrouped({ useBeans: true });
  assert.deepEqual(plain(result.speciality), ['Ethiopia · Decaf']);
  assert.deepEqual(plain(result.normal), ['House Blend']);
});

test('_getVariantsGrouped() handles a bean-backed item with no active beans', () => {
  const inst = makeInstance({ activeBeans: [] });
  const result = inst._getVariantsGrouped({ useBeans: true });
  assert.deepEqual(plain(result), { speciality: [], normal: [] });
});

test('_getVariantsGrouped() treats all-untagged beans as entirely normal (pre-#505 data)', () => {
  const inst = makeInstance({
    activeBeans: [{ name: 'Blend A' }, { name: 'Blend B' }],
  });
  const result = inst._getVariantsGrouped({ useBeans: true });
  assert.deepEqual(plain(result), { speciality: [], normal: ['Blend A', 'Blend B'] });
});
