// Loads the real class from src/glp-order-card.ts through the shared
// test/helpers/load-card.cjs harness (which stubs only the browser globals the
// module touches at load time: customElements, window, navigator) and pulls
// the actual _esc()/_safeUrl() functions out of its exports — so these tests
// exercise the shipped code, not a re-implementation.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

// #114: the card ships as an IIFE bundle, so _esc()/_safeUrl() are not
// reachable as page globals. loadCard() returns the module exports the test
// asks for, so these assertions run against the shipped implementations.
const { _esc: esc, _safeUrl: safeUrl } = loadCard({ expose: ['_esc', '_safeUrl'] });

test('_esc() escapes HTML special characters', () => {
  assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc('"'), '&quot;');
  assert.equal(esc("'"), '&#39;');
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('_esc() neutralizes a quote-breakout attribute-injection payload', () => {
  const payload = `"><script>alert(document.cookie)</script>`;
  const escaped = esc(payload);
  assert.ok(!escaped.includes('<script>'));
  assert.ok(!escaped.includes('"'));
});

test('_esc() handles null/undefined/number input', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('_safeUrl() accepts http(s) URLs', () => {
  assert.equal(safeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeUrl('http://192.168.1.50:8099'), 'http://192.168.1.50:8099/');
});

test('_safeUrl() rejects javascript: URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
});

test('_safeUrl() rejects data: URLs', () => {
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), null);
});

test('_safeUrl() rejects other non-http(s) schemes', () => {
  assert.equal(safeUrl('file:///etc/passwd'), null);
  assert.equal(safeUrl('vbscript:msgbox(1)'), null);
});

test('_safeUrl() rejects malformed input', () => {
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(null), null);
});
