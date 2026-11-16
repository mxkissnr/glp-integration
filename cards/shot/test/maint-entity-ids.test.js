// The maintenance sensors carry two entity id layouts (#405): installs set up
// since v1.22.1 name them after their key (`maint_backflush`,
// `maint_grouphead`), older installs kept the display-name form
// (`maintenance_backflush`, `maintenance_group_head`). The card must find the
// maintenance group either way, and prefer the older id when an install has
// both. Renders the real card in happy-dom, like test/click-actions.test.js.
'use strict';

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
const GRINDERS = { Niche: { status: 'ok', pct: 0.5, days_since: 2, shots_since: 3 } };

// The two id layouts, spelled out for the three sensors these tests feed in.
const OLD_IDS = {
  descaling: 'maintenance_descaling',
  backflush: 'maintenance_backflush',
  grouphead: 'maintenance_group_head',
  grinders: 'maintenance_grinders',
};
const NEW_IDS = {
  descaling: 'maint_descaling',
  backflush: 'maint_backflush',
  grouphead: 'maint_grouphead',
  grinders: 'maint_grinders',
};

function hass(extra = {}) {
  return {
    language: 'en',
    callService() {},
    states: {
      'switch.gaggiuino': { state: 'on' },
      [`${P}machine_status`]: { state: 'online', attributes: { recent_shots: [] } },
      [`${P}preheat_elapsed`]: { state: '600' },
      ...extra,
    },
  };
}

// Machine on and idle; the maintenance tab is the active one so the rows and
// the grinders block render.
function maintCard(extra = {}) {
  const card = window.document.createElement('glp-card');
  card._config = { title: 'Gaggiuino', entity_prefix: P, switch_entity: 'switch.gaggiuino' };
  card._hass = hass(extra);
  card._activeTab = 'maint';
  // The fake hass carries no fetchWithAuth, and a render arms the interval
  // tickers that would otherwise keep node --test alive.
  card._startOrdersPoll = () => {};
  card._startReadyByTicker = () => {};
  card._startUptimeTicker = () => {};
  card._render();
  return card;
}

function withIds(ids, states) {
  const out = {};
  for (const [key, state] of Object.entries(states)) out[`${P}${ids[key]}`] = state;
  return out;
}

function rowPill(card, task) {
  const row = card.shadowRoot.querySelector(`.maint-row[data-maint-task="${task}"]`);
  assert.ok(row, `the ${task} row is rendered`);
  return row.querySelector('.maint-pill').textContent.trim();
}

const BACKFLUSH_DUE = {
  descaling: { state: 'ok', attributes: { pct: 0.1, days_since: 10, shots_since: 20 } },
  backflush: { state: 'due', attributes: { pct: 1, days_since: 30, shots_since: 60 } },
  grinders: { state: 'ok', attributes: GRINDERS },
};

for (const [layout, ids] of [['maint_*', NEW_IDS], ['maintenance_*', OLD_IDS]]) {
  test(`a ${layout} install reports maintenance available and shows the tab`, () => {
    const card = maintCard(withIds(ids, BACKFLUSH_DUE));

    assert.equal(card._maintAvailable(), true, 'the maintenance sensors are found');
    assert.ok(card.shadowRoot.querySelector('[data-tab="maint"]'), 'the maintenance tab button is rendered');
  });

  test(`a ${layout} install flags a due task`, () => {
    const card = maintCard(withIds(ids, BACKFLUSH_DUE));

    assert.equal(card._maintAnyDue(), true, 'the due sensor is read');
    assert.equal(rowPill(card, 'backflush'), 'Due');
  });

  test(`a ${layout} install renders the grinders block`, () => {
    const card = maintCard(withIds(ids, BACKFLUSH_DUE));

    const label = card.shadowRoot.querySelector('.maint-section-label');
    assert.ok(label, 'the grinders section is rendered');
    assert.equal(label.textContent.trim(), 'Grinders');
    const rows = [...card.shadowRoot.querySelectorAll('.maint-row')];
    assert.ok(rows.some(r => !r.hasAttribute('data-maint-task')), 'the grinder row is rendered');
  });
}

test('the maint_grouphead id maps to the group head row', () => {
  const card = maintCard({
    [`${P}maint_grouphead`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
  });

  const row = card.shadowRoot.querySelector('.maint-row[data-maint-task="grouphead"]');
  assert.ok(row, 'the group head row is rendered');
  assert.match(row.textContent, /Group head/);
});

test('with both layouts the maintenance_* sensor wins', () => {
  // Older entity ok, newer entity due: the card must show the older one.
  const olderWins = maintCard({
    [`${P}maintenance_backflush`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
    [`${P}maint_backflush`]: { state: 'due', attributes: { pct: 1, days_since: 40, shots_since: 90 } },
  });

  assert.equal(olderWins._maintAnyDue(), false, 'the newer due sensor is ignored');
  assert.equal(rowPill(olderWins, 'backflush'), 'OK');

  // Older entity due, newer entity ok: still the older one, so the tab warns.
  const olderDue = maintCard({
    [`${P}maintenance_backflush`]: { state: 'due', attributes: { pct: 1, days_since: 40, shots_since: 90 } },
    [`${P}maint_backflush`]: { state: 'ok', attributes: { pct: 0.2, days_since: 3, shots_since: 12 } },
  });

  assert.equal(olderDue._maintAnyDue(), true, 'the older due sensor is read');
  assert.equal(rowPill(olderDue, 'backflush'), 'Due');
});
