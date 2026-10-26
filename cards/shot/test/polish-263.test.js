// Shot Card polish (#263, plus the #239 follow-up): no text glyph stands in
// for an icon any more, the bean name uses the card's own font, the five
// key figures share one grid and one value style, and a 403 from the orders
// endpoint stops the poll the way a 404 already did (listing orders is
// admin-only since #314).
//
// The markup half renders the real card in happy-dom; the orders half drives
// the real `hass` setter with node:test's fake timers, like
// test/timers-cleanup.test.js does for #270.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
const S = 'select.gaggiuino_local_profiler_';
const CONFIG = {
  entity_prefix: P,
  title: 'Gaggiuino',
  switch_entity: 'switch.gaggiuino',
  glp_url: 'https://example.test/glp',
};

// The characters this change replaces, plus the neighbouring arrow glyphs a
// later edit could reach for instead of the shared icon set.
const TEXT_GLYPHS = ['‹', '›', '▾', '↗', '◂', '▸', '▼', '▲', '◀', '▶'];

const STYLES_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.ts'), 'utf8');

function dp() {
  return {
    p: [0, 20, 60, 90, 91, 90, 89, 90, 91, 90, 88, 90],
    t: [900, 920, 930, 930, 928, 925, 930, 935, 930, 928, 926, 925],
    w: [0, 0, 10, 40, 80, 120, 160, 200, 240, 280, 320, 362],
    f: [0, 20, 30, 28, 27, 26, 26, 27, 26, 26, 25, 26],
  };
}

function shot(id) {
  return {
    id,
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
}

// Machine on and idle with two recent shots: the nav row, the profile picker
// and the footer with the GLP link all render.
function onStates(extra = {}) {
  return {
    'switch.gaggiuino': { state: 'on' },
    [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [shot(12), shot(11)] } },
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

function makeCard() {
  const card = window.document.createElement('glp-card');
  card._config = CONFIG;
  return card;
}

function stopTimers(card) {
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll', '_ordersRetry']) {
    if (card[key]) { clearInterval(card[key]); clearTimeout(card[key]); card[key] = null; }
  }
}

// A rendered, disconnected card: nothing here polls, and a live interval
// would keep node --test running.
function renderCard(states) {
  const card = makeCard();
  card._startOrdersPoll = () => {};
  card._hass = { language: 'en', states };
  card._render();
  stopTimers(card);
  return card;
}

// The card's markup with the stylesheet dropped: the stylesheet's comments may
// name the glyphs they explain, the rendered card may not.
function renderedMarkup(card) {
  return card.shadowRoot.innerHTML.replace(/<style[\s\S]*?<\/style>/g, '');
}

// ── no text glyph used as an icon ──────────────────────────────────────────

test('the rendered card contains no arrow glyph as text (#263)', () => {
  const markup = renderedMarkup(renderCard(onStates()));
  for (const glyph of TEXT_GLYPHS) {
    assert.ok(!markup.includes(glyph), `the card still renders ${glyph} as text`);
  }
});

test('the nav, picker and link controls carry a drawn icon instead (#263)', () => {
  const card = renderCard(onStates());
  const arrows = Array.from(card.shadowRoot.querySelectorAll('.nav-arrow'));
  assert.equal(arrows.length, 2, 'two shots must render two nav arrows');
  for (const arrow of arrows) {
    assert.ok(arrow.querySelector('svg'), `${arrow.getAttribute('data-nav')} arrow has no svg icon`);
    assert.equal(arrow.textContent.trim(), '', 'the arrow must not fall back to a text glyph');
  }

  const chevron = card.shadowRoot.querySelector('.profile-chevron');
  assert.ok(chevron, 'the profile picker renders a chevron');
  assert.ok(chevron.querySelector('svg'), 'the profile chevron is not a drawn icon');
  assert.equal(chevron.textContent.trim(), '', 'the profile chevron must not be a text glyph');

  const link = card.shadowRoot.querySelector('.footer a');
  assert.ok(link, 'the GLP link renders in the footer');
  assert.ok(link.querySelector('svg'), 'the GLP link has no drawn icon');
  assert.ok(!link.textContent.includes('↗'), 'the GLP link still ends in an arrow glyph');
});

test('the replaced icons come from the shared icon set (#263)', () => {
  const card = renderCard(onStates());
  for (const selector of ['.nav-arrow', '.profile-chevron', '.footer a']) {
    const svg = card.shadowRoot.querySelector(`${selector} svg`);
    assert.ok(svg.classList.contains('glp-i'),
      `${selector} icon is not from ICONS.of() — it would not follow the themed colour`);
  }
});

// ── the bean name uses the card's own font ─────────────────────────────────

test('the bean name is set in the card font, not a serif stack (#263)', () => {
  const rule = STYLES_SRC.match(/\.shot-coffee\s*\{([^}]*)\}/);
  assert.ok(rule, 'no .shot-coffee rule found');
  assert.ok(!/font-family/.test(rule[1]),
    'the bean name must inherit the card font rather than name a serif stack');
  assert.match(rule[1], /font-weight:\s*600/, 'the bean name keeps its weight');
  assert.ok(!/Fraunces|Georgia/.test(STYLES_SRC), 'the stylesheet still names the serif stack');
});

// ── one key-figure grid ────────────────────────────────────────────────────

test('all five key figures share one grid and one value style (#263)', () => {
  const card = renderCard(onStates());
  const figures = Array.from(card.shadowRoot.querySelectorAll('.key-figure'));
  assert.equal(figures.length, 5,
    'ratio, duration, yield, pressure and temperature render as five figures');

  const values = figures.map((f) => f.querySelector('.kf-value'));
  assert.ok(values.every(Boolean), 'every figure needs its value element');
  for (const value of values) {
    assert.equal(value.className, values[0].className, 'the five values must share one class');
  }

  assert.deepEqual(figures.map((f) => f.querySelector('.kf-label').textContent),
    ['Ratio', 'Duration', 'Yield', 'Pressure Ø', 'Temp']);

  assert.equal(card.shadowRoot.querySelectorAll('.stats-secondary').length, 0,
    'the old half-empty second row must be gone');
  assert.equal(card.shadowRoot.querySelectorAll('.metric-line').length, 0,
    'a finished shot no longer renders the live metric line');
});

test('a shot without any of the five values renders no key-figure grid (#263)', () => {
  const card = renderCard(onStates({
    [`${P}machine_status`]: {
      state: 'online',
      attributes: { recent_shots: [{ id: 13, profile: 'Espresso', dp: null }] },
    },
  }));
  assert.equal(card.shadowRoot.querySelectorAll('.key-figure').length, 0,
    'nothing to show means no empty grid, not five blank cells');
});

test('the key-figure grid never leaves a row half empty (#263)', () => {
  assert.match(STYLES_SRC,
    /\.key-figures\.figures-5 \.key-figure:nth-child\(4\),\s*\n\s*\.key-figures\.figures-5 \.key-figure:nth-child\(5\)\s*\{\s*grid-column:\s*span 3/,
    'five figures must lay out 3 + 2 with the last two spanning the full row');
});

// ── a 403 from the orders endpoint stops the poll ──────────────────────────

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
const statusOnly = (status) => ({ ok: false, status, json: async () => ({}) });

function recordingFetch(handler) {
  const paths = [];
  const fetchWithAuth = async (requestPath, init) => {
    paths.push(requestPath);
    return handler(requestPath, init);
  };
  fetchWithAuth.ordersCalls = () => paths.filter((p) => p === '/api/glp/orders').length;
  return fetchWithAuth;
}

// Lets every already-resolved fetch promise chain settle.
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a 403 from the orders endpoint stops the poll and hides the tab (#239)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  // The first request still lists an order, so the tab is on screen when the
  // role changes; the card must then drop it instead of showing a stale list.
  let orderCalls = 0;
  const fetchWithAuth = recordingFetch((requestPath) => {
    if (requestPath !== '/api/glp/orders') return okJson([]);
    orderCalls += 1;
    return orderCalls === 1
      ? okJson([{ id: 'o1', item: 'Coffee', status: 'pending', createdAt: 1 }])
      : statusOnly(403);
  });
  const card = makeCard();

  window.document.body.appendChild(card);
  card.hass = { language: 'en', states: onStates(), fetchWithAuth };
  await flush();

  assert.equal(fetchWithAuth.ordersCalls(), 1, 'the attached card lists orders once');
  assert.equal(card.shadowRoot.querySelectorAll('[data-tab="orders"]').length, 1,
    'a listed order shows the orders tab');

  t.mock.timers.tick(6000);
  await flush();

  assert.equal(card._ordersOff, true,
    'a 403 means listing orders is admin-only and this user is not one');
  assert.equal(card._ordersPoll, null, 'the interval is stopped on 403');
  assert.deepEqual(card._orders, [], 'a list rendered before the role change is dropped');
  assert.equal(card.shadowRoot.querySelectorAll('[data-tab="orders"]').length, 0,
    'the orders tab must not be shown to a non-admin');

  const calls = fetchWithAuth.ordersCalls();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), calls, 'no further orders requests are made');

  // Re-attaching must not resurrect a feature this user cannot use.
  card.remove();
  window.document.body.appendChild(card);
  await flush();
  assert.equal(fetchWithAuth.ordersCalls(), calls, 'the off switch survives a re-attach');

  card.remove();
  stopTimers(card);
});
