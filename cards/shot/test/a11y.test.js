// Accessibility regressions from #269: reduced motion must silence EVERY
// animation in the Shot Card stylesheet, the order badges/buttons must clear
// WCAG AA, and the icon-only controls must carry an accessible name.
//
// The CSS half parses the shipped STYLES text (no browser needed); the ARIA
// half renders the real card in happy-dom, same setup as
// test/render-gating.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');
const { STYLES } = require('../src/styles.ts');
const { TOKENS } = require('../../shared/tokens.ts');

// ── CSS parsing (enough for this stylesheet: flat rules + the media blocks) ──

function matchBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced braces at ${openIndex}`);
}

// Returns [{ selectors, body, reduced, motionOptIn }] for every style rule,
// skipping @keyframes bodies. `reduced` marks rules inside
// (prefers-reduced-motion: reduce), `motionOptIn` the no-preference blocks.
function parseRules(css, { reduced = false, motionOptIn = false } = {}) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const pre = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
    const close = matchBrace(css, open);
    const body = css.slice(open + 1, close);
    if (/^@media/.test(pre)) {
      rules.push(...parseRules(body, {
        reduced: reduced || /prefers-reduced-motion:\s*reduce/.test(pre),
        motionOptIn: motionOptIn || /prefers-reduced-motion:\s*no-preference/.test(pre),
      }));
    } else if (!/^@keyframes/.test(pre) && pre) {
      rules.push({
        selectors: pre.split(',').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean),
        body,
        reduced,
        motionOptIn,
      });
    }
    i = close + 1;
  }
  return rules;
}

const hasAnimation = body => /(^|;)\s*animation\s*:/.test(body);

function specificity(selector) {
  let ids = 0, classes = 0, types = 0;
  for (const part of selector.match(/::?[\w-]+(\([^)]*\))?|#[\w-]+|\.[\w-]+|\[[^\]]*\]|[\w-]+/g) || []) {
    if (part.startsWith('#')) ids += 1;
    else if (part.startsWith('.') || part.startsWith('[') || part.startsWith(':')) classes += 1;
    else types += 1;
  }
  return ids * 10000 + classes * 100 + types;
}

// Simple selectors of one compound/complex selector, ignoring combinators.
function simpleSelectors(selector) {
  return (selector.match(/::?[\w-]+(\([^)]*\))?|#[\w-]+|\.[\w-]+|\[[^\]]*\]|[\w-]+/g) || [])
    .filter(t => !['>', '+', '~'].includes(t));
}

// A reduced-motion rule covers an animated one when it selects at least the
// same elements (every one of its simple selectors also appears in the
// animated selector) and is at least as specific, so it actually wins.
function covers(reducedSelector, animatedSelector) {
  if (specificity(reducedSelector) < specificity(animatedSelector)) return false;
  const animated = simpleSelectors(animatedSelector);
  return simpleSelectors(reducedSelector).every(s => animated.includes(s));
}

const RULES = parseRules(STYLES);
const ANIMATED = RULES.filter(r => !r.reduced && !r.motionOptIn && hasAnimation(r.body));
const REDUCED = RULES.filter(r => r.reduced && /(^|;)\s*animation\s*:\s*none/.test(r.body));

test('the stylesheet still has the animations this suite guards', () => {
  const selectors = ANIMATED.flatMap(r => r.selectors);
  for (const expected of [
    '.glp-anim .glp-curve-line',
    '.glp-anim .glp-curve-phase',
    '.glp-anim .glp-curve-endpoint',
    '.lm-live-dot',
    '.status-dot.brewing',
    '.descaling-banner svg',
    '.nav-dot.active.changed',
  ]) {
    assert.ok(selectors.includes(expected), `expected an animation on ${expected}`);
  }
});

test('every animated selector is silenced by an equally specific reduced-motion rule', () => {
  const uncovered = [];
  for (const rule of ANIMATED) {
    for (const selector of rule.selectors) {
      const covered = REDUCED.some(r => r.selectors.some(rs => covers(rs, selector)));
      if (!covered) uncovered.push(selector);
    }
  }
  assert.deepEqual(uncovered, [], 'these animations still play under prefers-reduced-motion: reduce');
});

// Reads a declaration out of a rule body, or null.
function declarationIn(body, property) {
  const m = new RegExp(`(^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(body);
  return m ? m[2].trim() : null;
}

test('the reduced-motion block pins the curve to its drawn end state', () => {
  const reducedRules = RULES.filter(r => r.reduced);
  const pinned = (selector, property, expected) => reducedRules.some(r =>
    r.selectors.some(s => covers(s, selector)) && declarationIn(r.body, property) === expected);

  assert.ok(pinned('.glp-anim .glp-curve-line', 'stroke-dashoffset', '0'),
    'without the animation the line stays at dashoffset 900 unless pinned to 0');
  assert.ok(pinned('.glp-anim .glp-curve-phase', 'opacity', '1'), 'the phase fill is pinned to opacity 1');
  assert.ok(pinned('.glp-anim .glp-curve-endpoint', 'opacity', '1'), 'the endpoint marker is pinned to opacity 1');
});

// ── WCAG AA contrast for the order badge and buttons ─────────────────────

function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mixWithBlack(hex, percent) {
  const v = hex.replace('#', '');
  const channels = [0, 2, 4].map(i => Math.round(parseInt(v.slice(i, i + 2), 16) * percent));
  return `#${channels.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

// The two values each semantic token can take: the dark-theme defaults in the
// GLP-TOKENS block and the light-theme pair _applySemanticColorContrast()
// writes at runtime (cards/shared/contrast.ts).
const TOKEN_VALUES = {
  '--accent': [/#ef4444/i.exec(TOKENS)[0], '#dc2626'],
  '--green': [/#22c55e/i.exec(TOKENS)[0], '#15803d'],
};

const declaration = (selector, property) => {
  const rule = RULES.find(r => !r.reduced && r.selectors.includes(selector));
  assert.ok(rule, `missing rule for ${selector}`);
  const value = declarationIn(rule.body, property);
  assert.ok(value, `${selector} has no ${property}`);
  return value;
};

// Resolves `#rgb`/`#rrggbb` or `color-mix(in srgb, var(--token) P%, #000)`.
function resolveColour(value) {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return [`#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`];
  if (/^#[0-9a-f]{6}$/i.test(value)) return [value];
  const m = /color-mix\(in srgb, var\((--[\w-]+)\)\s*(\d+)%,\s*#000\)/.exec(value);
  assert.ok(m, `unsupported colour value: ${value}`);
  const [, token, percent] = m;
  assert.ok(TOKEN_VALUES[token], `no known values for ${token}`);
  return TOKEN_VALUES[token].map(hex => mixWithBlack(hex, Number(percent) / 100));
}

for (const selector of ['.tab-badge', '.ord-btn.primary', '.ord-btn.danger']) {
  test(`${selector} keeps its text at >= 4.5:1 for every theme value`, () => {
    const inks = resolveColour(declaration(selector, 'color'));
    const fills = resolveColour(declaration(selector, 'background'));
    for (const ink of inks) {
      for (const fill of fills) {
        const ratio = contrast(ink, fill);
        assert.ok(ratio >= 4.5, `${ink} on ${fill} is ${ratio.toFixed(2)}:1`);
      }
    }
  });
}

// ── Accessible names for the icon-only controls ───────────────────────────

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
    id, ts: '2026-07-27T09:15:00.000Z', profile: 'Espresso', coffee: 'Test Blend',
    drink_type: 'Espresso', grinder: 'Niche', grind: '12', duration: 27.5, yield_g: 36.2,
    ratio: 2.0, pressure: 9.1, rating: 4, score: 82, beanId: null, dp: dp(),
  };
}

// Two recent shots, so the nav row (and its two arrows) renders at all.
function cardStates() {
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
  };
}

function renderCard() {
  const card = window.document.createElement('glp-card');
  card._config = { entity_prefix: P, title: 'Gaggiuino', switch_entity: 'switch.gaggiuino' };
  card._hass = { language: 'en', states: cardStates() };
  // No fetchWithAuth here, so the orders poll would retry forever.
  card._startOrdersPoll = () => {};
  card._render();
  for (const key of ['_uptimeTimer', '_readyByTimer', '_ordersPoll', '_ordersRetry']) {
    if (card[key]) { clearInterval(card[key]); clearTimeout(card[key]); card[key] = null; }
  }
  return card;
}

test('the Shot Card renders the two nav arrows and the power button', () => {
  const card = renderCard();
  assert.equal(card.shadowRoot.querySelectorAll('.nav-arrow').length, 2,
    'two shots must render two nav arrows');
  assert.ok(card.shadowRoot.querySelector('.power-btn'), 'the power button needs a switch entity');
});

test('both nav arrows expose a distinct non-empty aria-label', () => {
  const card = renderCard();
  const arrows = Array.from(card.shadowRoot.querySelectorAll('.nav-arrow'));
  for (const arrow of arrows) {
    const label = arrow.getAttribute('aria-label');
    assert.ok(label && label.trim(), `${arrow.getAttribute('data-nav')} arrow has no aria-label`);
  }
  assert.notEqual(arrows[0].getAttribute('aria-label'), arrows[1].getAttribute('aria-label'),
    'the two arrows must not share one label');
});

test('the power button exposes a non-empty aria-label matching its action', () => {
  const card = renderCard();
  const power = card.shadowRoot.querySelector('.power-btn');
  assert.ok(power, 'the power button renders when a switch entity is configured');
  const label = power.getAttribute('aria-label');
  assert.ok(label && label.trim(), 'the power button has no aria-label');
  assert.equal(label, power.getAttribute('title'), 'the aria-label reuses the power_on/power_off text');
});
