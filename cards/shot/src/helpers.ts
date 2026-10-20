// Pure helpers for the Shot Card, split out of glp-card.ts (#180). The
// GLP-SHARED helpers shared with the Order Card now live in
// cards/shared/helpers.ts and are re-exported here under this card's names.

import { esc, safeUrl, THEME_PRESETS } from '../../shared/helpers.ts';

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

// Strict #rrggbb only — `accent_color`/`accent_gradient` are operator-set
// YAML, not attacker input, but they still flow into a style attribute
// (_applyMachineTheme()) so get the same validation discipline as any other
// value reaching the DOM: reject anything that isn't exactly a 6-digit hex
// triplet, never pass an unvalidated string through.
const HEX_COLOR_RE: RegExp = /^#[0-9a-fA-F]{6}$/;

export { roastAgeDays, esc, safeUrl, parseTs, downsample, CC, THEME_PRESETS, HEX_COLOR_RE };
