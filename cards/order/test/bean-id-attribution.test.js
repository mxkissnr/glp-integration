// Order->bean attribution id-first resolution (#35, follow-up to
// gaggiuino-local-profiler#456). Loads the real glp-order-card.js through the
// shared test/helpers/load-card.cjs harness and exercises _getSelectedBean()
// directly.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { GlpOrderCard } = loadCard();

function makeInstance({ menu, activeBeans, selected, selectedVariant, selectedBeanId }) {
  const inst = Object.create(GlpOrderCard.prototype);
  inst._menu = menu;
  inst._activeBeans = activeBeans;
  inst._selected = selected;
  inst._selectedVariant = selectedVariant;
  inst._selectedBeanId = selectedBeanId ?? null;
  return inst;
}

const beanItem = { name: 'Coffee', useBeans: true };

test('_getSelectedBean() resolves by id even when another bean now shares the selected label', () => {
  const inst = makeInstance({
    menu: [beanItem],
    selected: 'Coffee',
    selectedVariant: 'Ethiopia',
    selectedBeanId: 1,
    activeBeans: [
      { id: 2, name: 'Ethiopia' },      // reimported under the same name, different id
      { id: 1, name: 'Kenya' },         // stale label locally, but id still resolves
    ],
  });
  assert.equal(inst._getSelectedBean().id, 1);
});

test('_getSelectedBean() falls back to name matching when the id is absent (pre-#35 state)', () => {
  const inst = makeInstance({
    menu: [beanItem],
    selected: 'Coffee',
    selectedVariant: 'Ethiopia',
    selectedBeanId: null,
    activeBeans: [{ id: 5, name: 'Ethiopia' }],
  });
  assert.equal(inst._getSelectedBean().id, 5);
});

test('_getSelectedBean() falls back to name matching when the id no longer resolves', () => {
  const inst = makeInstance({
    menu: [beanItem],
    selected: 'Coffee',
    selectedVariant: 'Ethiopia',
    selectedBeanId: 999, // stale/unresolvable id
    activeBeans: [{ id: 5, name: 'Ethiopia' }],
  });
  assert.equal(inst._getSelectedBean().id, 5);
});

test('_getSelectedBean() returns null for non-bean items regardless of selectedBeanId', () => {
  const inst = makeInstance({
    menu: [{ name: 'Espresso', useBeans: false, variants: ['Single', 'Double'] }],
    selected: 'Espresso',
    selectedVariant: 'Single',
    selectedBeanId: 1,
    activeBeans: [{ id: 1, name: 'Ethiopia' }],
  });
  assert.equal(inst._getSelectedBean(), null);
});

test('_beanIdForLabel() resolves the active bean id for a rendered chip label', () => {
  const inst = makeInstance({
    activeBeans: [
      { id: 7, name: 'House Blend' },
      { id: 8, name: 'Ethiopia', decaf: true },
    ],
  });
  assert.equal(inst._beanIdForLabel('House Blend'), 7);
  assert.equal(inst._beanIdForLabel('Ethiopia · Decaf'), 8);
  assert.equal(inst._beanIdForLabel('Unknown'), null);
});
