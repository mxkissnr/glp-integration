// Pure, DOM-free helpers for the Order Card, split out of glp-order-card.ts
// (#143). The GLP-SHARED helpers shared with the Shot Card now live in
// cards/shared/helpers.ts and are re-exported here under this card's names.

import { esc as _esc, safeUrl as _safeUrl, THEME_PRESETS } from '../../shared/helpers.ts';

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

// Strict #rrggbb-only validation for any theme colour reaching a style
// attribute/SVG gradient stop. YAML config is operator-controlled, not
// attacker input, but a hand-typed or copy-pasted config value is still
// unvalidated user input by the time it gets here — reject anything that
// isn't exactly a 6-digit hex colour (no CSS colour names/functions/keywords).
export function _validHex(s: unknown): boolean {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

export { _esc, _safeUrl, THEME_PRESETS };
