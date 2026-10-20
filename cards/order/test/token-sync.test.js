// Consistency check for JS blocks intentionally kept byte-identical between
// this repo and glp-card.js — originally just the GLP-TOKENS CSS block,
// extended (#83) to the full set of GLP-SHARED helpers glp-card.js has
// grown markers for over time (esc/safeUrl, theme-presets, machine-icon,
// the machine-status matching predicate, app-theme-lookup, contrast):
// this repo used to only ever check GLP-TOKENS, and a missing marker on the
// neighbor's side used to always skip instead of fail, so the guard
// verified far less than it looked like it did. A marker missing on the
// neighbor (or a byte-level mismatch) is drift and fails — UNLESS the
// block is listed in TRANSITIONAL below, see that comment.
//
// "Neighbor repo not checked out" is a normal, expected state for local dev
// (skip) but not for CI, which is expected to fetch the neighbor file (see
// .github/workflows/validate.yml) — there, its absence means that fetch
// step is broken and this fails instead of silently skipping.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The neighbor card lives next to this one in cards/; its shared blocks are
// read from its TypeScript sources (every src/*.ts, sorted, joined with '\n').
const NEIGHBOR_PATH = path.join(__dirname, '..', '..', 'shot');

// Returns the neighbor's shared-block source text, or null when its src/ is missing.
function readNeighborSource() {
  const srcDir = path.join(NEIGHBOR_PATH, 'src');
  if (!fs.existsSync(srcDir)) return null;
  return fs.readdirSync(srcDir)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => fs.readFileSync(path.join(srcDir, name), 'utf8'))
    .join('\n');
}

// Read the TypeScript sources, not the committed bundle: esbuild strips the
// GLP-SHARED marker comments and rewrites top-level const to var, so the
// byte-identical blocks can only be extracted from src/ (#143). Every src/*.ts
// file is concatenated (sorted by name) so a block is still found after a later
// slice moves it into its own module.
function readSource() {
  const dir = path.join(__dirname, '..', 'src');
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
}
const OWN_SRC = readSource();

// Anchored on a short, stable prefix rather than the full marker sentence —
// the marker's wording (it names both files) is itself part of the compared
// block and must stay identical too, but the search anchor shouldn't break
// if that wording is ever tweaked in lockstep on both sides.
const BLOCKS = [
  { name: 'GLP-TOKENS v1',               start: '/* GLP-TOKENS v1',               end: '/* /GLP-TOKENS v1 */' },
  { name: 'GLP-SHARED:esc v1',           start: '// GLP-SHARED:esc v1',           end: '// /GLP-SHARED:esc v1' },
  { name: 'GLP-SHARED:safeUrl v1',       start: '// GLP-SHARED:safeUrl v1',       end: '// /GLP-SHARED:safeUrl v1' },
  { name: 'GLP-SHARED:theme-presets v1', start: '// GLP-SHARED:theme-presets v1', end: '// /GLP-SHARED:theme-presets v1' },
  { name: 'GLP-SHARED:machine-icon v1',  start: '// GLP-SHARED:machine-icon v1',  end: '// /GLP-SHARED:machine-icon v1' },
  { name: 'GLP-SHARED:icons v1',         start: '// GLP-SHARED:icons v1',         end: '// /GLP-SHARED:icons v1' },
  { name: 'GLP-SHARED:contrast v1',      start: '/* GLP-SHARED:contrast v1',      end: '/* /GLP-SHARED:contrast v1 */' },
  { name: 'GLP-SHARED:machine-match v1', start: '// GLP-SHARED:machine-match v1', end: '// /GLP-SHARED:machine-match v1' },
  { name: 'GLP-SHARED:app-theme-lookup v1', start: '// GLP-SHARED:app-theme-lookup v1', end: '// /GLP-SHARED:app-theme-lookup v1' },
];

// TRANSITIONAL — a merge-window escape hatch, NOT a standing exemption.
//
// Adding or changing a shared block always touches both repos, and both
// halves can never merge in the same instant — so for as long as one PR is
// open, this side and the neighbor's `main` are guaranteed to disagree on
// that block (missing marker, or a byte-level mismatch on the parts that
// changed). Without an escape hatch that's a deadlock: this repo's PR fails
// CI until the neighbor's PR merges, and the neighbor's PR fails CI on the
// blocks THIS PR touches until this PR merges.
//
// A block listed here is exempted from both failure modes (missing marker
// on the neighbor, byte-level mismatch) for the duration of that named
// companion PR only. Every entry MUST carry an issue reference — an entry
// without one is a bug, and the file refuses to load if it finds one (see
// the validation loop below). The list MUST be emptied immediately once the
// named companion PR(s) merge (#85 tracked this repo's post-#84 cleanup).
// A non-empty TRANSITIONAL outside of an active cross-repo merge window
// means the guard is silently checking less than it claims to, exactly the
// failure mode #83 was filed to fix in the first place.
//
// Normal state: EMPTY. Populate it only while a companion PR that changes a
// GLP-SHARED block is open on the neighbor repo, and empty it again in the
// same round that companion PR merges — see #85 for the shape that cleanup
// PR takes.
const TRANSITIONAL = {};

for (const [name, entry] of Object.entries(TRANSITIONAL)) {
  if (!entry || !entry.issue) {
    throw new Error(`TRANSITIONAL entry "${name}" is missing an issue reference — that's a bug, not a valid transitional state`);
  }
}

function extractBlock(src, { start, end }) {
  const startIdx = src.indexOf(start);
  const endIdx = src.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return null;
  return src.slice(startIdx, endIdx + end.length);
}

for (const block of BLOCKS) {
  test(`${block.name} block is byte-identical with glp-card.js`, (t) => {
    const neighborSrc = readNeighborSource();
    if (neighborSrc == null) {
      assert.fail(`neighbor card sources not found at ${NEIGHBOR_PATH}`);
    }

    const ownBlock = extractBlock(OWN_SRC, block);
    assert.ok(ownBlock, `glp-order-card.js must contain a ${block.name} block`);

    const neighborBlock = extractBlock(neighborSrc, block);
    const inSync = neighborBlock != null && neighborBlock === ownBlock;

    const transitional = TRANSITIONAL[block.name];
    if (transitional && !inSync) {
      // Loud on purpose — this must be impossible to miss scrolling a CI
      // log, not a quietly-skipped line among hundreds of others.
      const msg = `TRANSITIONAL: ${block.name} not checked, see ${transitional.issue} (${transitional.reason})`;
      console.log(`\n########## ${msg} ##########\n`);
      t.skip(msg);
      return;
    }

    assert.ok(neighborBlock, `glp-card.js has no ${block.name} block — it must carry a matching marker`);
    assert.equal(neighborBlock, ownBlock, `${block.name} block drifted between glp-order-card.js and glp-card.js`);
  });
}
