// Visual card editor (#272). The card exposes Home Assistant's documented
// `static getConfigForm()` so the dashboard renders the options with its own
// ha-form — there is no custom editor element. These tests load the real class
// through the shared harness: the schema and label assertions call the static
// directly, the setConfig assertions render into happy-dom and compare what the
// form produces with the equivalent YAML config.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');
const { THEME_PRESETS } = require('../src/helpers.ts');

const window = new Window();
window.customElements.define('home-assistant', class extends window.HTMLElement {});
const { GlpOrderCard } = loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

const LANGS = ['de', 'en', 'it', 'fr', 'es', 'nl'];

// Mirrors CardConfig (src/types.ts) and the options DOCS.md lists under
// "Order Card options", in the order the editor must show them — the advanced
// pair sits inside the expandable. Keep all three in step.
const OPTION_KEYS = [
  'title', 'machine', 'switch_entity', 'new_badge_days', 'theme',
  'accent_color', 'accent_gradient', 'glp_url', 'glp_token',
];

// getConfigForm() reads navigator.language exactly like the card's
// constructor; the harness leaves the global writable, so a test can swap it.
function withLanguage(lang, fn) {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: lang }, configurable: true, writable: true,
  });
  try {
    return fn();
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: previous, configurable: true, writable: true,
    });
  }
}

// Field names in document order, descending into expandable sections.
function entryNames(schema) {
  const names = [];
  for (const entry of schema) {
    if (Array.isArray(entry.schema)) names.push(...entryNames(entry.schema));
    else names.push(entry.name);
  }
  return names;
}

const DAY = 24 * 60 * 60 * 1000;

function makeCard(config) {
  const card = window.document.createElement('glp-order-card');
  card.setConfig(config);
  card._lang = 'en';
  card._enabled = true;
  card._menu = [
    { name: 'Fresh', createdAt: Date.now() - 3 * DAY },
    { name: 'Old', createdAt: Date.now() - 10 * DAY },
  ];
  card._activeBeans = [];
  card._hass = { states: {}, user: { id: 'user-1', name: 'Test' }, language: 'en' };
  return card;
}

// The NEW badge sits inside its item's name cell, so the item name says which
// menu entries are still inside the configured window.
function badgedItems(card) {
  card._render();
  return [...card.shadowRoot.querySelectorAll('.menu-badge-new')].map(badge =>
    badge.closest('.menu-item').querySelector('.menu-item-name').textContent.replace('NEW', '').trim());
}

test('the schema names every CardConfig key exactly once, in order', () => {
  const form = GlpOrderCard.getConfigForm();
  const names = entryNames(form.schema);

  assert.deepEqual(names, OPTION_KEYS);
  assert.equal(new Set(names).size, names.length, 'no option appears twice');

  // One expandable section holds the two direct-URL options; everything else
  // is a plain field with a selector.
  const expandable = form.schema.filter(entry => entry.type === 'expandable');
  assert.equal(expandable.length, 1);
  assert.deepEqual(entryNames(expandable[0].schema), ['glp_url', 'glp_token']);
  for (const entry of form.schema) {
    if (entry.type !== 'expandable') assert.ok(entry.selector, `${entry.name} has a selector`);
  }
});

test('every option has a label and a helper in all six languages', () => {
  const form = GlpOrderCard.getConfigForm();
  const names = [...entryNames(form.schema), 'advanced'];
  for (const lang of LANGS) {
    withLanguage(lang, () => {
      for (const name of names) {
        const label = form.computeLabel({ name });
        const helper = form.computeHelper({ name });
        assert.equal(typeof label, 'string', `${lang} ${name} label type`);
        assert.ok(label.trim().length > 0, `${lang} ${name} label is empty`);
        assert.notEqual(label, `cfg_${name}`, `${lang} ${name} label is the raw key`);
        assert.equal(typeof helper, 'string', `${lang} ${name} helper type`);
        assert.ok(helper.trim().length > 0, `${lang} ${name} helper is empty`);
        assert.notEqual(helper, `cfg_${name}_help`, `${lang} ${name} helper is the raw key`);
      }
    });
  }
});

test('the glp_token helper still warns that every dashboard user can read it', () => {
  const form = GlpOrderCard.getConfigForm();
  const helper = withLanguage('en', () => form.computeHelper({ name: 'glp_token' }));
  assert.match(helper, /every dashboard user can read/i);
});

test('the theme options are the shared presets plus a "none" entry', () => {
  const form = GlpOrderCard.getConfigForm();
  const theme = form.schema.find(entry => entry.name === 'theme');
  const values = theme.selector.select.options.map(option => option.value);
  assert.deepEqual(values, ['none', ...Object.keys(THEME_PRESETS)]);
});

// _applyThemeVars() writes to a style object; a plain stub reads the values
// back verbatim, unlike a real CSSStyleDeclaration that may normalise them.
function themeVars(config) {
  const props = new Map();
  const inst = Object.create(GlpOrderCard.prototype);
  inst._config = config;
  inst._hass = { states: {} };
  inst.style = {
    setProperty(name, value) { props.set(name, value); },
    getPropertyValue(name) { return props.get(name) || ''; },
  };
  inst._applyThemeVars();
  return props;
}

test('a form config renders like the equivalent YAML config', () => {
  // What ha-form saves when the user picks 14 days, "no preset" and leaves the
  // text fields empty: a number, the string 'none' and empty strings.
  const formConfig = {
    title: '', machine: '', switch_entity: '', new_badge_days: 14,
    theme: 'none', accent_color: '', accent_gradient: '', glp_url: '', glp_token: '',
  };
  const fromForm = makeCard(formConfig);
  const fromYaml = makeCard({ new_badge_days: '14' });

  // A 14-day window keeps the 10-day-old item new, so both cards badge both.
  assert.deepEqual(badgedItems(fromForm), ['Fresh', 'Old']);
  assert.deepEqual(badgedItems(fromForm), badgedItems(fromYaml));

  // 'none' and '' mean "not set", so no preset is applied: both configs fall
  // back to the unthemed expression and resolve to no theme at all.
  assert.equal(fromForm._resolveTheme(), null);
  assert.equal(fromYaml._resolveTheme(), null);
  for (const config of [fromForm._config, fromYaml._config]) {
    const vars = themeVars(config);
    assert.equal(vars.get('--glp-accent-start'), THEME_NONE_STYLE);
    assert.equal(vars.get('--glp-accent-end'), THEME_NONE_STYLE);
  }

  // The empty strings are dropped, so they cannot override the fallbacks.
  for (const key of ['title', 'machine', 'switch_entity', 'theme', 'accent_color']) {
    assert.equal(fromForm._config[key], null, `${key} stays unset`);
  }
});

test('the form\'s minimum of 0 days really switches the NEW badge off', () => {
  const card = makeCard({ new_badge_days: 0 });
  assert.deepEqual(badgedItems(card), []);
});

test('an existing YAML config with a string new_badge_days still works', () => {
  const card = makeCard({ new_badge_days: '7' });
  assert.equal(card._config.new_badge_days, '7');
  // A 7-day window leaves only the 3-day-old item badged.
  assert.deepEqual(badgedItems(card), ['Fresh']);
});
