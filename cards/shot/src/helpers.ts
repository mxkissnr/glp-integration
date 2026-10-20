// Pure helpers shared with glp-order-card.js through the GLP-SHARED marker
// blocks (test/token-sync.test.js), split out of glp-card.ts (#180). The
// marker pairs must stay byte-identical with the neighbor copy, so each type
// annotation sits outside its marker pair.

// ─── bean helpers ────────────────────────────────────────────────────────────

// Days since roast; accepts DD.MM.YYYY and YYYY-MM-DD (same as the GLP app)
function roastAgeDays(str: string | null | undefined): number | null {
  if (!str || typeof str !== 'string') return null;
  let d: Date | null = null;
  let m: RegExpMatchArray | null = str.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + parseInt(m[3]!) : parseInt(m[3]!);
    d = new Date(y, parseInt(m[2]!) - 1, parseInt(m[1]!));
  } else {
    m = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) d = new Date(parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!));
  }
  if (!d || isNaN(d as unknown as number)) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days >= 0 && days <= 730 ? days : null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  // GLP-SHARED:esc v1 — body kept byte-identical with glp-order-card.js's _esc()
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // /GLP-SHARED:esc v1
}

function safeUrl(url: string | null | undefined): string | null {
  // GLP-SHARED:safeUrl v1 — body kept byte-identical with glp-order-card.js's
  // _safeUrl() (#74 — that copy had drifted to returning the raw input,
  // losing this reasoning; re-sync it from here)
  if (!url) return null;
  // Returns u.href (the normalized/re-serialized URL), not the raw input —
  // the raw string could still contain quote/angle-bracket characters that
  // break out of an href="..." attribute even though the protocol is fine.
  try { const u = new URL(url); return (u.protocol==='http:'||u.protocol==='https:') ? u.href : null; }
  catch { return null; }
  // /GLP-SHARED:safeUrl v1
}

function parseTs(val: string | number | null | undefined): Date | null {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') return new Date(val > 1e10 ? val : val * 1000);
  return new Date(val as string);
}

function downsample(arr: number[] | null | undefined, maxPts: number): number[] {
  if (!arr || arr.length <= maxPts) return arr || [];
  const step = Math.ceil(arr.length / maxPts);
  const out  = arr.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]!);
  return out;
}

// Card chart series colors — GLP-series palette, kept in sync with the GLP-TOKENS
// --glp-series-* fallback values in STYLES and with glp-order-card.js (see CLAUDE.md).
const CC: { pres: string; flow: string; temp: string; wt: string } = { pres: '#0072b2', flow: '#c77000', temp: '#c0392b', wt: '#009e73' };

// GLP-SHARED:theme-presets v1 — the 8 approved per-machine colour theme
// presets (mxkissnr/glp-lovelace-card#87 / mxkissnr/glp-order-card#62),
// kept byte-identical (key -> {a,b} hex pair) with gaggiuino-local-profiler's
// lib/machines/theme-presets.js and with glp-order-card.js's copy — same
// contract as machines.theme, see mxkissnr/gaggiuino-local-profiler#595.
// Neither card has a theme-picker UI (YAML-config-only, see the `theme`
// setConfig() key), so unlike the app's copy there are no i18n name/hint
// labels here, just the hex values.
const THEME_PRESETS = {
  'amber-americano':   { a: '#f59e0b', b: '#f59e0b' },
  'ruby-ristretto':    { a: '#7f1d1d', b: '#7f1d1d' },
  'copper-cortado':    { a: '#c2703d', b: '#e8b4a0' },
  'twilight-turkish':  { a: '#0891b2', b: '#4338ca' },
  'marbled-macchiato': { a: '#f59e0b', b: '#ec4899' },
  'ember-espresso':    { a: '#dc4a1f', b: '#f5a623' },
  'mulberry-mocha':    { a: '#5b21b6', b: '#db2777' },
  'frosty-flat-white': { a: '#0f766e', b: '#38bdf8' },
};
// /GLP-SHARED:theme-presets v1

// Strict #rrggbb only — `accent_color`/`accent_gradient` are operator-set
// YAML, not attacker input, but they still flow into a style attribute
// (_applyMachineTheme()) so get the same validation discipline as any other
// value reaching the DOM: reject anything that isn't exactly a 6-digit hex
// triplet, never pass an unvalidated string through.
const HEX_COLOR_RE: RegExp = /^#[0-9a-fA-F]{6}$/;

export { roastAgeDays, esc, safeUrl, parseTs, downsample, CC, THEME_PRESETS, HEX_COLOR_RE };
