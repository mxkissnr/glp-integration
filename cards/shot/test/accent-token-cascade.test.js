// Proves the CSS custom-property DERIVATION DIRECTION in the GLP-TOKENS v1
// block is correct: --glp-accent (the legacy single-colour alias still read
// by plain `background: var(--glp-accent)` rules, e.g. `.preheat-bar-fill`)
// must derive FROM --glp-accent-start, not the other way around — because
// _applyMachineTheme() (#87) only ever sets --glp-accent-start/--glp-accent-end
// as inline overrides on the host, never --glp-accent itself. Getting the
// direction backwards leaves --glp-accent permanently pinned to
// var(--primary-color, #f59e0b), silently ignoring any configured theme
// wherever old code still reads --glp-accent directly.
//
// No real browser/CSS engine is available in this test run (Playwright's
// browser binary isn't installed in CI's "Test and build" step by design —
// see .github/workflows/validate.yml's comment on #83), so this implements
// just enough of the CSS custom-property var()-resolution algorithm (inline
// override wins over the stylesheet declaration; unresolved vars fall
// through to their var(--x, fallback) fallback) to prove the derivation
// chain resolves the way a real browser's cascade would. It operates on the
// real GLP-TOKENS v1 text read straight out of cards/shared/tokens.ts, so a
// regression in the actual shipped CSS (not a hand-copied stand-in) fails
// this test.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The token contract lives once in cards/shared/tokens.ts (#256).
const TOKENS_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'tokens.ts'), 'utf8');

function extractTokensBlock() {
  const start = TOKENS_SRC.indexOf('export const TOKENS');
  const end = TOKENS_SRC.lastIndexOf('`');
  assert.notEqual(start, -1, 'TOKENS export not found in shared/tokens.ts');
  return TOKENS_SRC.slice(TOKENS_SRC.indexOf('`', start) + 1, end);
}

function parseDeclarations(blockText) {
  const noComments = blockText.replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(noComments))) decls.set(m[1], m[2].trim());
  return decls;
}

// Minimal var()-resolution: an inline `overrides` entry always wins (mirrors
// how _applyMachineTheme()'s this.style.setProperty() outranks the
// stylesheet, same as real inline styles do); otherwise resolve the
// stylesheet declaration; otherwise fall through to var()'s own fallback arg.
function resolveVar(raw, decls, overrides, seen = new Set()) {
  const m = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i);
  if (!m) return raw;
  const [, name, fallback] = m;
  if (seen.has(name)) throw new Error(`cycle detected at ${name}`);
  const nextSeen = new Set(seen).add(name);
  if (overrides.has(name)) return overrides.get(name);
  if (decls.has(name)) return resolveVar(decls.get(name), decls, overrides, nextSeen);
  if (fallback !== undefined) return resolveVar(fallback.trim(), decls, overrides, nextSeen);
  return '';
}

const decls = parseDeclarations(extractTokensBlock());

test('--glp-accent falls back to --primary-color\'s default when nothing overrides it', () => {
  assert.equal(resolveVar(decls.get('--glp-accent'), decls, new Map()), '#f59e0b');
});

test('--glp-accent-start/--glp-accent-end also default to the same value as --glp-accent (flat colour, unthemed card unchanged)', () => {
  const empty = new Map();
  assert.equal(resolveVar(decls.get('--glp-accent-start'), decls, empty), '#f59e0b');
  assert.equal(resolveVar(decls.get('--glp-accent-end'), decls, empty), '#f59e0b');
});

test('a configured theme (an inline --glp-accent-start override, exactly what _applyMachineTheme() sets) propagates through to legacy --glp-accent readers', () => {
  // _applyMachineTheme() never touches --glp-accent directly — only
  // --glp-accent-start/--glp-accent-end. --glp-accent MUST derive from
  // --glp-accent-start for old code (e.g. `.preheat-bar-fill { background:
  // var(--glp-accent) }`) to reflect the configured theme at all.
  const overrides = new Map([['--glp-accent-start', '#112233']]);
  assert.equal(resolveVar(decls.get('--glp-accent'), decls, overrides), '#112233');
});
