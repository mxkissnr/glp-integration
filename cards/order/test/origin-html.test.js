// Loads the real glp-order-card.js through the shared
// test/helpers/load-card.cjs harness and exercises the real _originHtml()
// function shipped in the card, not a re-implementation. Covers #28: origins[]
// (blend beans, multiple countries) rendering alongside the legacy
// single-origin fallback.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { _originHtml: originHtml } = loadCard({ expose: ['_originHtml'] });

test('_originHtml() renders a single ISO code as the localized country name', () => {
  assert.equal(originHtml([{ code: 'BR' }], 'en'), 'Brazil');
});

// #90: the regional-indicator flag prefix is gone. It was assembled at
// runtime from the country code, so no source-level emoji scan ever saw it,
// and it rendered in the OS font — a different visual language from every
// other icon in the card, and a plain two-letter box on Windows.
test('_originHtml() emits no regional-indicator flag characters', () => {
  const html = originHtml([{ code: 'BR', percent: 60 }, { code: 'CO', percent: 40 }], 'en');
  assert.ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(html), `flag glyph leaked into ${html}`);
});

test('_originHtml() renders a blend of multiple origins joined with " + "', () => {
  const html = originHtml([{ code: 'BR', percent: 60 }, { code: 'CO', percent: 40 }], 'en');
  assert.equal(html, 'Brazil 60% + Colombia 40%');
});

test('_originHtml() omits the percent when not set', () => {
  assert.equal(originHtml([{ code: 'BR' }, { code: 'CO' }], 'en'), 'Brazil + Colombia');
});

test('_originHtml() renders legacy free-text origin values as-is (pre-1.96 data)', () => {
  assert.equal(originHtml([{ code: 'Kuba' }], 'en'), 'Kuba');
});

test('_originHtml() escapes a non-ISO origin string to prevent HTML injection', () => {
  const html = originHtml([{ code: '<script>alert(1)</script>' }], 'en');
  assert.ok(!html.includes('<script>'));
});

test('_originHtml() localizes the country name per requested language', () => {
  assert.equal(originHtml([{ code: 'BR' }], 'de'), 'Brasilien');
});

test('_originHtml() returns an empty string for an empty origins array', () => {
  assert.equal(originHtml([], 'en'), '');
});

test('_originHtml() escapes the percent value to prevent HTML injection', () => {
  const html = originHtml([{ code: 'BR', percent: '<img src=x onerror=alert(1)>' }], 'en');
  assert.ok(!html.includes('<img'));
});
