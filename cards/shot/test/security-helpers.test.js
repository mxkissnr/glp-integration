// Card loaded via the shared test helper (test/helpers/load-card.cjs), which
// imports src/glp-card.ts directly — so these tests exercise the shipped
// esc()/safeUrl() implementations, not a re-implementation. The helper picks
// the named exports through its `expose` option; the bundle served to Home
// Assistant is built from these sources by `npm run build`.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCard } = require('./helpers/load-card.cjs');

const { esc, safeUrl } = loadCard({ expose: ['esc', 'safeUrl'] });

test('esc() escapes HTML special characters', () => {
  assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(esc('&'), '&amp;');
  assert.equal(esc('"'), '&quot;');
  assert.equal(esc("'"), '&#39;');
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('esc() neutralizes a quote-breakout attribute-injection payload', () => {
  const payload = `"><script>alert(document.cookie)</script>`;
  const escaped = esc(payload);
  assert.ok(!escaped.includes('<script>'));
  assert.ok(!escaped.includes('"'));
});

test('esc() handles null/undefined/number input', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('safeUrl() accepts http(s) URLs', () => {
  assert.equal(safeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeUrl('http://192.168.1.50:8099'), 'http://192.168.1.50:8099/');
});

test('safeUrl() rejects javascript: URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
});

test('safeUrl() rejects data: URLs', () => {
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), null);
});

test('safeUrl() rejects other non-http(s) schemes', () => {
  assert.equal(safeUrl('file:///etc/passwd'), null);
  assert.equal(safeUrl('vbscript:msgbox(1)'), null);
});

test('safeUrl() rejects malformed input', () => {
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(null), null);
});
