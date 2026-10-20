// Render characterization snapshots (#180). The card's `_render()` is one
// large method that derives everything from `hass` and assembles the shadow
// DOM; a later slice splits it into section methods and then moves it to Lit
// templates. This suite freezes the exact HTML `_render()` produces today so
// those refactors can prove "same output, different structure": it renders a
// handful of representative states in happy-dom and compares the serialized
// `shadowRoot.innerHTML` (stylesheet stripped) against
// test/fixtures/render-snapshots.json.
//
// Regenerate after an intentional output change with:
//   UPDATE_SNAPSHOTS=1 npm test -- test/render-snapshot.test.js
//
// The setup mirrors glp-order-card's render-escaping test: one Window for the
// whole file, installed as the globals before the card module is loaded, with
// `home-assistant` published first so the card's deferred custom-element
// define (#184) fires into this window's registry.
'use strict';

// Fixed timezone so locale-formatted times (ready-by countdown, nav timestamp)
// are identical no matter where the suite runs.
process.env.TZ = 'UTC';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const SNAPSHOT_PATH = path.join(__dirname, 'fixtures', 'render-snapshots.json');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

// Freeze the clock and the per-instance SVG gradient id (`Math.random()` in
// the constructor) so the serialized DOM is byte-stable across runs.
const FIXED_NOW = Date.UTC(2026, 6, 27, 12, 0, 0); // 2026-07-27T12:00:00Z
Date.now = () => FIXED_NOW;
Math.random = () => 0.5;

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
const B = 'binary_sensor.gaggiuino_local_profiler_';
const S = 'select.gaggiuino_local_profiler_';
const BASE_CONFIG = { entity_prefix: P, title: 'Gaggiuino', switch_entity: 'switch.gaggiuino', glp_url: 'https://example.test/glp' };

// A 12-sample pressure/temp/weight/flow curve, scaled exactly like the card's
// charts expect (values are tenths: 900 => 90.0).
function dp() {
  return {
    p: [0, 20, 60, 90, 91, 90, 89, 90, 91, 90, 88, 90],
    t: [900, 920, 930, 930, 928, 925, 930, 935, 930, 928, 926, 925],
    w: [0, 0, 10, 40, 80, 120, 160, 200, 240, 280, 320, 362],
    f: [0, 20, 30, 28, 27, 26, 26, 27, 26, 26, 25, 26],
  };
}

const RECENT_SHOT = {
  id: 11,
  ts: '2026-07-27T09:15:00.000Z',
  profile: 'Espresso',
  coffee: 'Test Blend',
  drink_type: 'Espresso',
  grinder: 'Niche',
  grind: '12',
  duration: 27.5,
  yield_g: 36.2,
  ratio: 2.0,
  pressure: 9.1,
  rating: 4,
  score: 82,
  beanId: null,
  dp: dp(),
};

function idleOnStates(extra = {}) {
  return {
    'switch.gaggiuino': { state: 'on' },
    [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [RECENT_SHOT] } },
    [`${P}preheat_elapsed`]: { state: '600' },
    [`${P}machine_temperature`]: { state: '93.2' },
    [`${P}machine_target_temperature`]: { state: '93.0' },
    [`${P}machine_water_level`]: { state: '65' },
    [`${P}shots_today`]: { state: '3' },
    [`${P}last_sync`]: { state: '2026-07-27T11:58:00.000Z' },
    [`${S}profile`]: { state: 'Espresso', attributes: { options: ['Espresso', 'Flat White'] } },
    ...extra,
  };
}

const SCENARIOS = [
  {
    name: 'machine-off',
    config: BASE_CONFIG,
    hass: {
      states: {
        'switch.gaggiuino': { state: 'off' },
        [`${P}machine_status`]: { state: 'offline', attributes: {} },
        [`${P}shots_today`]: { state: '3' },
      },
    },
  },
  {
    name: 'machine-off-ready-by',
    config: BASE_CONFIG,
    hass: {
      states: {
        'switch.gaggiuino': { state: 'off' },
        [`${P}machine_status`]: { state: 'offline', attributes: {} },
        [`${P}shots_today`]: { state: '3' },
        [`${P}preheat_ready_by_target_at`]: { state: '2026-07-28T07:00:00.000Z' },
        [`${P}preheat_planned_switch_on_at`]: { state: '2026-07-28T06:40:00.000Z' },
      },
    },
  },
  {
    name: 'idle-recent-shot',
    config: BASE_CONFIG,
    hass: { states: idleOnStates() },
  },
  {
    name: 'brewing',
    config: BASE_CONFIG,
    hass: {
      states: idleOnStates({
        [`${B}brewing`]: {
          state: 'on',
          attributes: {
            datapoints: {
              timeInShot: [0, 10, 20, 30, 40, 50, 60],
              pressure: [0, 20, 60, 90, 91, 90, 90],
              temperature: [900, 920, 930, 930, 928, 925, 926],
              shotWeight: [0, 0, 10, 40, 80, 120, 160],
              pumpFlow: [0, 20, 30, 28, 27, 26, 26],
            },
            profile_name: 'Espresso',
            is_descaling: false,
          },
        },
        [`${P}machine_live_pressure`]: { state: '9.0' },
        [`${P}machine_live_weight`]: { state: '35.0' },
      }),
    },
  },
  {
    name: 'maintenance-tab',
    config: BASE_CONFIG,
    hass: {
      states: idleOnStates({
        [`${P}maintenance_descaling`]: {
          state: 'ok',
          attributes: { pct: 0.2, days_since: 3, shots_since: 12 },
        },
      }),
    },
    card: { _activeTab: 'maint' },
  },
  {
    name: 'orders-tab',
    config: BASE_CONFIG,
    hass: { states: idleOnStates() },
    card: {
      _activeTab: 'orders',
      _orders: [
        { id: 'o1', item: 'Coffee', variant: 'Single', customer: 'Ann', note: 'no sugar', status: 'pending', createdAt: 1 },
        { id: 'o2', item: 'Tea', status: 'accepted', acceptedAt: FIXED_NOW - 300000, eta: 5 },
      ],
    },
  },
  {
    name: 'descaling-steam-low-water',
    config: BASE_CONFIG,
    hass: {
      states: idleOnStates({
        [`${B}brewing`]: { state: 'off', attributes: { is_descaling: true } },
        [`${B}steam_switch`]: { state: 'on' },
        [`${P}machine_water_level`]: { state: '15' },
      }),
    },
  },
];

function renderScenario(scenario) {
  const card = window.document.createElement('glp-card');
  card._config = scenario.config;
  card._hass = scenario.hass;
  Object.assign(card, scenario.card || {});
  card._render();
  const html = card.shadowRoot.innerHTML.replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  // Stop the tickers _render() started so node --test can exit.
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll']) {
    if (card[key]) { clearInterval(card[key]); card[key] = null; }
  }
  return html;
}

const results = {};
for (const scenario of SCENARIOS) results[scenario.name] = renderScenario(scenario);

if (UPDATE) {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(results, null, 2)}\n`);
} else if (!fs.existsSync(SNAPSHOT_PATH)) {
  throw new Error(
    `missing snapshot fixture ${path.relative(process.cwd(), SNAPSHOT_PATH)}; a missing `
    + 'snapshot is not a pass and is not recreated implicitly: regenerate it with '
    + 'UPDATE_SNAPSHOTS=1 npm test -- test/render-snapshot.test.js');
}

const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

// Lit leaves comment markers in the rendered DOM (its part/boundary markers,
// `<!--?lit$123$-->` / `<!---->`, and the SVG comments unsafeSVG drops), and it
// sets a bound attribute after the static ones it cloned — so the rendered DOM
// can list `data-action` before `class` where the old string-building render
// wrote `class` first. The fixture predates the Lit render, so compare with the
// comments stripped and each tag's attributes sorted; the fixture file itself
// is left untouched. This walks the parsed DOM rather than matching the markup
// with regular expressions, so the normalization stays linear and complete.
const COMMENT_NODE = 8;

function removeComments(node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === COMMENT_NODE) child.remove();
    else removeComments(child);
  }
}

function sortAttributes(el) {
  const attrs = el.getAttributeNames()
    .map(name => [name, el.getAttribute(name)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [name] of attrs) el.removeAttribute(name);
  for (const [name, value] of attrs) el.setAttribute(name, value);
}

function normalizeSnapshot(html) {
  const container = window.document.createElement('div');
  container.innerHTML = html;
  removeComments(container);
  for (const el of Array.from(container.querySelectorAll('*'))) sortAttributes(el);
  return container.innerHTML;
}

for (const scenario of SCENARIOS) {
  test(`render snapshot: ${scenario.name}`, () => {
    assert.equal(normalizeSnapshot(results[scenario.name]), normalizeSnapshot(expected[scenario.name]),
      `render output for "${scenario.name}" changed; regenerate with UPDATE_SNAPSHOTS=1 only if the change is intentional`);
  });
}
