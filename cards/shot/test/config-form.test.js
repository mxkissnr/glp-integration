// Visual card editor for the Shot Card (#262). The card exposes Home
// Assistant's documented `static getConfigForm()` so the dashboard renders the
// options with its own ha-form — there is no custom editor element. These
// tests load the real class through the shared harness: the schema and label
// assertions call the static directly, the setConfig assertions build the card
// and compare what the form produces with the equivalent YAML config.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');
const { THEME_PRESETS } = require('../src/helpers.ts');
const { normalizeFormConfig } = require('../../shared/config-form.ts');

const window = new Window();
window.customElements.define('home-assistant', class extends window.HTMLElement {});
const { GlpCard } = loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    getComputedStyle: window.getComputedStyle.bind(window),
    localStorage: window.localStorage,
  },
});

const LANGS = ['de', 'en', 'it', 'fr', 'es', 'nl'];

// Mirrors the options DOCS.md lists under "Shot Card options", in the order
// the editor must show them. Keep both in step.
const OPTION_KEYS = [
  'title', 'entity_prefix', 'machine', 'switch_entity', 'theme',
  'accent_color', 'accent_gradient', 'glp_url',
];

// getConfigForm() falls back to navigator.language when it gets no hass; the
// harness leaves the global writable, so a test can swap it.
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

const P = 'sensor.gaggiuino_local_profiler_';

// happy-dom forbids `new HTMLElement()`, so the card comes from the registry.
function makeCard(config) {
  const card = window.document.createElement('glp-card');
  card.setConfig(config);
  card._hass = { states: {} };
  return card;
}

test('the schema names every documented option exactly once, in order', () => {
  const form = GlpCard.getConfigForm();
  const names = entryNames(form.schema);

  assert.deepEqual(names, OPTION_KEYS);
  assert.equal(new Set(names).size, names.length, 'no option appears twice');
  for (const entry of form.schema) {
    assert.ok(entry.selector, `${entry.name} has a selector`);
  }
  // No section is needed for eight flat options, but if one is added it has to
  // flatten, otherwise ha-form nests its values and the card never sees them.
  for (const entry of form.schema.filter(e => e.type === 'expandable')) {
    assert.equal(entry.flatten, true, `${entry.name} stays top level`);
  }
});

test('every option has a label and a helper in all six languages', () => {
  const form = GlpCard.getConfigForm();
  for (const lang of LANGS) {
    withLanguage(lang, () => {
      for (const name of OPTION_KEYS) {
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

test('the editor labels follow the hass language when it has one', () => {
  const form = GlpCard.getConfigForm({ states: {}, language: 'de' });
  assert.equal(form.computeLabel({ name: 'title' }), 'Titel');
});

test('the theme options are "none" plus the shared presets', () => {
  const form = GlpCard.getConfigForm();
  const theme = form.schema.find(entry => entry.name === 'theme');
  const values = theme.selector.select.options.map(option => option.value);
  assert.deepEqual(values, ['none', ...Object.keys(THEME_PRESETS)]);
  assert.ok(theme.selector.select.options[0].label.trim().length > 0, 'the "none" option has a label');
});

test('the switch entity gets a switch-domain entity selector', () => {
  const form = GlpCard.getConfigForm();
  const entry = form.schema.find(e => e.name === 'switch_entity');
  assert.deepEqual(entry.selector.entity, { domain: 'switch' });
});

test('the glp_url field is a URL text field and the gradient is multi-line', () => {
  const form = GlpCard.getConfigForm();
  assert.deepEqual(form.schema.find(e => e.name === 'glp_url').selector.text, { type: 'url' });
  assert.equal(form.schema.find(e => e.name === 'accent_gradient').selector.text.multiple, true);
});

test('a form config behaves like the equivalent YAML config', () => {
  // What ha-form saves when the user picks "no preset", types one gradient
  // line and leaves the text fields empty: '' strings, the string 'none' and
  // the multi-line gradient as a single string.
  const fromForm = makeCard({
    title: '', entity_prefix: '', machine: '', switch_entity: '',
    theme: 'none', accent_color: '', accent_gradient: '#111111, #222222', glp_url: '',
  });
  const fromYaml = makeCard({ accent_gradient: ['#111111', '#222222'] });

  for (const key of ['title', 'entity_prefix', 'machine', 'switch_entity', 'theme', 'accent_color', 'glp_url']) {
    assert.equal(fromForm._config[key] ?? null, fromYaml._config[key] ?? null, `${key} matches the YAML config`);
  }
  // The emptied prefix counts as "not set", so the machine is auto-detected
  // exactly as with the equivalent YAML config.
  assert.equal(fromForm._config.entity_prefix, undefined);
  assert.equal(fromForm._resolvePrefix(), fromYaml._resolvePrefix());
  // 'none' means "not set", so no preset is picked; the gradient still wins.
  assert.equal(fromForm._config.theme, undefined);
  assert.deepEqual(fromForm._config.accent_gradient, fromYaml._config.accent_gradient);
  assert.deepEqual({ ...fromForm._resolveMachineTheme() }, { a: '#111111', b: '#222222' });
  assert.deepEqual({ ...fromYaml._resolveMachineTheme() }, { a: '#111111', b: '#222222' });
});

test('a form config with nothing set resolves to no theme at all', () => {
  const card = makeCard({
    title: '', entity_prefix: '', machine: '', switch_entity: '',
    theme: 'none', accent_color: '', accent_gradient: '', glp_url: '',
  });
  assert.equal(card._resolveMachineTheme(), null);
});

test('setConfig() still rejects an entity_prefix that is not a sensor entity id', () => {
  const card = window.document.createElement('glp-card');
  assert.throws(() => card.setConfig({ entity_prefix: 'light.x' }), /entity_prefix/);
});

// The normaliser is shared with the Order Card and tested here because the
// Shot Card's runner also covers cards/shared/ (see test/sheet.test.js).

test('the shared normaliser drops empty strings', () => {
  const out = normalizeFormConfig({ title: '', machine: '  ', switch_entity: 'switch.plug' }, ['title', 'machine', 'switch_entity']);
  assert.deepEqual(out, { switch_entity: 'switch.plug' });
  assert.equal('title' in out, false);
  assert.equal('machine' in out, false);
});

test('the shared normaliser maps the theme dropdown\'s "none" away', () => {
  assert.deepEqual(normalizeFormConfig({ theme: 'none' }, []), {});
  // A real preset key stays.
  assert.deepEqual(normalizeFormConfig({ theme: 'ember-espresso' }, ['theme']), { theme: 'ember-espresso' });
});

test('the shared normaliser splits a gradient string and leaves arrays alone', () => {
  assert.deepEqual(normalizeFormConfig({ accent_gradient: '#111111\n#222222' }, []).accent_gradient, ['#111111', '#222222']);
  assert.deepEqual(normalizeFormConfig({ accent_gradient: '  ' }, []), {});
  const yaml = { accent_gradient: ['#111111', '#222222'] };
  assert.deepEqual(normalizeFormConfig(yaml, []), yaml);
});

test('the shared normaliser leaves other values untouched', () => {
  const config = { title: 'Kitchen', new_badge_days: 14, glp_token: 'abc', entity_prefix: P };
  assert.deepEqual(normalizeFormConfig(config, ['title', 'machine']), config);
  // The input object is never mutated.
  assert.deepEqual(config, { title: 'Kitchen', new_badge_days: 14, glp_token: 'abc', entity_prefix: P });
});
