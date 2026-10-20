// Pure, DOM-free helpers shared with glp-lovelace-card's glp-card.js through
// the GLP-SHARED marker blocks (test/token-sync.test.js). Split out of
// glp-order-card.ts (#143). Those blocks stay byte-identical with the
// neighbor's copy, so each type annotation sits outside its marker pair.

export function _esc(s: unknown): string {
  // GLP-SHARED:esc v1 — body kept byte-identical with glp-order-card.js's _esc()
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // /GLP-SHARED:esc v1
}

// Origin: since GLP app 1.96.0 an ISO 3166-1 alpha-2 code — render flag emoji
// + localized country name; legacy free-text values render as-is. Since GLP
// app 1.120.0 a bean can have multiple origins (a blend, each with an
// optional weighting percent) — `origins` here is always an array of
// {code, percent?}; a single origin is just the one-element case. Mirrors
// originDisplay() in the app's own public-src/views/library.js.
export function _originHtml(origins: ReadonlyArray<{ code?: unknown; percent?: unknown }>, lang?: string | null): string {
  return origins.map(o => {
    const raw = o?.code;
    if (typeof raw !== 'string' || !/^[A-Z]{2}$/.test(raw.trim())) return _esc(raw);
    const code = raw.trim();
    // #90: the regional-indicator flag that used to prefix this is gone. It
    // was built at runtime from the country code, so it never showed up in a
    // source-level emoji grep — but it rendered in the OS font (a completely
    // different visual language from every other icon in the card), it is
    // absent or a plain 2-letter box on Windows, and it is politically
    // loaded for several coffee-growing regions in a way a flat country name
    // is not. Nothing is lost: the resolved country name was always rendered
    // immediately after it and still is.
    let name = code;
    try { name = new Intl.DisplayNames([lang || 'en'], { type: 'region' }).of(code) || code; } catch { /* unsupported/invalid region code, keep raw code fallback */ }
    const label = _esc(name);
    return o.percent != null ? `${label} ${_esc(o.percent)}%` : label;
  }).join(' + ');
}

export function _safeUrl(url: string | null | undefined): string | null {
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

// Strict #rrggbb-only validation for any theme colour reaching a style
// attribute/SVG gradient stop. YAML config is operator-controlled, not
// attacker input, but a hand-typed or copy-pasted config value is still
// unvalidated user input by the time it gets here — reject anything that
// isn't exactly a 6-digit hex colour (no CSS colour names/functions/keywords).
export function _validHex(s: unknown): boolean {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

export { THEME_PRESETS };
