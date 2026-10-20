// Lit-template escaping test (#180). Lit escapes every interpolated value
// before it reaches the DOM, so the manual esc() calls that used to guard the
// innerHTML-built render no longer apply. This renders the card into a real
// DOM (happy-dom) with attacker-shaped data — a profile name and a shot's
// coffee/bean name — and proves both land as text, never as live elements.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const PROFILE_PAYLOAD = '<img src=x onerror=alert(1)>';
const COFFEE_PAYLOAD  = '<script>alert(1)</script>';

// One happy-dom Window for the whole file: node --test loads the card (and
// therefore Lit) once per process, and Lit binds to whatever global document
// exists when it is first imported. The window must be installed before
// loadCard() requires the card.
const window = new Window();
// Publish `home-assistant` first so the card's deferred define (#184) fires
// synchronously and registers `glp-card` in this window's registry.
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
const S = 'select.gaggiuino_local_profiler_';

function makeCard() {
  // happy-dom forbids constructing its element classes with `new` directly, so
  // the card is built and upgraded through its custom-element registry.
  const card = window.document.createElement('glp-card');
  card._config = {
    title: 'Gaggiuino',
    entity_prefix: P,
    switch_entity: 'switch.gaggiuino',
  };
  card._hass = {
    language: 'en',
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: {
        state: 'online',
        attributes: {
          recent_shots: [{
            id: 1,
            ts: '2026-07-27T09:15:00.000Z',
            profile: 'Espresso',
            coffee: COFFEE_PAYLOAD,
            duration: 27.5,
            yield_g: 36.2,
          }],
        },
      },
      [`${P}preheat_elapsed`]: { state: '600' },
      [`${S}profile`]: { state: PROFILE_PAYLOAD, attributes: { options: [PROFILE_PAYLOAD] } },
    },
  };
  return card;
}

function stopTickers(card) {
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll']) {
    if (card[key]) { clearInterval(card[key]); card[key] = null; }
  }
}

test('a profile name and a shot coffee name render as text, not as elements', () => {
  const card = makeCard();
  card._render();

  const root = card.shadowRoot;
  assert.equal(root.querySelector('img'), null, 'the profile name must not become an <img> element');
  assert.equal(root.querySelector('script'), null, 'the coffee name must not become a <script> element');
  assert.ok(root.textContent.includes(PROFILE_PAYLOAD), 'the profile name is preserved as text');
  assert.ok(root.textContent.includes(COFFEE_PAYLOAD), 'the coffee name is preserved as text');

  stopTickers(card);
});
