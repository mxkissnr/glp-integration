// Remaining translation surface and the picker stub (#269, slice C). The live
// machine tiles, the maintenance shot count, the shot tab label, the ratio
// label and both date/time formatters used to be hard-coded German. These
// assert the shipped render: English when Home Assistant is English, English
// when Home Assistant reports no language at all, unchanged German for a
// German frontend, dates in the Home Assistant locale, and a card added from
// the picker that finds its machine without a hand-written entity_prefix.
'use strict';

// Fixed timezone so the locale-formatted nav timestamp is stable here and in
// test/render-snapshot.test.js.
process.env.TZ = 'UTC';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

// One happy-dom Window for the whole file: node --test loads the card (and
// therefore Lit) once per process, and Lit binds to whatever global document
// exists when it is first imported.
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
assert.equal(typeof GlpCard, 'function', 'the card must register in the happy-dom window');

const P = 'sensor.gaggiuino_local_profiler_';
const BASE_CONFIG = { entity_prefix: P, switch_entity: 'switch.gaggiuino' };

// Two shots so the nav row (and its timestamp) renders for the older one.
const RECENT_SHOTS = [
  { id: 12, ts: '2026-07-27T09:15:00.000Z', profile: 'Espresso', coffee: 'Test Blend', duration: 27.5, yield_g: 36.2, ratio: 2.0, pressure: 9.1, score: 82 },
  { id: 11, ts: '2026-07-27T08:40:00.000Z', profile: 'Espresso', coffee: 'Test Blend', duration: 26.0, yield_g: 35.0, ratio: 2.0, pressure: 9.0, score: 70 },
];

function buildHass(language, localeLanguage) {
  const hass = {
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: RECENT_SHOTS } },
      [`${P}preheat_elapsed`]: { state: '600' },
      [`${P}machine_temperature`]: { state: '93.2' },
      [`${P}machine_target_temperature`]: { state: '93.0' },
      [`${P}machine_live_pressure`]: { state: '9.0' },
      [`${P}machine_live_weight`]: { state: '35.0' },
      [`${P}shots_today`]: { state: '3' },
      [`${P}maintenance_descaling`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
    },
  };
  if (language !== undefined) hass.language = language;
  if (localeLanguage !== undefined) hass.locale = { language: localeLanguage };
  return hass;
}

function stopTickers(card) {
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll']) {
    if (card[key]) { clearInterval(card[key]); card[key] = null; }
  }
}

// Renders through the registry (happy-dom forbids `new HTMLElement()`), on the
// shot tab by default. The second render moves to the older shot so the nav
// row — the only place the card formats a date — is part of the output.
function renderCard({ language, localeLanguage, tab = 'shot' } = {}) {
  const card = window.document.createElement('glp-card');
  card.setConfig(BASE_CONFIG);
  card._hass = buildHass(language, localeLanguage);
  card._activeTab = tab;
  card._render();
  card._shotIndex = 1;
  card._render();
  stopTickers(card);
  return card;
}

function text(card) {
  return card.shadowRoot.textContent;
}

function navTimestamp(card) {
  const el = card.shadowRoot.querySelector('.nav-ts');
  assert.ok(el, 'the nav row with its timestamp is rendered');
  return el.textContent;
}

// Labels that used to be German literals in the render (slice C), plus the
// older ones in the same tiles.
const GERMAN_LABELS = ['Boiler aus', 'Ziel ', 'Druck', 'Waage', ' Shots', 'heute'];

test('a card on an English frontend renders the remaining labels in English', () => {
  const body = text(renderCard({ language: 'en' }));

  for (const label of GERMAN_LABELS) {
    assert.ok(!body.includes(label), `the German label "${label}" must not be rendered: ${body}`);
  }
  assert.ok(body.includes('Temp · Target 93.0°'), 'the target-temperature tile is translated');
  assert.ok(body.includes('Pressure'), 'the live pressure tile is translated');
  assert.ok(body.includes('Scale'), 'the live scale tile is translated');
  assert.ok(body.includes('1:2.00'), 'the ratio value still renders');
  assert.ok(body.includes('Ratio'), 'the ratio label is translated');
});

test('a card on an English frontend formats the nav date and time in English', () => {
  const stamp = navTimestamp(renderCard({ language: 'en' }));
  assert.ok(!/27\.07\.26/.test(stamp), `the English card must not use the German dd.mm.yy date: ${stamp}`);
  assert.ok(/07\/27\/26/.test(stamp), `the date follows the English locale: ${stamp}`);
});

test('a card on a German frontend keeps the German output', () => {
  const card = renderCard({ language: 'de' });
  const body = text(card);

  assert.ok(body.includes('Temp · Ziel 93.0°'), 'the target-temperature tile stays German');
  assert.ok(body.includes('Druck'), 'the live pressure tile stays German');
  assert.ok(body.includes('Waage'), 'the live scale tile stays German');
  assert.ok(body.includes('3 heute'), 'the footer stays German');
  assert.match(navTimestamp(card), /27\.07\.26/, 'the nav date stays German');
});

test('the maintenance shot count is translated on both frontends', () => {
  const english = text(renderCard({ language: 'en', tab: 'maint' }));
  assert.ok(english.includes('12 shots'), `the English maint count reads "12 shots": ${english}`);
  assert.ok(!english.includes('12 Shots'));

  const german = text(renderCard({ language: 'de', tab: 'maint' }));
  assert.ok(german.includes('12 Shots'), 'the German maint count is unchanged');
});

test('a hass without a language renders English, not German', () => {
  const card = renderCard({});
  const body = text(card);

  for (const label of GERMAN_LABELS) {
    assert.ok(!body.includes(label), `the German label "${label}" must not be rendered: ${body}`);
  }
  assert.ok(body.includes('Pressure'), 'the live pressure tile is English');
  assert.ok(/07\/27\/26/.test(navTimestamp(card)), 'dates are English without a language');
});

test('dates follow the Home Assistant locale when it names one', () => {
  // A US-locale frontend running the German translation: the labels are
  // German, the date is the locale's.
  const card = renderCard({ language: 'de', localeLanguage: 'en-US' });
  assert.ok(text(card).includes('Waage'), 'labels still follow hass.language');
  assert.match(navTimestamp(card), /07\/27\/26/, 'the date follows hass.locale.language');
});

test('getStubConfig() is empty so the picker card finds its machine by itself', () => {
  assert.deepEqual(GlpCard.getStubConfig(), {});

  const card = window.document.createElement('glp-card');
  card.setConfig(GlpCard.getStubConfig());
  card._hass = {
    language: 'en',
    states: {
      'sensor.kitchen_gaggimate_machine_status': { attributes: { friendly_name: 'Kitchen GaggiMate Machine Status' } },
    },
  };
  assert.equal(card._resolvePrefix(), 'sensor.kitchen_gaggimate_');
});

test('setConfig() rejects an entity_prefix that is not a sensor entity id', () => {
  const card = window.document.createElement('glp-card');
  // '' is not in this list: the visual card editor saves a cleared text field
  // as '', which means "not set" so the card auto-detects its machine
  // (see test/config-form.test.js).
  for (const bad of [42, 'light.x', 'sensor.', 'Sensor.gaggiuino_', 'sensor.Gaggiuino_']) {
    assert.throws(() => card.setConfig({ entity_prefix: bad }), /entity_prefix/, `entity_prefix ${JSON.stringify(bad)} must be rejected`);
  }
});

test('setConfig() accepts a valid entity_prefix and an absent one', () => {
  const card = window.document.createElement('glp-card');
  card.setConfig({ entity_prefix: P });
  assert.equal(card._config.entity_prefix, P, 'a valid prefix is kept unchanged');
  card.setConfig({});
  assert.equal(card._config.entity_prefix, undefined, 'an absent prefix is still allowed');
});
