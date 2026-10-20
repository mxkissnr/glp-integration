// Drawn icon geometry and the ICONS lookup, split out of glp-card.ts (#180).
// The GLP-SHARED:machine-icon and GLP-SHARED:icons marker pairs below are
// byte-identical with the Order Card copy (test/token-sync.test.js), so each
// type annotation sits outside them.

// GLP-SHARED:machine-icon v1 — approved detailed Gaggia Classic icon
// geometry (mxkissnr/glp-lovelace-card#87 / mxkissnr/glp-order-card#62),
// ported faithfully from the Theme Lab mockup the maintainer approved (see
// ICON-AND-THEMES-SPEC.js in the glp-project workspace) and kept in sync
// with glp-order-card.js's copy. `id` is a per-render-instance-unique
// gradient id (this card can appear more than once on one dashboard — each
// file's constructor derives its own id under its own name) coloured via
// --glp-accent-start/-end (the mockup's --acc-a/--acc-b, renamed to this
// card's own token names); a second, fixed `${id}-steel` gradient colours
// the drip-tray mesh in silver, independent of the accent theme. `mini`
// drops fine detail (portafilter spout, steam wand tip, button
// highlights/LEDs, drip-tray mesh holes) for small render sizes, per the
// mockup's own MACHINE_BODY(id, mini). `type` ('gaggiuino' | 'gaggimate',
// default 'gaggiuino') swaps only the top control area — 3 rocker switches
// + steam knob for Gaggiuino, a round chrome-housed puck for GaggiMate —
// both types share the same lower body (side wall, front face, drip tray,
// base, feet). Puck geometry adapted from redesign-2026-08/build-prototype.py's
// approved machine_anim('gaggimate') panel, repositioned to sit within this
// badge's existing `0 0 100 162` viewBox instead of that prototype's taller
// offset viewBox (mxkissnr/glp-lovelace-card#127 / mxkissnr/glp-order-card#97).
const MACHINE_BODY = (id: string, mini: boolean, type: string = 'gaggiuino'): string => `
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

    ${type === 'gaggimate' ? `
    <!-- GaggiMate: runder Puck mit Chromgehaeuse ersetzt Wipptasten +
         Dampfknopf (mxkissnr/glp-lovelace-card#127 / mxkissnr/glp-order-card#97) -->
    <circle cx="41" cy="24" r="14" fill="#cfd4d9"/>
    <circle cx="41" cy="24" r="14" fill="none" stroke="#8f959d" stroke-width=".9"/>
    <circle cx="41" cy="24" r="11.4" fill="#17171b"/>
    <circle cx="41" cy="24" r="10.2" fill="#0b0d12"/>
    ${mini ? '' : `
    <path d="M31.1 14.1 A14 14 0 0 1 45 10.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".65"/>
    <path d="M33.4 16.4 A10.7 10.7 0 0 1 48.6 16.4" fill="none" stroke="#e8452a" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>
    <path d="M42.6 13.4 A10.7 10.7 0 0 1 48.6 16.4" fill="none" stroke="#6aa9d8" stroke-width="1.3" stroke-linecap="round"/>`}` : `
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
    ${mini ? '' : '<rect x="81.4" y="23.4" width="1.7" height="7.8" rx=".85" fill="#fff" opacity=".2"/>'}`}`;

const MACHINE_ICON_MINI = (id: string, type: string = 'gaggiuino'): string => `
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
      ${MACHINE_BODY(id, true, type)}
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
  has: (name: string): boolean => Object.prototype.hasOwnProperty.call(GLP_ICON_PATHS, name),
  // Returns '' for an unknown name rather than an empty <svg>: callers fall
  // back to other content (e.g. a stored emoji on a user-created menu entry),
  // and an empty string is what makes `ICONS.of(x) || fallback` work.
  of: (name: string, cls: string = ''): string => (ICONS.has(name)
    ? `<svg class="glp-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${(GLP_ICON_PATHS as Record<string, string>)[name]}</svg>`
    : ''),
};
// /GLP-SHARED:icons v1

// #170: card-local addition, deliberately outside the GLP-SHARED:icons block
// above (kept byte-identical with glp-order-card.js, see test/token-sync.test.js)
// -- glp-order-card has no live-brewing view and no use for a descaling icon.
// Same droplet silhouette as `droplet` (water) with a jagged crystalline line
// through it, standing in for the mineral/scale deposit being flushed out --
// visually distinct from the plain droplet used for the water-level banner.
type IconPathMap = Record<string, string>;
(GLP_ICON_PATHS as IconPathMap).descale = '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M8.3 13.6l1.5 1.7 1.4-2.3 1.5 1.7 1.5-2.3"/>';

export { MACHINE_BODY, MACHINE_ICON_MINI, GLP_ICON_PATHS, ICONS };
