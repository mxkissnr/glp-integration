// Guards the base .glp-i rule for the drawn icon set (GLP-SHARED:icons v1).
//
// This exists because the rule was missing in glp-card.js when the icons
// first landed, and NOTHING caught it: the icons are stroke-drawn paths with
// no fill/stroke presentation attributes of their own, so an <svg> without
// this rule falls back to the SVG default of fill:black + stroke:none and
// renders every icon as a solid black blob. The markup is correct, the tests
// pass, the build passes — it is only visible in a browser, and only to
// someone who looks. A cheap static assertion is the right guard for that.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// esbuild strips the GLP-SHARED marker comments, so read src/*.ts, not the bundle (#180).
const SRC = fs.readdirSync(path.join(__dirname, '..', 'src'))
  .filter((name) => name.endsWith('.ts'))
  .sort()
  .map((name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8'))
  .join('\n');

// Matches the BASE rule only. Anchoring on the line start with nothing but
// indentation in front is what excludes a contextual override like
// `.rating-row .glp-i { ... }`, which sizes an icon in one place and would
// otherwise satisfy this check while the actual base rule is missing — the
// exact hole the first version of this test had.
const BASE_RULE = /^[ \t]*\.glp-i\s*\{([^}]*)\}/m;

test('the card defines a base .glp-i rule', () => {
  assert.ok(BASE_RULE.test(SRC),
    'no base `.glp-i { ... }` rule found — every drawn icon will render as a solid black shape');
});

test('the base .glp-i rule sets fill:none and stroke:currentColor', () => {
  const body = SRC.match(BASE_RULE)[1];
  assert.match(body, /fill:\s*none/,
    'without fill:none the SVG default (fill:black) fills every stroke path');
  assert.match(body, /stroke:\s*currentColor/,
    'without stroke:currentColor the paths have no visible outline, and the icon cannot inherit its context colour');
  assert.match(body, /stroke-width:/,
    'stroke-width pins the icons to the same weight as the app icon set');
});

test('every ICONS path is stroke-drawn, i.e. relies on that base rule', () => {
  // If someone adds a pre-filled icon later, the fill:none above would erase
  // it — that is a real trap, so assert the assumption holds both ways.
  const block = SRC.slice(SRC.indexOf('const GLP_ICON_PATHS'), SRC.indexOf('// /GLP-SHARED:icons v1'));
  assert.ok(block.length > 0, 'GLP-SHARED:icons v1 block not found');
  assert.ok(!/fill="(?!none)/.test(block),
    'an icon path carries its own fill attribute, which the base fill:none rule will fight');
});
