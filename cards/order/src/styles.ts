export const STYLES: string = `
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
  /* Menu tiles and variant chips are <button>s now (#183) so they are
     keyboard/screen-reader reachable; these resets keep the tile look the
     plain <div> had before. */
  .menu-item, .variant-chip {
    font: inherit;
    color: inherit;
    text-align: inherit;
    appearance: none;
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

  /* Failed order attempt (#183): the selection stays so the customer can retry. */
  .order-error {
    color: var(--oc-error, #ff453a);
    font-size: var(--glp-fs-1);
    line-height: 1.4;
    text-align: center;
  }

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
