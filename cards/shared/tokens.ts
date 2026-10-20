// GLP-TOKENS: the CSS custom-property contract both the Shot Card and the
// Order Card import from here (cards/shared/).

export const TOKENS: string = `  :host {
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
  }`;
