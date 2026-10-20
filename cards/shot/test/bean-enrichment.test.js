// Shot-card bean enrichment (#55, follow-up to gaggiuino-local-profiler#456):
// _beanExtraHtml() must prefer the stable beanId over the free-text coffee
// name, falling back to name matching only when beanId isn't available.
//
// _beanExtraHtml() now returns a Lit TemplateResult, so these cases render the
// card into a real DOM (happy-dom) and assert on the rendered
// `.shot-bean-extra` text instead of a raw HTML string.
'use strict';

process.env.TZ = 'UTC';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

// One happy-dom Window for the whole file: node --test loads the card (and
// therefore Lit) once per process, and Lit binds to whatever global document
// exists when it is first imported. The window must be installed before
// loadCard() requires the card.
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

function makeCard({ beansInfoById = [], beansInfo = [], coffee = 'Some Coffee', beanId } = {}) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._beansInfoById = new Map(beansInfoById);
  card._beansInfo = new Map(beansInfo);
  card._hass = {
    language: 'en',
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: {
        state: 'online',
        attributes: { recent_shots: [{ id: 1, profile: 'Espresso', coffee, beanId }] },
      },
      [`${P}preheat_elapsed`]: { state: '600' },
    },
  };
  return card;
}

// Renders the card and returns the text of the rendered `.shot-bean-extra`
// span, or '' when the card rendered no bean extra at all.
function beanExtraText(card) {
  card._render();
  const el = card.shadowRoot.querySelector('.shot-bean-extra');
  const text = el ? el.textContent : '';
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll']) {
    if (card[key]) { clearInterval(card[key]); card[key] = null; }
  }
  return text;
}

test('_beanExtraHtml() matches by beanId even when the coffee name has drifted from the library', () => {
  // Simulates a delete+reimport: the shot annotation's name string is now
  // stale ("Old Name"), but the id still resolves to the current bean.
  const bean = { name: 'Old Name', origin: 'ET', variety: 'Heirloom', roastDate: null };
  const card = makeCard({ beansInfoById: [[42, bean]], coffee: 'Old Name', beanId: 42 });
  assert.match(beanExtraText(card), /Heirloom/);
});

test('_beanExtraHtml() prefers the beanId match over a name match that points at a different bean', () => {
  const byId   = { name: 'Renamed Bean', origin: 'KE', variety: 'SL28', roastDate: null };
  const byName = { name: 'Some Coffee', origin: 'BR', variety: 'Bourbon', roastDate: null };
  const card = makeCard({
    beansInfoById: [[7, byId]],
    beansInfo: [['some coffee', byName]],
    coffee: 'Some Coffee',
    beanId: 7,
  });
  const text = beanExtraText(card);
  assert.match(text, /SL28/);
  assert.doesNotMatch(text, /Bourbon/);
});

test('_beanExtraHtml() falls back to name matching when beanId is absent (shots that predate it)', () => {
  const bean = { name: 'Legacy Coffee', origin: 'CO', variety: 'Castillo', roastDate: null };
  const card = makeCard({ beansInfo: [['legacy coffee', bean]], coffee: 'Legacy Coffee', beanId: undefined });
  assert.match(beanExtraText(card), /Castillo/);
});

test('_beanExtraHtml() falls back to name matching when the beanId does not resolve (deleted bean)', () => {
  const bean = { name: 'Still Here', origin: 'PE', variety: 'Typica', roastDate: null };
  const card = makeCard({ beansInfo: [['still here', bean]], coffee: 'Still Here', beanId: 999 }); // 999 not in the library
  assert.match(beanExtraText(card), /Typica/);
});

test('_beanExtraHtml() renders no bean extra when neither beanId nor name resolves', () => {
  const card = makeCard({ coffee: 'Unknown Coffee', beanId: 123 });
  assert.equal(beanExtraText(card), '');
});
