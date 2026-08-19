const GLP_ORDER_CARD_VERSION = '1.21.0';

// Menu items younger than this show the NEW badge (config: new_badge_days)
const NEW_BADGE_DAYS_DEFAULT = 7;

function _esc(s) {
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
function _originHtml(origins, lang) {
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

function _safeUrl(url) {
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
function _validHex(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

// GLP-SHARED:machine-icon v1 — approved detailed Gaggia Classic icon
// geometry (mxkissnr/glp-lovelace-card#87 / mxkissnr/glp-order-card#62),
// ported faithfully from the Theme Lab mockup Max approved (see
// ICON-AND-THEMES-SPEC.js in the glp-project workspace) and kept in sync
// with glp-order-card.js's copy. `id` is a per-render-instance-unique
// gradient id (this card can appear more than once on one dashboard — each
// file's constructor derives its own id under its own name) coloured via
// --glp-accent-start/-end (the mockup's --acc-a/--acc-b, renamed to this
// card's own token names); a second, fixed `${id}-steel` gradient colours
// the drip-tray mesh in silver, independent of the accent theme. `mini`
// drops fine detail (portafilter spout, steam wand tip, button
// highlights/LEDs, drip-tray mesh holes) for small render sizes, per the
// mockup's own MACHINE_BODY(id, mini).
const MACHINE_BODY = (id, mini) => `
    <!-- Seitenwand rechts inkl. Kantenlicht, volle Hoehe -->
    <path d="M72.2 2.3 L100 11 L100 130 L88 153 L72.2 153 Z" fill="url(#${id})"/>
    <path d="M72.2 2.3 L100 11 L100 130 L88 153 L72.2 153 Z" fill="#000" opacity=".26"/>
    <path d="M93.2 8.6 L100 11 L100 130 L90 149 L93.2 142 Z" fill="#fff" opacity=".13"/>

    <!-- Frontflaeche Korpus -->
    <path d="M13 2.4 L72.2 2.3 L72.2 71.9 L10.2 71.9 L10.2 5.2 A2.8 2.8 0 0 1 13 2.4 Z" fill="url(#${id})"/>
    <path d="M72.2 3 L72.2 71" stroke="#fff" opacity=".22" stroke-width="3"/>

    <!-- Mittelblock: Korpus kragt links darueber, dort ragt der Siebtraeger ins Freie -->
    <path d="M20 72 L94 72 L94 122 L24 122 Z" fill="#2b2b31"/>
    <path d="M20 72 L94 72 L94 77 L20.6 77 Z" fill="#000" opacity=".3"/>

    <!-- Bruehgruppe + Siebtraeger (ragt nach links ins Freie) -->
    <rect x="42" y="71.5" width="16" height="10.5" rx="2.2" fill="#b9bec5"/>
    ${mini ? '' : '<path d="M47 82 L53 82 L52 87.5 L48 87.5 Z" fill="#8f959d"/>'}
    <path d="M20.5 91 L45 84" stroke="#26262c" stroke-width="6.6" stroke-linecap="round"/>
    <circle cx="18.6" cy="91.6" r="5.9" fill="#ded8ca" stroke="#26262c" stroke-width="1.2"/>

    <!-- Dampflanze RECHTS: Gummimanschette oben, Chromrohr nach unten -->
    <path d="M84.2 72 C85.2 78 84.6 82 84 88" stroke="#26262c" stroke-width="5" stroke-linecap="round"/>
    <path d="M84 88 C83.5 101 83 115 83.5 130" stroke="#a3a9b1" stroke-width="2.6" stroke-linecap="round"/>
    ${mini ? '' : '<path d="M21.5 97 L21.5 130" stroke="#9aa0a8" stroke-width="2" stroke-linecap="round"/>'}

    <!-- Tropfschale: silbernes Lochblech in dunklem Rahmen, breiter als der Korpus -->
    <path d="M17 122 L93 122 L80 134 L0 134 Z" fill="#25252b"/>
    <path d="M20.5 123.4 L88.5 123.4 L77 132.6 L4 132.6 Z" fill="url(#${id}-steel)"/>
    ${mini ? '' : `
    <circle cx="28" cy="126" r="1.5" fill="#4a4a52"/>
    <circle cx="39" cy="126" r="1.5" fill="#4a4a52"/>
    <circle cx="50" cy="126" r="1.5" fill="#4a4a52"/>
    <circle cx="61" cy="126" r="1.5" fill="#4a4a52"/>
    <circle cx="72" cy="126" r="1.5" fill="#4a4a52"/>
    <circle cx="21" cy="130.4" r="1.5" fill="#4a4a52"/>
    <circle cx="32" cy="130.4" r="1.5" fill="#4a4a52"/>
    <circle cx="43" cy="130.4" r="1.5" fill="#4a4a52"/>
    <circle cx="54" cy="130.4" r="1.5" fill="#4a4a52"/>
    <circle cx="65" cy="130.4" r="1.5" fill="#4a4a52"/>`}

    <!-- Sockelfront: senkrecht, rechte Kante trifft die Seitenwand -->
    <path d="M0 134 L80 134 L84 155 L0 155 Z" fill="#2b2b31"/>
    <path d="M0 134 L80 134 L80.8 138 L0 138 Z" fill="#fff" opacity=".07"/>

    <!-- Fuesse -->
    <rect x="4.5" y="155" width="7.5" height="4.4" rx="1.5" fill="#26262c"/>
    <rect x="66" y="155" width="7.5" height="4.4" rx="1.5" fill="#26262c"/>

    <!-- Bedienfeld: 3 Wipptasten -->
    <rect x="20.5" y="13.6" width="9" height="14.8" rx="2.1" fill="#26262c"/>
    <rect x="33" y="13.6" width="9" height="14.8" rx="2.1" fill="#26262c"/>
    <rect x="45.5" y="13.6" width="9" height="14.8" rx="2.1" fill="#26262c"/>
    ${mini ? '' : `
    <rect x="21.6" y="14.9" width="6.8" height="5.4" rx="1.4" fill="#fff" opacity=".13"/>
    <rect x="34.1" y="14.9" width="6.8" height="5.4" rx="1.4" fill="#fff" opacity=".13"/>
    <rect x="46.6" y="14.9" width="6.8" height="5.4" rx="1.4" fill="#fff" opacity=".13"/>
    <rect x="23.7" y="31.8" width="2.6" height="2.2" rx=".8" fill="#d9422e"/>
    <rect x="36.2" y="31.8" width="2.6" height="2.2" rx=".8" fill="#d9422e"/>
    <rect x="48.7" y="31.8" width="2.6" height="2.2" rx=".8" fill="#d9422e"/>`}

    <!-- Dampfknopf: liegender Zylinder auf der Seitenwand -->
    <rect x="74" y="23.4" width="9" height="8" fill="#26262c"/>
    <rect x="80.7" y="20.5" width="17" height="13.6" rx="6.8" fill="#212126"/>
    <ellipse cx="82.6" cy="27.3" rx="2.4" ry="6.8" fill="#3b3b43"/>
    ${mini ? '' : '<rect x="81.4" y="23.4" width="1.7" height="7.8" rx=".85" fill="#fff" opacity=".2"/>'}`;

const MACHINE_ICON_MINI = (id) => `
    <svg viewBox="0 0 100 162" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}" x1="6" y1="0" x2="92" y2="145" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="var(--glp-accent-start)"/>
          <stop offset="1" stop-color="var(--glp-accent-end)"/>
        </linearGradient>
        <linearGradient id="${id}-steel" x1="0" y1="123" x2="0" y2="133" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#d3d6db"/>
          <stop offset="1" stop-color="#9ba1a9"/>
        </linearGradient>
      </defs>
      ${MACHINE_BODY(id, true)}
    </svg>`;
// /GLP-SHARED:machine-icon v1

// GLP-SHARED:icons v1 — drawn stroke icons replacing the cards' emoji glyphs
// (glp-order-card#90 / glp-lovelace-card#120), kept byte-identical between
// glp-card.js and glp-order-card.js.
//
// Why a block per card instead of an import: a Lovelace custom element is a
// single file served straight to the browser, so neither card can import the
// app's public-src/icons.js. The style is deliberately the same as that file
// (viewBox 0 0 24 24, stroke-width 1.8, currentColor, no fill) so the app and
// the cards read as one system.
//
// Why this replaces emoji at all: emoji render in the OS font, so they change
// shape per platform, ignore the card's colour, cannot align to a text
// baseline, and — the actual functional problem — collapse distinctions the UI
// needs. The six default drinks used exactly two emoji between them (three
// drinks on U+2615, three on U+1F95B), so the icon carried no information.
// The six drink icons below are drawn to differ: cup size, fill level, foam.
//
// One ICONS object rather than one const per icon, deliberately: this block is
// byte-identical in both cards, so it necessarily holds icons that a given
// card has no use for (glp-order-card.js never renders a flask). As separate
// consts that would be a standing no-unused-vars error per unused icon in
// whichever card doesn't need it, and the usual fix — an eslint-disable over
// the block — would also blind the rule to genuinely dead icons later.
//
// Every icon inherits currentColor, so a themed accent line, a muted label and
// a semantic colour all work without a second copy of the icon. ICONS.of()
// takes an optional extra class for sizing/colour at the call site.
const GLP_ICON_PATHS = {
  // --- drinks -----------------------------------------------------------
  // One shared demitasse silhouette for the three straight espresso drinks;
  // they differ only in fill level, which is the honest difference between
  // them (same basket, same cup, more or less water through it).
  ristretto:  '<path d="M16.5 8.5h1a2.5 2.5 0 0 1 0 5h-1"/><path d="M5 8.5h11.5v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z"/><path d="M6.5 15.2h8.6"/>',
  espresso:   '<path d="M16.5 8.5h1a2.5 2.5 0 0 1 0 5h-1"/><path d="M5 8.5h11.5v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z"/><path d="M5.6 13.2h10.4"/>',
  lungo:      '<path d="M16.5 8.5h1a2.5 2.5 0 0 1 0 5h-1"/><path d="M5 8.5h11.5v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z"/><path d="M5.1 10.6h11.2"/>',
  // Cappuccino: domed foam cap standing proud of the rim.
  cappuccino: '<path d="M16.5 8.5h1a2.5 2.5 0 0 1 0 5h-1"/><path d="M5 8.5h11.5v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z"/><path d="M5.4 8.5a5.8 5.8 0 0 1 11 0"/><path d="M5.8 12h10"/>',
  // Latte macchiato: tall glass, layered.
  latte:      '<path d="M7.5 4.5h9l-1 14a2 2 0 0 1-2 1.8h-3a2 2 0 0 1-2-1.8l-1-14z"/><path d="M7.9 9h8.2M8.2 13h7.6"/>',
  // Flat white: wide shallow cup, thin microfoam layer, latte-art dot.
  flat_white: '<path d="M17.5 9.5h1a2.2 2.2 0 0 1 0 4.4h-1"/><path d="M3.5 9.5h14v3.6a4.4 4.4 0 0 1-4.4 4.4H7.9a4.4 4.4 0 0 1-4.4-4.4V9.5z"/><path d="M4.2 12h12.6"/><circle cx="10.5" cy="14.4" r="1.1"/>',
  // --- state, action, status --------------------------------------------
  coffee:     '<path d="M17 8h1a3 3 0 0 1 0 6h-1M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z"/><path d="M8 2v2M12 2v2"/>',
  check:      '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  close:      '<path d="M6 6l12 12M18 6 6 18"/>',
  heat:       '<path d="M12 3.5c3 3.2 4.5 5.8 4.5 8a4.5 4.5 0 0 1-9 0c0-2.2 1.5-4.8 4.5-8z"/><path d="M9.5 20.5h5"/>',
  droplet:    '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  steam:      '<path d="M7 20c0-2 1.6-2.4 1.6-4.4S7 12.6 7 10.6"/><path d="M12 20c0-2.4 1.8-2.9 1.8-5.3S12 10.3 12 8"/><path d="M17 20c0-2 1.6-2.4 1.6-4.4S17 12.6 17 10.6"/>',
  warning:    '<path d="M12 4.5 21 19.5H3L12 4.5z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="0.6"/>',
  gear:       '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>',
  plug:       '<path d="M9 3.5v5M15 3.5v5"/><path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0v-3z"/><path d="M12 17v3.5"/>',
  cart:       '<path d="M3 4.5h2.2l2.3 10.4h9.6l2.1-7.4H6.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
  shower:     '<path d="M4.5 8.5h15v2.6a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3V8.5z"/><path d="M8 17.5v2M12 17.5v3M16 17.5v2"/>',
  wrench:     '<path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.5 2.5-2-2z"/>',
  refresh:    '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  circle:     '<circle cx="12" cy="12" r="8"/>',
  // Waiting/queued. An hourglass rather than a clock: a clock reads as "when",
  // an hourglass as "not yet" — and this marks an order sitting unconfirmed,
  // not a time of day.
  hourglass:  '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5v3.2c0 1.6 1.2 2.9 4 5.3 2.8-2.4 4-3.7 4-5.3V3.5"/><path d="M8 20.5v-3.2c0-1.6 1.2-2.9 4-5.3 2.8 2.4 4 3.7 4 5.3v3.2"/>',
  flask:      '<path d="M10 3.5v6L5.2 18a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L14 9.5v-6"/><path d="M9 3.5h6"/><path d="M7.4 14h9.2"/>',
  // Not a party popper — a small burst, so it still reads at 16px and keeps
  // the card's tone. Used for the completed-order confirmation.
  celebrate:  '<path d="M12 3v3.5M12 17.5V21M21 12h-3.5M6.5 12H3M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5M18.4 18.4l-2.5-2.5M8.1 8.1 5.6 5.6"/>',
  // Replaces the ★/☆ text characters in the rating row. The filled state is a
  // class on the element, not a second path — it is the same shape either way.
  star:       '<path d="M12 3.8l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 10l5.9-.9L12 3.8z"/>',
};

const ICONS = {
  has: (name) => Object.prototype.hasOwnProperty.call(GLP_ICON_PATHS, name),
  // Returns '' for an unknown name rather than an empty <svg>: callers fall
  // back to other content (e.g. a stored emoji on a user-created menu entry),
  // and an empty string is what makes `ICONS.of(x) || fallback` work.
  of: (name, cls = '') => (ICONS.has(name)
    ? `<svg class="glp-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLP_ICON_PATHS[name]}</svg>`
    : ''),
};
// /GLP-SHARED:icons v1

// `emoji` on a menu entry is a PERSISTED DATA FIELD, not styling — it's
// defined app-side in DEFAULT_MENU (gaggiuino-local-profiler lib/constants.js)
// and writable through POST/PUT api/orders/menu, so it stays exactly as-is,
// no migration. This only changes how it renders: the six default drinks
// (espresso/ristretto/lungo/cappuccino/latte/flat_white — the only ids that
// exist in GLP_ICON_PATHS) get a drawn icon instead; any other id — a
// user-created entry, whose id is always `m_${Date.now()}` server-side and
// so can never collide with the six known ones — falls back to that entry's
// own stored emoji character, escaped the same way any other user-supplied
// text reaching innerHTML is.
function _menuIconHtml(item) {
  return ICONS.of(item?.id) || _esc(item?.emoji);
}

// Per-instance-unique suffix for this card's machine-icon gradient ids — a
// dashboard can render more than one glp-order-card, and SVG gradient ids
// are global to the document once in the DOM, so a fixed id would let one
// instance's gradient silently apply to another's icon.
let _glpOrderCardInstanceSeq = 0;

const STYLES = `
  /* GLP-TOKENS v1 — shared contract between glp-card.js and glp-order-card.js, keep byte-identical */
  :host {
    --glp-radius:    var(--ha-card-border-radius, 12px);
    --glp-radius-sm: 4px;
    --glp-bg:      var(--ha-card-background, var(--card-background-color, #18181b));
    --glp-surface: var(--secondary-background-color, #27272a);
    --glp-border:  var(--divider-color, #3f3f46);
    --glp-text:    var(--primary-text-color, #e4e4e7);
    --glp-sub:     var(--secondary-text-color, #a1a1aa);
    /* --glp-accent-start/--glp-accent-end: per-machine colour theme (8
       curated presets or a custom flat colour/gradient, see the
       theme/accent_color/accent_gradient setConfig() keys and this file's
       theme-resolving method). Both default directly to HA's --primary-color,
       so a card with no theme configured renders identically to before this
       existed (flat colour = both stops equal). The theme-resolving method
       sets these as inline styles on the host (highest-priority cascade,
       same pattern as _applySemanticColorContrast() below) only when a
       theme is configured; otherwise they fall through to these stylesheet
       defaults.
       --glp-accent itself is kept as the legacy single-colour alias (e.g.
       glp-card.js's preheat progress bar fill, or any spot in either card
       that only ever needed one accent value) and MUST derive FROM
       --glp-accent-start (not the other way around) — it resolves through
       --glp-accent-start via the cascade, so it also picks up a configured
       theme's first stop automatically. Getting this direction backwards
       (--glp-accent-start deriving from --glp-accent) would leave
       --glp-accent permanently pinned to --primary-color, silently ignoring
       any configured theme wherever old code still reads --glp-accent
       directly. Likewise --glp-accent-end derives from --glp-accent-start
       (not an independent --primary-color default) so that code which only
       ever sets --glp-accent-start (forgetting the end stop) degrades to a
       flat colour instead of an unintentional two-tone mismatch. */
    --glp-accent-start: var(--primary-color, #f59e0b);
    --glp-accent-end:   var(--glp-accent-start);
    --glp-accent:       var(--glp-accent-start);
    /* --glp-accent-text: the readable-on-accent text/icon color, for
       anything rendering directly on a full-strength --glp-accent fill (e.g.
       glp-order-card.js's .order-btn). --glp-accent can be ANY HA theme's
       --primary-color — GLP's own defaults are light/medium amber, but a
       common theme primary like Material "Indigo 900" #1a237e is dark
       (luminance .029), and black text on it measures ~1.1:1 (unreadable) —
       this card previously hardcoded dark text unconditionally, safe only by
       coincidence with GLP's own amber defaults. --glp-accent-text is instead
       picked at runtime by _applySemanticColorContrast() from the LUMINANCE
       OF THE RESOLVED --glp-accent-start/--glp-accent-end (a separate,
       independent input from --glp-bg's luminance, which drives
       --glp-ok/--glp-warn/--glp-err above — theme darkness and accent
       darkness are orthogonal). When a gradient theme is active (start !==
       end), the DARKER of the two stops is used — a fill sweeping across
       both (e.g. glp-order-card.js's .order-btn) must stay readable against
       the worst case, not just the first stop; a flat theme has start ===
       end and reduces to the original single-color check. Uses pure #000/
       #fff with the same 0.179 WCAG flip-point threshold: at that exact
       crossover luminance, black and white text both measure ~4.58:1 against
       it, and either color's contrast only increases moving away from that
       point — so, unlike --glp-ok/--glp-warn/--glp-err (which had to be
       checked against specific known theme values), #000/#fff at the 0.179
       split is a mathematical guarantee of >=4.58:1 against ANY possible
       accent color. Verified against real-world values: GLP Dark #f59e0b
       (black text 9.78:1), GLP Light #d97706 (6.59:1), HA frontend default
       #03a9f4 (7.99:1) all correctly pick black; Material Indigo 900
       #1a237e correctly picks white (13.24:1) instead of the old hardcoded
       dark text's 1.13:1. glp-card.js has no full-strength accent fill with
       text on it today (--glp-accent is only a progress-bar fill), so this
       token is unused there for that reason alone — kept in sync anyway so
       the shared block doesn't drift, and so _applySemanticColorContrast()
       stays identical in both files. */
    --glp-accent-text: #000;
    /* --glp-ok/--glp-warn/--glp-err deliberately do NOT chain through HA's
       own --success-color/--warning-color/--error-color. Checked both HA
       frontend's own out-of-the-box defaults (same for light AND dark mode —
       home-assistant/frontend src/resources/theme/color/color.globals.ts)
       and glp-ha-theme.yaml's "GLP Light" theme; neither reliably clears the
       4.5:1 WCAG AA floor this card's small/bold badge, banner and
       star-rating text needs against a light background. Measured (relative
       luminance contrast) vs white:
         HA frontend default success-color #43a047: 3.30:1 (fails)
         HA frontend default warning-color #ffa600: 1.96:1 (fails badly)
         HA frontend default error-color   #db4437: 4.29:1 (fails, barely)
         glp-ha-theme.yaml "GLP Light" success-color #16a34a: 3.30:1 (fails)
         glp-ha-theme.yaml "GLP Light" warning-color #d97706: 3.19:1 (fails)
         glp-ha-theme.yaml "GLP Light" error-color   #dc2626: 4.83:1 (passes,
           but the point stands — the fallback chain isn't the guarantee)
       Trusting an arbitrary theme's value would still ship a contrast
       failure under HA's own vanilla defaults, so all three are fixed,
       self-controlled constants, applied by JS based on the LUMINANCE OF
       THE CARD'S OWN RESOLVED --glp-bg (_applySemanticColorContrast(),
       called from _render() right after the shadow DOM is (re)built) —
       not by prefers-color-scheme/OS preference and not by a data-theme
       attribute. Neither exists reliably for a Lovelace custom element, and
       OS preference can flatly mismatch the active HA theme (dark OS +
       light HA theme, or vice versa) — exactly the case this needs to get
       right, since that's the actual bug being fixed here. The dark values
       below are the pre-JS declared defaults; _applySemanticColorContrast()
       overwrites them as an inline style on the host, which always wins
       over these stylesheet declarations regardless of media query state.
       Measured:
         --glp-ok   dark  #22c55e vs dark bg (#18181b): 7.78:1
         --glp-warn dark  #eab308 vs dark bg (#18181b): 9.24:1
         --glp-err  dark  #ef4444 vs dark bg (#18181b): 4.71:1
         --glp-ok   light #15803d vs white:             5.02:1
         --glp-warn light #a16207 vs white:             4.92:1
         --glp-err  light #dc2626 vs white:             4.83:1
       --glp-sub (var(--secondary-text-color)) needed no such handling — it's
       already HA's own theme var and measured fine both ways: dark fallback
       #a1a1aa vs dark bg 6.91:1; GLP Light's secondary-text-color #52525b
       vs white 7.73:1. */
    --glp-ok:      #22c55e;
    --glp-warn:    #eab308;
    --glp-err:     #ef4444;
    /* --glp-fs-1..6 / --glp-sp-1..6: the six-step type scale and spacing
       ladder introduced by the "Instrument" redesign (glp-order-card#90,
       glp-lovelace-card#120). Both cards used to carry a long tail of ad-hoc
       values — 14 distinct font-sizes in glp-order-card.js, 28 in
       glp-card.js, stepping in 0.02rem increments — which reads as a UI that
       was never actually designed. Every font-size, gap and padding resolves
       through these tokens; a bare literal is a regression.
       The smallest step is deliberately 0.8125rem and NOT the 0.5–0.6rem the
       cards used to reach for: the border diet removes boxes as a grouping
       device, and it must not come back as hairline micro-typography nobody
       can read.
       Radii are deliberately NOT part of this ladder. --glp-radius stays
       HA-led (var(--ha-card-border-radius)) and is scoped to the outer
       .card/ha-card shell only, so a card keeps matching the dashboard it
       sits on — pinning it to a fixed redesign value would break exactly
       that. Every other corner (buttons, tiles, inputs, status/tag pills)
       resolves through --glp-radius-sm instead, a fixed 4px (the redesign
       plan's control radius, glp-project/redesign-2026-08/PLAN.md §2) —
       controls read visibly flatter than the card shell around them, which
       is the point: two distinct radii, not one value reused everywhere. */
    --glp-fs-1: 0.8125rem;
    --glp-fs-2: 0.875rem;
    --glp-fs-3: 1rem;
    --glp-fs-4: 1.25rem;
    --glp-fs-5: 1.625rem;
    --glp-fs-6: 2.25rem;
    --glp-sp-1: 4px;
    --glp-sp-2: 8px;
    --glp-sp-3: 12px;
    --glp-sp-4: 16px;
    --glp-sp-5: 24px;
    --glp-sp-6: 32px;
    /* --glp-aline: the accent used as a THIN LINE (2px underline, active-row
       edge marker, focus ring) rather than as a fill. WCAG 1.4.11 asks 3:1
       for such non-text indicators, and three of the eight curated machine
       themes miss that as a line against a dark background — measured
       against the app's dark ground: Ruby Ristretto #7f1d1d 1.88:1,
       Mulberry Mocha #5b21b6 2.09:1, Twilight Turkish #4338ca 2.38:1. That
       is a pre-existing gap, not one the redesign introduced; it only became
       visible because the redesign replaces borders with accent lines as a
       grouping device.
       Resolved at runtime by _applySemanticColorContrast() below, because
       the card's background is whatever the user's HA theme resolved to —
       a value no stylesheet here can know up front. The accent is blended
       toward --glp-text until it clears 3:1; themes that already pass are
       left untouched, so the seven-of-eight common case is byte-exact.
       FILLS ARE NEVER TOUCHED: --glp-accent-start/-end keep their exact
       configured hex values, so gradients, buttons and the machine icon
       render precisely as before. Gradients belong on surfaces, not on
       hairlines. */
    --glp-aline: var(--glp-accent-start);
    --glp-series-pres:   #0072b2;
    --glp-series-flow:   #c77000;
    --glp-series-temp:   #c0392b;
    --glp-series-weight: #009e73;
  }
  /* /GLP-TOKENS v1 */

  /* legacy internal aliases — rest of this file still reads these names;
     hybrid theming happens one level up, in the GLP-TOKENS block above.
     --oc-accent maps to --glp-err (this card's "amber" is its own CTA/brand
     color below, mapped separately to --glp-accent — see .order-btn etc). */
  :host {
    --oc-bg:       var(--glp-bg);
    --oc-surface:  var(--glp-surface);
    --oc-surface2: color-mix(in srgb, var(--glp-text) 4%, transparent);
    --oc-border:   var(--glp-border);
    --oc-text:     var(--glp-text);
    --oc-sub:      var(--glp-sub);
    --oc-accent:   var(--glp-err);
    --oc-amber:    var(--glp-warn);
    --oc-green:    var(--glp-ok);
  }
  ha-card {
    background: transparent;
    border: none;
    box-shadow: none;
  }
  /* Base sizing for every drawn icon inserted via ICONS.of() (GLP-SHARED:icons
     v1 above) — 1em locks it to whatever font-size token its container
     already resolves through, so a coffee cup dropped into a button label vs.
     a status line vs. a menu tile never needs a second, size-specific copy of
     this rule. currentColor is what lets the same icon sit inside a muted
     label, an accepted-green status line or the accent-filled order button
     with no per-context markup. */
  .glp-i { width: 1em; height: 1em; stroke: currentColor; fill: none; stroke-width: 1.8; vertical-align: -0.15em; flex-shrink: 0; }
  .card {
    background: var(--oc-bg);
    border: 1px solid var(--oc-border);
    border-radius: var(--glp-radius);
    box-shadow: var(--ha-card-box-shadow, none);
    padding: var(--glp-sp-5);
    font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif);
    color: var(--oc-text);
  }
  /* Labels were uppercase + letter-spaced everywhere (#90) — sentence case,
     small (--glp-fs-1) and muted reads calmer and needs no tracking to stay
     legible at this size. */
  .header {
    display: flex; align-items: center; gap: var(--glp-sp-2);
    font-size: var(--glp-fs-1); font-weight: 700; color: var(--oc-sub);
    margin-bottom: var(--glp-sp-4);
  }
  /* Machine icon badge (#62): small colour swatch in the card's resolved
     theme (see MACHINE_ICON_MINI/_machineGlyphHtml()). .header sizes it next
     to the title; .status is inline within the multi-machine status line. */
  .machine-glyph { flex-shrink: 0; line-height: 0; }
  .machine-glyph svg { width: 100%; height: 100%; display: block; }
  .machine-glyph.header { width: 12px; height: 19.4px; }
  .machine-glyph.status {
    width: 9px; height: 14.6px; display: inline-block;
    vertical-align: -2px; margin-right: 4px;
  }
  /* Not clickable — border diet (#90) drops the full frame in favour of a
     single accent-coloured edge, same treatment as .status-card below. */
  .machine-off {
    background: color-mix(in srgb, var(--oc-accent) 8%, transparent);
    border-left: 2px solid var(--oc-accent);
    border-radius: var(--glp-radius-sm); color: var(--oc-accent); font-size: var(--glp-fs-2); font-weight: 600;
    text-align: center; padding: var(--glp-sp-4);
  }

  /* Menu grid */
  .menu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: var(--glp-sp-3);
    margin-bottom: var(--glp-sp-4);
  }
  .menu-item {
    background: var(--oc-surface);
    border: 1px solid var(--oc-border);
    border-radius: var(--glp-radius-sm);
    padding: var(--glp-sp-3) var(--glp-sp-2);
    text-align: center;
    cursor: pointer;
    transition: border-color .18s, background .18s;
    user-select: none;
  }
  .menu-item:hover { border-color: color-mix(in srgb, var(--oc-text) 18%, transparent); background: color-mix(in srgb, var(--oc-text) 8%, transparent); }
  .menu-item.selected {
    /* --glp-aline, not raw --glp-accent: this border is an active-item edge
       marker (the token's own use case), not a fill — .selected's background
       tint below keeps the raw accent for that. */
    border-color: var(--glp-aline);
    background: color-mix(in srgb, var(--glp-accent) 12%, transparent);
  }
  /* The drink icon is the tile's primary recognition cue — it is what the eye
     lands on before the name. It carries that weight at the top of the scale
     and in text colour, NOT muted: a 1.8-weight stroke drawing at label colour
     reads far lighter than the saturated emoji it replaced, and a tile whose
     icon recedes into the background is a step backwards from what was there
     before, however much cleaner it is in isolation. */
  .menu-item-icon { font-size: var(--glp-fs-6); margin-bottom: var(--glp-sp-1); line-height: 1; color: var(--oc-text); }
  .menu-item.selected .menu-item-icon { color: var(--glp-accent); }
  .menu-item-name  { font-size: var(--glp-fs-1); font-weight: 500; color: var(--oc-sub); }
  .menu-item.selected .menu-item-name { color: var(--oc-text); }

  /* Order form */
  .order-form { display: flex; flex-direction: column; gap: var(--glp-sp-3); margin-bottom: var(--glp-sp-1); }
  .note-input {
    background: var(--oc-surface2); border: 1px solid var(--oc-border);
    border-radius: var(--glp-radius-sm); color: var(--oc-text); font-family: inherit;
    font-size: var(--glp-fs-2); padding: var(--glp-sp-3); outline: none; width: 100%; box-sizing: border-box;
    transition: border-color .18s, background .18s;
  }
  .note-input::placeholder { color: var(--oc-sub); }
  /* --glp-aline for the focus ring — same active-marker case as
     .menu-item.selected above. */
  .note-input:focus { border-color: var(--glp-aline); background: color-mix(in srgb, var(--oc-text) 5%, transparent); }
  /* Gradient stays a surface fill (#90 — "gradients belong on surfaces, not
     hairlines"), only the ink resolves through the redesign: --glp-accent-text
     is picked at runtime off the darker of the two gradient stops so button
     text stays readable against any configured theme, see GLP-TOKENS above. */
  .order-btn {
    width: 100%; padding: var(--glp-sp-4); border: none; border-radius: var(--glp-radius-sm);
    font-size: var(--glp-fs-2); font-weight: 800; letter-spacing: .01em; cursor: pointer;
    font-family: inherit; color: var(--glp-accent-text);
    background: linear-gradient(135deg, var(--glp-accent-start), var(--glp-accent-end));
    transition: background .15s, opacity .15s;
  }
  .order-btn:disabled { opacity: .4; cursor: default; background: var(--oc-surface); color: var(--oc-sub); }
  .order-btn:not(:disabled):hover {
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--glp-accent-start) 90%, var(--oc-text) 10%),
      color-mix(in srgb, var(--glp-accent-end) 90%, var(--oc-text) 10%));
  }

  /* Status card — not clickable, so the border diet (#90) replaces the full
     frame with a single semantic-coloured edge; .pending keeps the machine's
     own theme accent (it's an "in progress" state, not a semantic colour),
     everything else already had a semantic --oc-* token to line up with. */
  .status-card {
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-4);
    display: flex; flex-direction: column; gap: var(--glp-sp-2);
    animation: oc-fade .3s ease-out both;
  }
  @keyframes oc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .status-card.pending  { background: color-mix(in srgb, var(--glp-accent) 10%, transparent); border-left: 2px solid var(--glp-aline); }
  .status-card.accepted { background: color-mix(in srgb, var(--oc-green) 10%, transparent); border-left: 2px solid var(--oc-green); }
  .status-card.done     { background: color-mix(in srgb, var(--oc-green) 8%, transparent); border-left: 2px solid var(--oc-green); }
  .status-card.declined { background: color-mix(in srgb, var(--oc-accent) 8%, transparent); border-left: 2px solid var(--oc-accent); }
  .status-item  { font-size: var(--glp-fs-3); font-weight: 700; letter-spacing: -.01em; }
  .status-line  { font-size: var(--glp-fs-1); color: var(--oc-sub); }
  .status-eta   { font-size: var(--glp-fs-2); font-weight: 700; color: var(--oc-green); }
  .status-card.accepted .status-eta { animation: oc-pulse 2s ease-in-out infinite; }
  @keyframes oc-pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  .status-decline { font-size: var(--glp-fs-1); color: var(--oc-accent); }
  .status-done-msg { font-size: var(--glp-fs-3); font-weight: 800; color: var(--oc-green); letter-spacing: -.01em; }
  .shot-summary {
    margin-top: var(--glp-sp-3);
    background: var(--oc-surface2);
    border-radius: var(--glp-radius-sm);
    padding: var(--glp-sp-3) var(--glp-sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--glp-sp-2);
  }
  .shot-summary-meta {
    display: flex;
    gap: var(--glp-sp-3);
    font-size: var(--glp-fs-1);
    color: var(--oc-sub);
  }
  .shot-summary-profile {
    font-size: var(--glp-fs-2);
    font-weight: 700;
    color: var(--oc-text);
  }
  .shot-chart { width: 100%; height: 80px; display: block; }
  .shot-chart-legend { display: flex; gap: var(--glp-sp-3); flex-wrap: wrap; margin-top: var(--glp-sp-1); }
  .shot-chart-legend-item { display: flex; align-items: center; gap: var(--glp-sp-1); font-size: var(--glp-fs-1); color: var(--oc-sub); }
  .shot-chart-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  /* Badge padding stays a literal, not a ladder step: 1px/5px is below the
     ladder's 4px floor, and rounding up would roughly quadruple this pill's
     height — it needs to stay a tight inline mark, not a box. */
  .menu-badge { display: inline-block; font-size: var(--glp-fs-1); font-weight: 600; padding: 1px 5px; border-radius: var(--glp-radius-sm); vertical-align: middle; margin-left: var(--glp-sp-1); line-height: 1.5; }
  /* Not clickable — border diet drops the frame, the tint alone still reads
     as a badge at this size. */
  .menu-badge-new { background: color-mix(in srgb, var(--oc-green) 18%, transparent); color: var(--oc-green); }
  .menu-badge-trend { background: color-mix(in srgb, var(--oc-accent) 15%, transparent); color: var(--oc-accent); }
  .menu-section-title { font-size: var(--glp-fs-1); font-weight: 600; color: var(--oc-sub); margin: 0 0 var(--glp-sp-2); display: flex; align-items: center; gap: var(--glp-sp-1); }
  .new-order-btn {
    margin-top: var(--glp-sp-3); width: 100%; background: var(--oc-surface); border: 1px solid var(--oc-border);
    border-radius: var(--glp-radius-sm); color: var(--oc-sub); font-family: inherit; font-weight: 600;
    font-size: var(--glp-fs-1); padding: var(--glp-sp-2) var(--glp-sp-3); cursor: pointer; transition: all .15s;
  }
  .new-order-btn:hover { border-color: color-mix(in srgb, var(--oc-text) 22%, transparent); color: var(--oc-text); background: color-mix(in srgb, var(--oc-text) 7%, transparent); }
  .loading { color: var(--oc-sub); font-size: var(--glp-fs-2); text-align: center; padding: var(--glp-sp-5) 0; }

  /* Variant picker */
  .variant-label { font-size: var(--glp-fs-1); font-weight: 600; color: var(--oc-sub); margin: var(--glp-sp-1) 0 var(--glp-sp-2); }
  .variant-grid { display: flex; flex-wrap: wrap; gap: var(--glp-sp-2); margin-bottom: var(--glp-sp-1); }
  .variant-chip {
    background: var(--oc-surface); border: 1px solid var(--oc-border);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-2) var(--glp-sp-4); font-size: var(--glp-fs-1); cursor: pointer;
    color: var(--oc-sub); transition: all .15s; user-select: none;
  }
  .variant-chip:hover { border-color: color-mix(in srgb, var(--oc-text) 20%, transparent); color: var(--oc-text); }
  .variant-chip.selected { border-color: var(--glp-aline); background: color-mix(in srgb, var(--glp-accent) 14%, transparent); color: var(--oc-text); font-weight: 700; }

  /* Bean description info box (shown when a bean variant is selected) — not
     clickable, so it groups through the surface fill alone, no border. */
  .bean-info {
    background: var(--oc-surface);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-2) var(--glp-sp-3); margin: var(--glp-sp-1) 0 var(--glp-sp-2);
    font-size: var(--glp-fs-1); line-height: 1.45; color: var(--oc-sub);
  }
  .bean-info-notes { color: var(--oc-text); font-style: italic; margin-bottom: 3px; }
  .bean-info-row { display: flex; gap: var(--glp-sp-1); }
  .bean-info-label {
    font-weight: 600; font-size: var(--glp-fs-1);
    color: var(--oc-sub); flex-shrink: 0;
  }

  /* Motion encodes state, it doesn't decorate (redesign plan §4) — every
     transition/animation this file defines gets neutralised here rather than
     picked off one at a time, so a future addition can't slip through
     unguarded. */
  @media (prefers-reduced-motion: reduce) {
    .menu-item, .note-input, .order-btn, .new-order-btn, .variant-chip {
      transition: none;
    }
    .status-card, .status-card.accepted .status-eta {
      animation: none;
    }
  }
`;

const STRINGS = {
  de: {
    title: 'Bestellen',
    off:    'Maschine aus — Bestellung nicht möglich',
    paused: 'Bestellungen momentan pausiert',
    order_btn: (item) => `${item} bestellen`,
    order_btn_select: 'Getränk auswählen',
    variant_select: 'Variante wählen',
    variant_label: 'Variante',
    variant_speciality: 'Spezialität',
    variant_normal: 'Normal',
    bean_origin: 'Herkunft',
    bean_variety: 'Varietät',
    bean_process: 'Aufbereitung',
    almost_ready: 'Gleich fertig!',
    note_ph: 'Notiz (optional) …',
    trending_title: 'Beliebt',
    pending: (item) => `${item} — wartet auf Bestätigung`,
    queue_pos: (pos, eta) => `Pos. ${pos} in der Warteschlange · ~${eta} Min`,
    accepted: (item, min) => `${item} — fertig in ~${min} Min`,
    done: (item) => `${item} ist fertig!`,
    declined: (item) => `${item} wurde abgelehnt`,
    decline_reason: (r) => `Grund: ${r}`,
    new_order: '+ Neue Bestellung',
    loading: 'Lade …',
    no_menu: 'Noch kein Menü konfiguriert',
    menu_all: 'Alle Getränke',
  },
  en: {
    title: 'Order',
    off:    'Machine is off — ordering not available',
    paused: 'Orders are currently paused',
    order_btn: (item) => `Order ${item}`,
    order_btn_select: 'Select a drink',
    variant_select: 'Select variant',
    variant_label: 'Variant',
    variant_speciality: 'Speciality',
    variant_normal: 'Normal',
    bean_origin: 'Origin',
    bean_variety: 'Variety',
    bean_process: 'Process',
    almost_ready: 'Almost ready!',
    note_ph: 'Note (optional) …',
    trending_title: 'Trending',
    pending: (item) => `${item} — waiting for confirmation`,
    queue_pos: (pos, eta) => `Position ${pos} in queue · ~${eta} min`,
    accepted: (item, min) => `${item} — ready in ~${min} min`,
    done: (item) => `${item} is ready!`,
    declined: (item) => `${item} was declined`,
    decline_reason: (r) => `Reason: ${r}`,
    new_order: '+ New Order',
    loading: 'Loading …',
    no_menu: 'No menu configured yet',
    menu_all: 'All drinks',
  },
  it: {
    title: 'Ordina',
    off:    'Macchina spenta — ordine non disponibile',
    paused: 'Ordini momentaneamente in pausa',
    order_btn: (item) => `Ordina ${item}`,
    order_btn_select: 'Seleziona una bevanda',
    variant_select: 'Seleziona variante',
    variant_label: 'Variante',
    variant_speciality: 'Specialità',
    variant_normal: 'Normale',
    bean_origin: 'Origine',
    bean_variety: 'Varietà',
    bean_process: 'Lavorazione',
    almost_ready: 'Quasi pronto!',
    note_ph: 'Nota (opzionale) …',
    trending_title: 'Di tendenza',
    pending: (item) => `${item} — in attesa di conferma`,
    queue_pos: (pos, eta) => `Posizione ${pos} in coda · ~${eta} min`,
    accepted: (item, min) => `${item} — pronto tra ~${min} min`,
    done: (item) => `${item} è pronto!`,
    declined: (item) => `${item} è stato rifiutato`,
    decline_reason: (r) => `Motivo: ${r}`,
    new_order: '+ Nuovo ordine',
    loading: 'Caricamento …',
    no_menu: 'Nessun menu configurato ancora',
    menu_all: 'Tutte le bevande',
  },
  fr: {
    title: 'Commander',
    off:    'Machine éteinte — commande impossible',
    paused: 'Commandes actuellement en pause',
    order_btn: (item) => `Commander ${item}`,
    order_btn_select: 'Choisir une boisson',
    variant_select: 'Choisir la variante',
    variant_label: 'Variante',
    variant_speciality: 'Spécialité',
    variant_normal: 'Normal',
    bean_origin: 'Origine',
    bean_variety: 'Variété',
    bean_process: 'Traitement',
    almost_ready: 'Presque prêt !',
    note_ph: 'Note (facultatif) …',
    trending_title: 'Tendances',
    pending: (item) => `${item} — en attente de confirmation`,
    queue_pos: (pos, eta) => `Position ${pos} dans la file · ~${eta} min`,
    accepted: (item, min) => `${item} — prêt dans ~${min} min`,
    done: (item) => `${item} est prêt !`,
    declined: (item) => `${item} a été refusé`,
    decline_reason: (r) => `Raison : ${r}`,
    new_order: '+ Nouvelle commande',
    loading: 'Chargement …',
    no_menu: 'Aucun menu configuré pour le moment',
    menu_all: 'Toutes les boissons',
  },
  es: {
    title: 'Pedir',
    off:    'Máquina apagada — no se puede pedir',
    paused: 'Los pedidos están pausados por ahora',
    order_btn: (item) => `Pedir ${item}`,
    order_btn_select: 'Selecciona una bebida',
    variant_select: 'Selecciona variante',
    variant_label: 'Variante',
    variant_speciality: 'Especialidad',
    variant_normal: 'Normal',
    bean_origin: 'Origen',
    bean_variety: 'Variedad',
    bean_process: 'Proceso',
    almost_ready: '¡Casi listo!',
    note_ph: 'Nota (opcional) …',
    trending_title: 'Tendencia',
    pending: (item) => `${item} — esperando confirmación`,
    queue_pos: (pos, eta) => `Posición ${pos} en la cola · ~${eta} min`,
    accepted: (item, min) => `${item} — listo en ~${min} min`,
    done: (item) => `¡${item} está listo!`,
    declined: (item) => `${item} fue rechazado`,
    decline_reason: (r) => `Motivo: ${r}`,
    new_order: '+ Nuevo pedido',
    loading: 'Cargando …',
    no_menu: 'Aún no hay menú configurado',
    menu_all: 'Todas las bebidas',
  },
  nl: {
    title: 'Bestellen',
    off:    'Machine uit — bestellen niet mogelijk',
    paused: 'Bestellingen zijn momenteel gepauzeerd',
    order_btn: (item) => `${item} bestellen`,
    order_btn_select: 'Kies een drankje',
    variant_select: 'Variant kiezen',
    variant_label: 'Variant',
    variant_speciality: 'Specialiteit',
    variant_normal: 'Normaal',
    bean_origin: 'Herkomst',
    bean_variety: 'Variëteit',
    bean_process: 'Verwerking',
    almost_ready: 'Bijna klaar!',
    note_ph: 'Notitie (optioneel) …',
    trending_title: 'Populair',
    pending: (item) => `${item} — wacht op bevestiging`,
    queue_pos: (pos, eta) => `Positie ${pos} in de wachtrij · ~${eta} min`,
    accepted: (item, min) => `${item} — klaar over ~${min} min`,
    done: (item) => `${item} is klaar!`,
    declined: (item) => `${item} is afgewezen`,
    decline_reason: (r) => `Reden: ${r}`,
    new_order: '+ Nieuwe bestelling',
    loading: 'Laden …',
    no_menu: 'Nog geen menu ingesteld',
    menu_all: 'Alle drankjes',
  },
};

// Interpolates ...args raw into the translation string — NOT escaped here.
// Every call site must wrap the result in _esc() before it reaches innerHTML.
function _s(key, lang, ...args) {
  const tr = STRINGS[lang] || STRINGS.en;
  const val = tr[key] ?? STRINGS.en[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

class GlpOrderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._token     = null;
    this._menu      = null;
    this._enabled   = true;
    this._selected  = null;
    this._selectedVariant = null;
    this._selectedBeanId  = null;
    this._activeBeans = null;
    this._activeOrder = null;
    this._lastShot  = null;
    this._pollTimer = null;
    this._submitting = false;
    this._noteInteracting = false;
    this._pendingRender   = false;
    this._clickBlocked    = false;
    this._queueEta        = null;
    this._clickBlockTimer = null;
    this._hassRenderTimer = null;
    this._lang = navigator.language.slice(0,2).toLowerCase();
    if (!STRINGS[this._lang]) this._lang = 'en';
    this._instanceId = ++_glpOrderCardInstanceSeq;
  }

  setConfig(config) {
    this._config = {
      title: null, switch_entity: null, glp_token: null, machine: null,
      theme: null, accent_color: null, accent_gradient: null, ...config,
    };
    // Allow explicit token override in YAML for direct-URL mode
    if (config.glp_token) this._token = String(config.glp_token);
  }

  // GLP-SHARED:app-theme-lookup v1 — reads this card's own machine's
  // app-stored theme (#701) out of `hass` state, or null when unavailable
  // (no app-side sync yet, e.g. this card's zero-config/standalone mode).
  // glp-integration forwards every machine's `theme` verbatim off the app's
  // GET /api/status `machines[]` (gaggiuino-local-profiler#701): any
  // `*_machine_status`-suffixed entity carries the WHOLE array (every
  // machine, not just the default one) as its `machines` attribute, so any
  // one such entity is enough regardless of which machine this card
  // instance represents. Matched against `this._config.machine` the same
  // "name or id" needle way this card's own machine-status-entity matching
  // works, falling back to the isDefault entry when unconfigured. Kept
  // byte-identical between glp-card.js and glp-order-card.js.
  _appMachineTheme() {
    if (!this._hass) return null;
    const statusIds = Object.keys(this._hass.states).filter(id => id.endsWith('_machine_status'));
    let machines = null;
    for (const id of statusIds) {
      const list = this._hass.states[id]?.attributes?.machines;
      if (Array.isArray(list)) { machines = list; break; }
    }
    if (!machines) return null;
    let entry = null;
    if (this._config?.machine) {
      const needle = String(this._config.machine).toLowerCase();
      entry = machines.find(m =>
        String(m.name || '').toLowerCase() === needle || String(m.id) === needle);
    }
    if (!entry) entry = machines.find(m => m.isDefault) || null;
    const theme = entry?.theme;
    if (!theme) return null;
    if (typeof theme.preset === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, theme.preset)) {
      return THEME_PRESETS[theme.preset];
    }
    // Inline literal regex (not each file's own HEX_COLOR_RE/_validHex) so
    // this shared block stays byte-identical regardless of what either
    // file's local hex-validation helper happens to be named.
    if (/^#[0-9a-fA-F]{6}$/.test(theme.a) && /^#[0-9a-fA-F]{6}$/.test(theme.b)) {
      return { a: theme.a, b: theme.b };
    }
    return null;
  }
  // /GLP-SHARED:app-theme-lookup v1

  // Machine colour theme (#62): resolves this card's effective accent theme
  // to concrete {a,b} hex stops, or null if nothing valid is
  // configured/synced. The app's own stored theme (#701, _appMachineTheme())
  // takes precedence over this card's YAML config, matching the precedence
  // already promised above. YAML precedence among itself: accent_gradient >
  // accent_color > theme preset, mirroring gaggiuino-local-profiler's
  // resolveTheme() (a custom override wins over a preset). Hex values are
  // strictly validated (#rrggbb only) since they reach a style attribute/SVG
  // gradient stop.
  _resolveTheme() {
    const fromApp = this._appMachineTheme();
    if (fromApp) return fromApp;
    const cfg = this._config;
    if (!cfg) return null;
    if (Array.isArray(cfg.accent_gradient) && cfg.accent_gradient.length === 2) {
      const [a, b] = cfg.accent_gradient;
      if (_validHex(a) && _validHex(b)) return { a, b };
    }
    if (_validHex(cfg.accent_color)) return { a: cfg.accent_color, b: cfg.accent_color };
    if (typeof cfg.theme === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, cfg.theme)) {
      return THEME_PRESETS[cfg.theme];
    }
    return null;
  }

  // Applies the resolved theme (or the unthemed default) as inline
  // --glp-accent-start/--glp-accent-end host styles. Always sets both
  // explicitly (never a no-op) so a config change from themed back to
  // unthemed can't leave a stale inline value — the unthemed branch just
  // re-states the same var(--primary-color, #f59e0b) expression the
  // GLP-TOKENS stylesheet default already uses, so behavior is identical to
  // never having set it. Called every _render(); cheap and idempotent.
  _applyThemeVars() {
    const theme = this._resolveTheme();
    this.style.setProperty('--glp-accent-start', theme ? theme.a : 'var(--primary-color, #f59e0b)');
    this.style.setProperty('--glp-accent-end', theme ? theme.b : 'var(--primary-color, #f59e0b)');
  }

  // Small colour-themed machine icon badge (#62) — sizeClass is 'header' or
  // 'status' (see the .machine-glyph CSS rules), idSuffix keeps this
  // instance's two usages (header + status line, which can render
  // simultaneously) from sharing one SVG gradient id.
  _machineGlyphHtml(sizeClass, idSuffix) {
    const id = `glp-oc-icon-${this._instanceId}-${idSuffix}`;
    return `<div class="machine-glyph ${sizeClass}">${MACHINE_ICON_MINI(id)}</div>`;
  }

  _getBase() {
    const url = this._config?.glp_url;
    if (url) {
      // _safeUrl() returns the re-serialized u.href, which for a bare origin
      // (no path) always carries a trailing slash — strip it back off so
      // callers appending `/${path}` don't end up with a double slash.
      const safe = _safeUrl(url);
      return safe ? safe.replace(/\/$/, '') : null;
    }
    // Auto-detect: card runs inside HA browser, use ingress path (no token needed)
    return window.location.origin + '/api/hassio_ingress/gaggiuino_local_profiler';
  }

  // machine (#29): optional config option for setups with more than one GLP
  // machine (the app's multi-machine mode, GLP #317). Ingress stays bound to
  // the one app instance regardless (see README — a documented limitation,
  // not a bug: there's still only one add-on), but `_getSwitchEntity()`
  // resolution and the order payload's `machine` field use it to target the
  // right machine's switch/queue display. Falls back to the previous "first
  // *_machine_status entity" behavior when unset, so existing single-machine
  // cards are unaffected.
  _findMachineStatusEntity() {
    if (!this._hass) return null;
    const candidates = Object.keys(this._hass.states).filter(id => id.endsWith('_machine_status'));
    if (this._config?.machine) {
      // GLP-SHARED:machine-match v1 — needle/needleSlug + find() predicate
      // kept byte-identical with glp-order-card.js's
      // _findMachineStatusEntity(); what each side does with `matched`
      // afterward differs (a prefix here vs the raw entity id there), so
      // only the predicate itself is shared.
      const needle = String(this._config.machine).toLowerCase();
      const needleSlug = needle.replace(/\s+/g, '_');
      const matched = candidates.find(id =>
        this._hass.states[id]?.attributes?.friendly_name?.toLowerCase().includes(needle) ||
        id.toLowerCase().includes(needleSlug));
      // /GLP-SHARED:machine-match v1
      if (matched) return matched;
    }
    const found = candidates.find(id =>
      this._hass.states[id]?.attributes?.friendly_name?.toLowerCase().includes('gaggiuino'));
    return found || candidates[0] || null;
  }

  _getSwitchEntity() {
    if (this._config?.switch_entity) return this._config.switch_entity;
    const found = this._findMachineStatusEntity();
    return found ? (this._hass.states[found]?.attributes?.switch_entity || null) : null;
  }

  set hass(hass) {
    const firstHass = !this._hass;
    this._hass = hass;
    if (firstHass && this._menu === null) {
      this._load();
    } else if (!this._noteInteracting && !this._clickBlocked) {
      // Debounce hass-triggered renders: HA pushes updates very frequently
      // (entity state ticks, etc.) — 1 s is fast enough for machine on/off changes
      clearTimeout(this._hassRenderTimer);
      this._hassRenderTimer = setTimeout(() => {
        if (!this._noteInteracting && !this._clickBlocked) this._render();
      }, 1000);
    }
  }

  connectedCallback() { this._startPoll(); }
  disconnectedCallback() { this._stopPoll(); }

  _startPoll() {
    this._stopPoll();
    this._load();
    this._schedulePoll();
  }
  _schedulePoll() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    const hasActive = this._activeOrder?.status === 'pending' || this._activeOrder?.status === 'accepted';
    this._pollTimer = setTimeout(async () => {
      await this._loadStatus();
      this._schedulePoll();
    }, hasActive ? 3000 : 10000);
  }
  _stopPoll() {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
  }

  _useIngress() { return !this._config?.glp_url; }

  async _ensureToken() {
    if (this._useIngress()) return null; // ingress bypasses token check
    if (this._token) return this._token;
    // /api/token is only served to Supervisor-originating requests or already-
    // authenticated callers. In direct-URL mode the card is browser-originated
    // (LAN IP) so this call will return 401. Users must set glp_token in YAML.
    try {
      const d = await fetch(`${this._getBase()}/api/token`).then(r => r.ok ? r.json() : {});
      this._token = d.apiToken || null;
    } catch { /* 401 in direct-URL mode is expected; falls back to configured glp_token */ }
    return this._token;
  }

  async _fetch(path, opts = {}) {
    // In zero-config mode route through the HA integration REST proxy (/api/glp/*)
    // which the integration registers as a standard HA HTTP view, authenticated via
    // Bearer token — no Supervisor ingress session cookie required.
    if (this._useIngress() && this._hass?.fetchWithAuth) {
      const proxyPath = '/api/glp/' + path.replace(/^api\//, '');
      return this._hass.fetchWithAuth(proxyPath, opts);
    }
    const url = `${this._getBase()}/${path}`;
    const token = await this._ensureToken();
    if (token) opts = { ...opts, headers: { ...opts.headers, 'X-GLP-Token': token } };
    return fetch(url, opts);
  }

  async _load() {
    try {
      const [menuRes, settingsRes, queueRes] = await Promise.all([
        this._fetch('api/orders/menu'),
        this._fetch('api/orders/settings'),
        this._fetch('api/orders/queue-eta').catch(() => null),
      ]);
      if (queueRes?.ok) this._queueEta = await queueRes.json().catch(() => null);
      if (menuRes.status === 404 && settingsRes.status === 404) {
        // Feature disabled at add-on level
        this._menu    = [];
        this._enabled = false;
      } else if (menuRes.ok && settingsRes.ok) {
        const menu     = await menuRes.json();
        const settings = await settingsRes.json();
        this._menu    = Array.isArray(menu) ? menu : [];
        this._enabled = settings?.enabled !== false;
        // Fetch active beans if any menu item uses the bean library as variants
        if (this._menu.some(m => m.useBeans)) {
          try {
            const br = await this._fetch('api/orders/active-beans');
            this._activeBeans = br.ok ? await br.json() : [];
          } catch { this._activeBeans = []; }
        }
      }
      // else: other non-ok (401, 500 …) — leave _menu = null so _loadStatus retries
    } catch { /* network error — keep this._menu = null so _loadStatus retries */ }
    await this._loadStatus(true);
    this._render();
  }

  async _loadStatus(fromLoad = false) {
    // If initial _load() failed (menu still null), retry the full load instead of just status
    if (!fromLoad && this._menu === null) {
      await this._load();
      return;
    }
    if (!this._hass) return;
    const haUser = this._hass.user;
    if (!haUser) return;
    // Re-check enabled/paused state on every periodic poll so barista toggle changes
    // are picked up within 10 s without requiring a page reload
    if (!fromLoad) {
      try {
        const sr = await this._fetch('api/orders/settings');
        if (sr.ok) this._enabled = (await sr.json())?.enabled !== false;
      } catch { /* transient poll failure, keep last known enabled state */ }
    }
    try {
      const orders = await this._fetch(`api/orders/mine?haUserId=${encodeURIComponent(haUser.id)}`).then(r => r.json());
      const active = orders.find(o => ['pending','accepted'].includes(o.status));
      const recent = !active ? orders.find(o => ['done','declined'].includes(o.status) && (Date.now() - (o.completedAt||0)) < 120000) : null;
      this._activeOrder = active || recent || null;
      if (this._activeOrder?.status === 'done' && !this._lastShot) {
        try {
          const shotId = this._activeOrder.shotId;
          const path = shotId ? `api/shots/${encodeURIComponent(shotId)}` : 'api/shots/last';
          this._lastShot = await this._fetch(path).then(r => r.json());
        } catch { this._lastShot = null; }
      } else if (!this._activeOrder || this._activeOrder.status !== 'done') {
        this._lastShot = null;
      }
    } catch { this._activeOrder = null; this._lastShot = null; }
    if (this._noteInteracting || this._clickBlocked) {
      this._pendingRender = true;
    } else {
      this._render();
    }
  }

  _machineOff() {
    const entity = this._getSwitchEntity();
    if (!entity || !this._hass) return false;
    const s = this._hass.states[entity];
    return s?.state === 'off' || s?.state === 'unavailable';
  }

  /* GLP-SHARED:contrast v1 — kept byte-identical with glp-order-card.js's
     _luminanceOf()/_applySemanticColorContrast() */
  // Resolves the relative luminance of a CSS color string by normalizing it
  // through a scratch element's computed style (handles hex/rgb/named/etc —
  // whatever the real cascade actually resolved a custom property to).
  // Returns null if it can't be determined (no DOM, unset value, ...).
  // Resolves a CSS color string to [r, g, b] (0-255) by normalizing it
  // through a scratch element's computed style, so hex/rgb/named/color-mix
  // all work — whatever the real cascade actually produced. Split out of
  // _luminanceOf() (which now builds on it) because --glp-aline has to
  // BLEND two resolved colors, not merely compare their luminance.
  _rgbOf(cssColor) {
    if (!cssColor) return null;
    let rgb;
    try {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:none';
      probe.style.color = cssColor;
      this.shadowRoot.appendChild(probe);
      rgb = getComputedStyle(probe).color;
      probe.remove();
    } catch { return null; }
    const m = rgb && rgb.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return m.slice(0, 3).map(Number);
  }

  _luminanceOf(cssColor) {
    const rgb = this._rgbOf(cssColor);
    if (!rgb) return null;
    const [r, g, b] = rgb;
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Relative-luminance contrast ratio of two [r,g,b] triples, WCAG 2.x.
  _contrastOf(rgbA, rgbB) {
    const lum = ([r, g, b]) => {
      const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const a = lum(rgbA), b = lum(rgbB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  // Picks the contrast-safe --glp-ok/--glp-warn/--glp-err/--glp-accent-text
  // variants at runtime, each keyed off the LUMINANCE OF THE ACTUAL RESOLVED
  // COLOR they need to read against — not prefers-color-scheme. OS/browser
  // color scheme can mismatch the actual active HA theme (dark system +
  // light HA theme is common), and this card has no data-theme attribute to
  // key off instead. --glp-ok/--glp-warn/--glp-err key off --glp-bg's
  // luminance; --glp-accent-text keys off --glp-accent-start/-end's
  // luminance (the darker of the two, see below) separately (theme darkness
  // and accent darkness are orthogonal — see the
  // long comments in the GLP-TOKENS block above for the measured contrast
  // ratios behind all four). Sets the winning values as an inline style on
  // the host, which always outranks the plain :host declarations in STYLES
  // regardless of any stylesheet/media-query state. Called from _render()
  // right after the shadow DOM (and its :host rules) are rebuilt.
  _applySemanticColorContrast() {
    const bgLuminance = this._luminanceOf(getComputedStyle(this).getPropertyValue('--glp-bg').trim());
    if (bgLuminance != null) {
      // 0.179 is the standard WCAG "flip point": the background luminance
      // above which a darker foreground becomes the higher-contrast choice.
      const light = bgLuminance > 0.179;
      this.style.setProperty('--glp-ok',   light ? '#15803d' : '#22c55e');
      this.style.setProperty('--glp-warn', light ? '#a16207' : '#eab308');
      this.style.setProperty('--glp-err',  light ? '#dc2626' : '#ef4444');
    }
    // mxkissnr/glp-lovelace-card#87 / mxkissnr/glp-order-card#62: when a
    // per-machine gradient theme is active, --glp-accent-start
    // and --glp-accent-end differ — pick the DARKER (lower-luminance) stop
    // as the worst case, since text/icon content can sit anywhere across the
    // gradient. A flat colour (no theme, or a flat custom/preset) has both
    // stops equal, so this reduces to the original single-value check.
    const startLuminance = this._luminanceOf(getComputedStyle(this).getPropertyValue('--glp-accent-start').trim());
    const endLuminance    = this._luminanceOf(getComputedStyle(this).getPropertyValue('--glp-accent-end').trim());
    const accentLuminance = [startLuminance, endLuminance].filter(v => v != null)
      .reduce((min, v) => (min == null || v < min ? v : min), null);
    if (accentLuminance != null) {
      // Pure #000/#fff at the same 0.179 split is a mathematical guarantee
      // of >=4.58:1 against ANY accent color (both text colors measure
      // exactly that at the crossover luminance, and only gain contrast
      // moving away from it) — no need to check specific theme values here.
      this.style.setProperty('--glp-accent-text', accentLuminance > 0.179 ? '#000' : '#fff');
    }
    this._applyAccentLineContrast();
  }

  // Resolves --glp-aline: the accent as a thin line needs 3:1 against the
  // card's background (WCAG 1.4.11 non-text contrast), which three of the
  // eight curated machine themes miss on a dark ground (see the --glp-aline
  // comment in the GLP-TOKENS block for the measured values).
  //
  // Uses the DARKER of the two gradient stops as the worst case, matching
  // --glp-accent-text's reasoning above: a line can be drawn anywhere along
  // the gradient, so the weakest stop is what has to clear the bar.
  //
  // A theme that already passes is left EXACTLY as configured — this must
  // not quietly recolour the seven themes that were always fine. Only a
  // failing stop is blended toward --glp-text (the direction that is
  // guaranteed to increase contrast against the background, since --glp-text
  // is itself the high-contrast colour for this ground) in 5% steps, and the
  // first step that clears 3:1 wins. Stepping rather than solving keeps the
  // result as close to the configured colour as possible: the accent should
  // still look like the machine's colour, just legible.
  _applyAccentLineContrast() {
    const cs = getComputedStyle(this);
    const bg = this._rgbOf(cs.getPropertyValue('--glp-bg').trim());
    const text = this._rgbOf(cs.getPropertyValue('--glp-text').trim());
    const stops = ['--glp-accent-start', '--glp-accent-end']
      .map(v => this._rgbOf(cs.getPropertyValue(v).trim()))
      .filter(Boolean);
    if (!bg || !text || !stops.length) return;
    // Worst case = the stop with the lowest contrast against the background.
    const weakest = stops.reduce((worst, s) =>
      this._contrastOf(s, bg) < this._contrastOf(worst, bg) ? s : worst, stops[0]);
    if (this._contrastOf(weakest, bg) >= 3) {
      this.style.setProperty('--glp-aline', `rgb(${weakest.join(' ')})`);
      return;
    }
    let out = weakest;
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const mixed = weakest.map((c, i) => Math.round(c + (text[i] - c) * t));
      out = mixed;
      if (this._contrastOf(mixed, bg) >= 3) break;
    }
    this.style.setProperty('--glp-aline', `rgb(${out.join(' ')})`);
  }
  /* /GLP-SHARED:contrast v1 */

  _render() {
    if (!this._config) return;
    const lang  = this._lang;
    const title = this._config.title || _s('title', lang);
    const off   = this._machineOff();

    // Skip redundant full re-renders (polling/hass ticks) — only rebuild the DOM
    // when something user-visible actually changed. Prevents flicker on the status view.
    const o = this._activeOrder;
    const minsLeft = o?.status === 'accepted'
      ? Math.max(0, Math.ceil((o.acceptedAt + o.eta * 60000 - Date.now()) / 60000)) : null;
    const sig = JSON.stringify([
      off, this._enabled, this._menu ? this._menu.length : -1,
      this._selected, this._selectedVariant, this._submitting,
      o && [o.id, o.status], minsLeft, this._lastShot?.id ?? null,
      this._queueEta?.positions?.[o?.id]?.position ?? null,
      title, lang, this._activeBeans?.length ?? -1,
    ]);
    if (sig === this._lastRenderSig) return;
    this._lastRenderSig = sig;

    let body;

    if (off) {
      body = `<div class="machine-off">${_s('off', lang)}</div>`;
    } else if (!this._enabled) {
      body = `<div class="machine-off">${_s('paused', lang)}</div>`;
    } else if (this._activeOrder) {
      body = this._renderStatus(this._activeOrder, lang);
    } else if (this._menu === null) {
      body = `<div class="loading">${_s('loading', lang)}</div>`;
    } else {
      body = this._renderOrderForm(lang);
    }

    this._applyThemeVars();
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="card">
          <div class="header">
            ${this._machineGlyphHtml('header', 'hdr')}
            ${_esc(title)}
          </div>
          ${body}
        </div>
      </ha-card>`;

    this._applySemanticColorContrast();
    this._bindEvents();
  }

  _renderOrderForm(lang) {
    if (!this._menu || this._menu.length === 0) {
      return `<div class="loading">${_s('no_menu', lang)}</div>`;
    }

    // Hide useBeans items when no active beans are in stock
    const visibleMenu = this._menu.filter(m =>
      !m.useBeans || (Array.isArray(this._activeBeans) && this._activeBeans.length > 0)
    );
    if (visibleMenu.length === 0) {
      return `<div class="loading">${_s('no_menu', lang)}</div>`;
    }

    const newThreshold = (parseFloat(this._config?.new_badge_days) || NEW_BADGE_DAYS_DEFAULT) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const renderItem = m => {
      const isNew     = m.createdAt && (now - m.createdAt) < newThreshold;
      const newBadge  = isNew     ? `<span class="menu-badge menu-badge-new">NEW</span>` : '';
      const trendBadge = m.trending ? `<span class="menu-badge menu-badge-trend">${ICONS.of('heat')}</span>` : '';
      return `<div class="menu-item${this._selected === m.name ? ' selected' : ''}" data-item="${_esc(m.name)}">
        <div class="menu-item-icon">${_menuIconHtml(m)}</div>
        <div class="menu-item-name">${_esc(m.name)}${trendBadge}${newBadge}</div>
      </div>`;
    };

    const trending = visibleMenu.filter(m => m.trending);
    const regular  = visibleMenu.filter(m => !m.trending);

    const trendSection = trending.length ? `
      <p class="menu-section-title">${ICONS.of('heat')} ${_esc(_s('trending_title', lang))}</p>
      <div class="menu-grid">${trending.map(renderItem).join('')}</div>` : '';
    const regularSection = regular.length ? `
      ${trending.length ? `<p class="menu-section-title" style="margin-top:var(--glp-sp-3)">${_s('menu_all', lang)}</p>` : ''}
      <div class="menu-grid">${regular.map(renderItem).join('')}</div>` : '';

    const selectedItem = visibleMenu.find(m => m.name === this._selected);
    const variants = this._getVariants(selectedItem);
    const needsVariant = variants.length > 0 && !this._selectedVariant;
    const groupedVariants = this._getVariantsGrouped(selectedItem);
    const wrapperClass = groupedVariants.flat ? ' class="variant-grid"' : '';
    const variantSection = (this._selected && variants.length > 0) ? `
      <p class="variant-label">${_s('variant_label', lang)}</p>
      <div id="oc-variants"${wrapperClass}>
        ${this._variantInnerHtml(groupedVariants, lang)}
      </div>` : '';
    const beanInfoSection = this._beanInfoHtml(this._getSelectedBean(), lang);
    const itemLabel = (this._selected && this._selectedVariant)
      ? `${this._selected} · ${this._selectedVariant}`
      : this._selected || null;
    const btnLabel = itemLabel ? _s('order_btn', lang, itemLabel)
      : needsVariant ? _s('variant_select', lang)
      : _s('order_btn_select', lang);
    return `
      <div class="order-form">
        ${trendSection}${regularSection}
        ${variantSection}${beanInfoSection}
        <input class="note-input" id="oc-note" placeholder="${_s('note_ph', lang)}" maxlength="200">
        <button class="order-btn" id="oc-submit" ${!this._selected || this._submitting || needsVariant ? 'disabled' : ''}>
          ${itemLabel ? ICONS.of('coffee') + ' ' : ''}${_esc(btnLabel)}
        </button>
      </div>`;
  }

  _shotChart(shot) {
    const dp = shot?.datapoints;
    if (!dp) return '';

    // Series colors: the GLP-series palette (glp-card.js's buildShotChart(),
    // kept in sync via GLP-TOKENS' --glp-series-* fallback values).
    const series = [
      { key: 'pressure',    scale: 10, axis: 'left',  color: 'var(--glp-series-pres, #0072b2)',   label: 'Druck' },
      { key: 'temperature', scale: 10, axis: 'right', color: 'var(--glp-series-temp, #c0392b)',   label: 'Temp' },
      { key: 'weightFlow',  scale: 10, axis: 'left',  color: 'var(--glp-series-flow, #c77000)',   label: 'Flow' },
      { key: 'shotWeight',  scale: 10, axis: 'right', color: 'var(--glp-series-weight, #009e73)', label: 'Gewicht' },
    ].map(s => ({ ...s, vals: Array.isArray(dp[s.key]) ? dp[s.key].map(v => v / s.scale) : [] }))
     .filter(s => s.vals.length >= 4);

    if (!series.length) return '';

    const W = 300, H = 72, pad = 2;
    const len = Math.max(...series.map(s => s.vals.length));

    // Shared axis scales, not each series independently normalized to its own
    // min/max (that made the curves' relative shapes meaningless — a nearly
    // flat temperature line looked as dramatic as a swinging pressure line).
    // Mirrors glp-card.js's buildShotChart(): pressure+flow share a fixed
    // 0–12 bar "left" axis, temperature+weight share a dynamic "right" axis
    // (floor 110) — same two-axis grouping, just without the drawn axis
    // labels this compact summary chart doesn't have room for.
    const PMAX = 12;
    const tempVals = series.find(s => s.key === 'temperature')?.vals || [];
    const rMax = Math.max(110, Math.ceil(((tempVals.length ? Math.max(...tempVals) : 0) + 5) / 10) * 10);
    const maxFor = axis => axis === 'left' ? PMAX : rMax;

    const polyline = (s) => {
      const max = maxFor(s.axis);
      const pts = s.vals.map((v, i) => {
        const x = pad + (i / (len - 1)) * (W - pad * 2);
        const y = H - pad - (Math.max(0, Math.min(max, v)) / max) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
    };

    const svg = `<svg class="shot-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${series.map(s => polyline(s)).join('')}
    </svg>`;

    const legend = `<div class="shot-chart-legend">
      ${series.map(s => `<div class="shot-chart-legend-item">
        <div class="shot-chart-legend-dot" style="background:${s.color}"></div>${s.label}
      </div>`).join('')}
    </div>`;

    return svg + legend;
  }

  _renderShotSummary(shot, _lang) {
    if (!shot) return '';
    const profile  = shot.profile?.name || shot.profileName || '–';
    const dur      = shot.duration ? `${(shot.duration / 10).toFixed(0)} s` : null;
    const wtArr    = shot.datapoints?.shotWeight || shot.datapoints?.weight;
    const yield_g  = Array.isArray(wtArr) && wtArr.length ? `${(wtArr[wtArr.length - 1] / 10).toFixed(1)} g` : null;
    const meta     = [dur, yield_g].filter(Boolean).join(' · ');
    const chart = this._shotChart(shot);
    return `<div class="shot-summary">
      <div class="shot-summary-profile">${_esc(profile)}</div>
      ${meta ? `<div class="shot-summary-meta">${_esc(meta)}</div>` : ''}
      ${chart}
    </div>`;
  }

  _renderStatus(order, lang) {
    let content = '';
    const itemLabel = order.variant ? `${order.item} · ${order.variant}` : order.item;
    // Multi-machine (#29): only shown when the order actually carries a
    // machine name — orders placed before this feature, or on a
    // single-machine setup that never sets `machine` in config, render
    // exactly as before.
    const machineLine = order.machine
      ? `<div class="status-line status-machine">${this._machineGlyphHtml('status', 'stat')}${_esc(order.machine)}</div>` : '';

    if (order.status === 'pending') {
      const qp = this._queueEta?.positions?.[order.id];
      const queueLine = qp
        ? `<div class="status-line">${_esc(_s('queue_pos', lang, qp.position, qp.suggestedEta))}</div>`
        : '';
      content = `<div class="status-card pending">
        <div class="status-item">${ICONS.of('hourglass')} ${_esc(_s('pending', lang, itemLabel))}</div>
        ${machineLine}
        ${queueLine}
      </div>`;
    } else if (order.status === 'accepted') {
      const etaDone   = order.acceptedAt + order.eta * 60000;
      const minsLeft  = Math.max(0, Math.ceil((etaDone - Date.now()) / 60000));
      content = `<div class="status-card accepted">
        <div class="status-item">${ICONS.of('coffee')} ${_esc(_s('accepted', lang, itemLabel, minsLeft))}</div>
        ${machineLine}
        <div class="status-eta">${minsLeft === 0 ? `${ICONS.of('celebrate')} ${_s('almost_ready', this._lang)}` : `~${minsLeft} min`}</div>
      </div>`;
    } else if (order.status === 'done') {
      const shotHtml = this._renderShotSummary(this._lastShot, lang);
      content = `<div class="status-card done">
        <div class="status-done-msg">${ICONS.of('check')} ${_esc(_s('done', lang, itemLabel))}</div>
      </div>${shotHtml}`;
    } else if (order.status === 'declined') {
      content = `<div class="status-card declined">
        <div class="status-item">${ICONS.of('close')} ${_esc(_s('declined', lang, itemLabel))}</div>
        ${order.declineReason ? `<div class="status-decline">${_esc(_s('decline_reason', lang, order.declineReason))}</div>` : ''}
      </div>`;
    }

    return `${content}<button class="new-order-btn" id="oc-new-order">${_s('new_order', lang)}</button>`;
  }

  _bindEvents() {
    // Block any render for 300 ms after a pointer interaction to prevent
    // DOM replacement eating the click event before it fires
    this.shadowRoot.addEventListener('pointerdown', () => {
      this._clickBlocked = true;
      clearTimeout(this._clickBlockTimer);
      this._clickBlockTimer = setTimeout(() => {
        this._clickBlocked = false;
        if (this._pendingRender && !this._noteInteracting) {
          this._pendingRender = false;
          this._render();
        }
      }, 300);
    }, { passive: true });

    // Menu item selection — toggle CSS only, no full re-render
    this.shadowRoot.querySelectorAll('.menu-item').forEach(el => {
      el.addEventListener('click', () => {
        const prev = this._selected;
        this._selected = this._selected === el.dataset.item ? null : el.dataset.item;
        if (this._selected !== prev) { this._selectedVariant = null; this._selectedBeanId = null; }
        // Update selected state without replacing the DOM
        this.shadowRoot.querySelectorAll('.menu-item').forEach(m => {
          m.classList.toggle('selected', m.dataset.item === this._selected);
        });
        this._updateVariantPicker();
        this._updateSubmitBtn();
      });
    });

    // Variant chip selection
    this._bindVariantChips();

    // Note input: block re-renders while user is typing
    const noteEl = this.shadowRoot.getElementById('oc-note');
    if (noteEl) {
      noteEl.addEventListener('focus', () => { this._noteInteracting = true; });
      noteEl.addEventListener('blur',  () => {
        this._noteInteracting = false;
        if (this._pendingRender) { this._pendingRender = false; this._render(); }
      });
    }
    // Submit
    const submitBtn = this.shadowRoot.getElementById('oc-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this._placeOrder());
    }
    // New order
    const newBtn = this.shadowRoot.getElementById('oc-new-order');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        this._activeOrder     = null;
        this._selected        = null;
        this._selectedVariant = null;
        this._selectedBeanId  = null;
        this._render();
      });
    }
  }

  _getVariants(item) {
    if (!item) return [];
    if (item.useBeans) return (this._activeBeans || []).map(b => b.decaf ? `${b.name} · Decaf` : b.name);
    return item.variants || [];
  }

  // Second, orthogonal grouping axis on top of _getVariants() (#36): non-bean
  // items (plain item.variants string arrays) have no category concept, so
  // they stay flat/ungrouped exactly as before. Bean-backed items split into
  // speciality/normal sections using the app's `category` field (added in
  // gaggiuino-local-profiler#505) — untagged/missing beans default to 'normal'.
  _getVariantsGrouped(item) {
    if (!item?.useBeans) return { flat: this._getVariants(item) };
    const label = b => b.decaf ? `${b.name} · Decaf` : b.name;
    const beans = this._activeBeans || [];
    return {
      speciality: beans.filter(b => b.category === 'speciality').map(label),
      normal:     beans.filter(b => b.category !== 'speciality').map(label),
    };
  }

  // Bean-backed variant chips carry the bean's stable id (#35) alongside the
  // display label, so selection can be tracked and submitted by id — the
  // label alone is ambiguous whenever a bean gets deleted and reimported
  // under the same name (same bug class as gaggiuino-local-profiler#456).
  _beanIdForLabel(v) {
    const bean = (this._activeBeans || []).find(b => (b.decaf ? `${b.name} · Decaf` : b.name) === v);
    return bean?.id ?? null;
  }

  _variantChipHtml(v) {
    const beanId = this._beanIdForLabel(v);
    const idAttr = beanId != null ? ` data-bean-id="${_esc(beanId)}"` : '';
    return `<div class="variant-chip${this._selectedVariant === v ? ' selected' : ''}" data-variant="${_esc(v)}"${idAttr}>${_esc(v)}</div>`;
  }

  // Shared by _renderOrderForm() and _updateVariantPicker() so the two never
  // drift. Mirrors the trending/regular section pattern (~line 650): headings
  // shown only when both groups are non-empty — a single-group list (e.g. all
  // beans untagged) renders as one plain grid, no noisy "Normal" label.
  _variantInnerHtml(grouped, lang) {
    if (grouped.flat) return grouped.flat.map(v => this._variantChipHtml(v)).join('');
    const { speciality, normal } = grouped;
    const showHeadings = speciality.length > 0 && normal.length > 0;
    const specialitySection = speciality.length ? `
      ${showHeadings ? `<p class="menu-section-title">${_s('variant_speciality', lang)}</p>` : ''}
      <div class="variant-grid">${speciality.map(v => this._variantChipHtml(v)).join('')}</div>` : '';
    const normalSection = normal.length ? `
      ${showHeadings ? `<p class="menu-section-title" style="margin-top:var(--glp-sp-3)">${_s('variant_normal', lang)}</p>` : ''}
      <div class="variant-grid">${normal.map(v => this._variantChipHtml(v)).join('')}</div>` : '';
    return specialitySection + normalSection;
  }

  // Id-first with a name fallback (#35), mirroring resolveBeanForAnnotation()
  // in gaggiuino-local-profiler (lib/services/LibraryService.js, #456): the
  // id is trusted exclusively when it resolves; the label match only covers
  // the case where it doesn't (bean removed from _activeBeans mid-session).
  _getSelectedBean() {
    const selectedItem = this._menu?.find(m => m.name === this._selected);
    if (!selectedItem?.useBeans || !this._selectedVariant) return null;
    const beans = this._activeBeans || [];
    if (this._selectedBeanId != null) {
      const byId = beans.find(b => b.id === this._selectedBeanId);
      if (byId) return byId;
    }
    return beans.find(b => (b.decaf ? `${b.name} · Decaf` : b.name) === this._selectedVariant) || null;
  }

  _beanInfoHtml(bean, lang) {
    const origins = Array.isArray(bean?.origins) && bean.origins.length
      ? bean.origins
      : (bean?.origin ? [{ code: bean.origin }] : []);
    if (!bean || (!bean.notes && !origins.length && !bean.variety && !bean.process)) return '';
    const rows = [];
    if (bean.notes)      rows.push(`<div class="bean-info-notes">${_esc(bean.notes)}</div>`);
    if (origins.length)  rows.push(`<div class="bean-info-row"><span class="bean-info-label">${_s('bean_origin', lang)}</span><span>${_originHtml(origins, lang)}</span></div>`);
    if (bean.variety) rows.push(`<div class="bean-info-row"><span class="bean-info-label">${_s('bean_variety', lang)}</span><span>${_esc(bean.variety)}</span></div>`);
    if (bean.process) rows.push(`<div class="bean-info-row"><span class="bean-info-label">${_s('bean_process', lang)}</span><span>${_esc(bean.process)}</span></div>`);
    return `<div class="bean-info" id="oc-bean-info">${rows.join('')}</div>`;
  }

  _updateBeanInfo() {
    const container = this.shadowRoot.querySelector('.order-form');
    if (!container) return;
    const existing = this.shadowRoot.getElementById('oc-bean-info');
    const html = this._beanInfoHtml(this._getSelectedBean(), this._lang);
    if (!html) { if (existing) existing.remove(); return; }
    if (existing) { existing.outerHTML = html; return; }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    container.insertBefore(tpl.content.firstElementChild, this.shadowRoot.getElementById('oc-note'));
  }

  _updateVariantPicker() {
    const selectedItem = this._menu?.find(m => m.name === this._selected);
    const variants = this._getVariants(selectedItem);
    const container = this.shadowRoot.querySelector('.order-form');
    if (!container) return;
    let vRow = this.shadowRoot.getElementById('oc-variants');
    const vLabel = this.shadowRoot.querySelector('.variant-label');
    if (variants.length === 0) {
      if (vRow)   vRow.remove();
      if (vLabel) vLabel.remove();
      this._updateBeanInfo();
      return;
    }
    if (!vRow) {
      const label = document.createElement('p');
      label.className = 'variant-label';
      label.textContent = _s('variant_label', this._lang);
      const grid = document.createElement('div');
      grid.id = 'oc-variants';
      const noteInput = this.shadowRoot.getElementById('oc-note');
      container.insertBefore(label, noteInput);
      container.insertBefore(grid, noteInput);
      vRow = grid;
    }
    const grouped = this._getVariantsGrouped(selectedItem);
    vRow.className = grouped.flat ? 'variant-grid' : '';
    vRow.innerHTML = this._variantInnerHtml(grouped, this._lang);
    this._bindVariantChips();
    this._updateBeanInfo();
  }

  _bindVariantChips() {
    this.shadowRoot.querySelectorAll('.variant-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const wasSelected = this._selectedVariant === chip.dataset.variant;
        this._selectedVariant = wasSelected ? null : chip.dataset.variant;
        this._selectedBeanId  = wasSelected ? null : (chip.dataset.beanId != null ? Number(chip.dataset.beanId) : null);
        this.shadowRoot.querySelectorAll('.variant-chip').forEach(c => {
          c.classList.toggle('selected', c.dataset.variant === this._selectedVariant);
        });
        this._updateSubmitBtn();
        this._updateBeanInfo();
      });
    });
  }

  _updateSubmitBtn() {
    const selectedItem = this._menu?.find(m => m.name === this._selected);
    const variants = this._getVariants(selectedItem);
    const needsVariant = variants.length > 0 && !this._selectedVariant;
    const btn = this.shadowRoot.getElementById('oc-submit');
    if (!btn) return;
    if (!this._selected) {
      btn.textContent = _s('order_btn_select', this._lang);
      btn.disabled = true;
    } else if (needsVariant) {
      btn.textContent = _s('variant_select', this._lang);
      btn.disabled = true;
    } else {
      // textContent, not innerHTML — this is the fast incremental update path
      // (variant/note interaction), not a full _renderOrderForm() pass, so it
      // doesn't carry the coffee icon _renderOrderForm() puts in the button on
      // a full render. Text-only here, same as the other two branches above.
      const itemLabel = this._selectedVariant ? `${this._selected} · ${this._selectedVariant}` : this._selected;
      btn.textContent = _s('order_btn', this._lang, itemLabel);
      btn.disabled = !!this._submitting;
    }
  }

  async _placeOrder() {
    if (!this._selected || this._submitting) return;
    const noteEl = this.shadowRoot.getElementById('oc-note');
    const note   = noteEl?.value?.trim() || '';
    const haUser = this._hass?.user;
    if (!haUser) return;

    this._submitting = true;
    this._render();

    try {
      const order = await this._fetch('api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item:     this._selected,
          variant:  this._selectedVariant || undefined,
          // Stable id alongside the name (#35): lets the app resolve
          // order->bean attribution id-first, surviving a bean delete +
          // reimport under the same name — see _getSelectedBean() above.
          beanId:   this._getSelectedBean()?.id ?? undefined,
          note,
          customer: haUser.name,
          haUserId: haUser.id,
          machine:  this._config?.machine || undefined,
        }),
      }).then(r => r.json());

      if (order.id) {
        this._activeOrder = order;
        this._selected    = null;
        this._selectedVariant = null;
        this._selectedBeanId  = null;
      }
    } catch { /* network/API failure: silently falls back to the order form via _submitting reset below */ }
    this._submitting = false;
    this._render();
  }

  getCardSize() { return 3; }

  static getStubConfig()    { return {}; }
}

customElements.define('glp-order-card', GlpOrderCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'glp-order-card',
  name:        'GLP Order Card',
  description: 'Customer-facing order card for Gaggiuino Local Profiler',
  preview:     false,
  documentationURL: 'https://github.com/mxkissnr/glp-order-card',
});

console.info(`%c GLP-ORDER-CARD %c v${GLP_ORDER_CARD_VERSION} `, 'background:#ff9f0a;color:#000;padding:2px 4px;border-radius:3px 0 0 3px', 'background:#111113;color:#ff9f0a;padding:2px 4px;border-radius:0 3px 3px 0');
