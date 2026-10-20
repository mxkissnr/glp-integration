// ─── styles ───────────────────────────────────────────────────────────────────

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
     hybrid theming happens one level up, in the GLP-TOKENS block above */
  :host {
    --bg:      var(--glp-bg);
    --surface: var(--glp-surface);
    --s2:      color-mix(in srgb, var(--glp-surface) 85%, var(--glp-text) 15%);
    --border:  var(--glp-border);
    --text:    var(--glp-text);
    --sub:     var(--glp-sub);
    --accent:  var(--glp-err);
    --green:   var(--glp-ok);
    --amber:   var(--glp-warn);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  /* Base sizing for every drawn icon inserted via ICONS.of() (GLP-SHARED:icons
     v1 above) — 1em locks it to whatever font-size token its container already
     resolves through, so the same icon dropped into a status line vs. a pill
     vs. a bean row never needs a second, size-specific copy of this rule.
     currentColor is what lets one icon sit inside a muted label, a semantic
     green pill or an accent underline with no per-context markup.
     stroke/fill are NOT optional here: an <svg> with neither defaults to
     fill:black + stroke:none, which renders every one of these stroke-drawn
     paths as a solid black blob. Nothing in the test suite can see that, so
     it fails silently and only in the browser. The rating row deliberately
     re-enables fill on .on to get a solid star out of the same path. */
  .glp-i { width: 1em; height: 1em; stroke: currentColor; fill: none; stroke-width: 1.8; vertical-align: -0.15em; flex-shrink: 0; }

  ha-card {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .card {
    background: var(--bg);
    border-radius: var(--glp-radius);
    padding: var(--glp-sp-5) var(--glp-sp-4) var(--glp-sp-3);
    font-family: var(--paper-font-body1_-_font-family, -apple-system, sans-serif);
    color: var(--text);
    overflow: hidden;
    user-select: none;
    border: 1px solid var(--border);
    box-shadow: var(--ha-card-box-shadow, none);
  }

  /* ── header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--glp-sp-4);
  }
  /* Uppercase + letter-spacing dropped (#120) — labels read as sentence
     case now, small and muted via --glp-sub rather than shouting via caps. */
  .title {
    display: flex;
    align-items: center;
    gap: var(--glp-sp-2);
    font-size: var(--glp-fs-1);
    font-weight: 600;
    color: var(--sub);
  }
  .title svg { opacity: .5; flex-shrink: 0; }
  /* #87: the detailed machine icon renders in the (possibly themed)
     --glp-accent-start/-end colour, so it must NOT get the generic title
     icon's dimming opacity — full opacity, sized to the title's line-height,
     aspect ratio matches the icon's 100x162 viewBox. */
  .machine-icon-badge { display: flex; flex-shrink: 0; width: 12px; height: 19px; }
  .title .machine-icon-badge svg { opacity: 1; width: 100%; height: 100%; display: block; }
  .header-right { display: flex; align-items: center; gap: var(--glp-sp-2); }
  /* Border diet (#120): not clickable, so it groups via fill only, no border. */
  .machine-uptime {
    display: flex; align-items: center; gap: 3px;
    font-size: var(--glp-fs-1); font-weight: 600; color: var(--sub);
    font-variant-numeric: tabular-nums;
    background: var(--surface);
    border-radius: var(--glp-radius-sm); padding: 2px var(--glp-sp-2);
  }
  .machine-uptime svg { width: 11px; height: 11px; flex-shrink: 0; }

  /* status dot */
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: color-mix(in srgb, var(--text) 15%, transparent); flex-shrink: 0;
  }
  .status-dot.online  {
    background: var(--green);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 30%, transparent);
  }
  .status-dot.brewing {
    background: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .status-dot.error { background: var(--accent); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }

  /* power button */
  .power-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--glp-radius-sm);
    padding: var(--glp-sp-2) var(--glp-sp-3);
    min-height: 38px;
    cursor: pointer;
    color: var(--sub);
    display: flex; align-items: center;
    transition: all .15s;
    touch-action: manipulation;
  }
  .power-btn:active { background: var(--s2); }
  .power-btn.is-on  { color: var(--green); border-color: color-mix(in srgb, var(--green) 30%, transparent); }
  .off-label { font-size: var(--glp-fs-1); color: var(--sub); }
  .card.collapsed .header { margin-bottom: 0; }

  /* ── tab bar ── */
  .tab-bar {
    display: flex; gap: 3px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-1);
    margin-bottom: var(--glp-sp-4);
  }
  .tab-btn {
    /* Top corners only: a border-bottom on a fully rounded box gets bent
       around the corner radius with it, which renders the active underline
       as a shallow curve running out past the tab's own width instead of a
       straight 2px rule. */
    flex: 1; background: none; border: none;
    border-radius: var(--glp-radius-sm) var(--glp-radius-sm) 0 0;
    padding: var(--glp-sp-2) 0; min-height: 36px;
    color: var(--sub);
    font-family: inherit; font-size: var(--glp-fs-1); font-weight: 600;
    cursor: pointer; transition: all .2s;
    touch-action: manipulation;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    /* Active marker is a 2px underline in --glp-aline rather than a filled
       chip — the accent line, contrast-corrected per machine theme, doing
       the marking instead of another background box. */
    border-bottom: 2px solid transparent;
  }
  .tab-btn svg { width: 14px; height: 14px; opacity: .7; flex-shrink: 0; }
  .tab-btn svg.due { width: 11px; height: 11px; opacity: 1; color: var(--accent); }
  .tab-btn.active {
    color: var(--text);
    border-bottom-color: var(--glp-aline);
  }
  .tab-btn.active svg { opacity: 1; }

  /* ── swipe target ── */
  .swipe-target { touch-action: pan-y; position: relative; overflow: hidden; }
  .swipe-content { /* animation target — see _navShotAnimated() */ }

  /* ── shot hero ── */
  .shot-hero {
    display: flex; align-items: center; gap: var(--glp-sp-3);
    margin-bottom: var(--glp-sp-4);
  }
  .shot-hero-main { flex: 1; min-width: 0; }
  /* Score ring → typographic verdict (#120): the number carries the
     weight, the word names it, no circle/badge chrome. Score thresholds
     are unchanged (see the scoreCls computation in _render()) — only the
     presentation changed here. Sans throughout, incl. the number: Fraunces
     stays reserved for the bean name alone (see .shot-coffee below). */
  .verdict {
    flex-shrink: 0; display: flex; align-items: baseline; gap: 3px;
  }
  .verdict-num { font-size: var(--glp-fs-4); font-weight: 700; line-height: 1; color: var(--text); }
  .verdict-sep { font-size: var(--glp-fs-2); color: var(--sub); }
  .verdict-word { font-size: var(--glp-fs-2); color: var(--sub); }
  .verdict.high .verdict-num, .verdict.high .verdict-word { color: var(--green); }
  .verdict.mid  .verdict-num, .verdict.mid  .verdict-word { color: var(--amber); }
  .verdict.low  .verdict-num, .verdict.low  .verdict-word { color: var(--accent); }
  .shot-profile {
    font-size: var(--glp-fs-5);
    font-weight: 800;
    letter-spacing: -.02em;
    line-height: 1.15;
    margin-bottom: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .shot-meta {
    display: flex; align-items: center; gap: var(--glp-sp-2);
    font-size: var(--glp-fs-1); color: var(--sub);
    overflow: hidden;
  }
  /* Border diet (#120): not clickable, groups via fill only. */
  .shot-drink {
    background: color-mix(in srgb, var(--text) 8%, transparent);
    border-radius: var(--glp-radius-sm);
    padding: 1px var(--glp-sp-2);
    font-size: var(--glp-fs-1); font-weight: 600;
    white-space: nowrap; flex-shrink: 0;
  }
  .shot-coffee {
    /* Fraunces stays scoped to exactly this element (#120) — not the shot
       title (.shot-profile above, sans/800) and not the verdict. No
       @font-face is bundled here: this is a single-file Lovelace element
       with no font asset shipped alongside it (unlike the app, which
       already bundles Fraunces in public-src/fonts/), and reaching out to
       a font CDN from a HA custom card would add a network dependency this
       file has never had. Falls back to the platform serif stack, which is
       still the intended visual note (a warm serif against the sans
       everywhere else) even where Fraunces itself isn't installed. */
    font-family: Fraunces, Georgia, 'Times New Roman', serif;
    font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .shot-coffee .glp-i { width: 12px; height: 12px; vertical-align: -1px; opacity: .7; }
  .shot-bean-extra {
    color: var(--sub); font-size: var(--glp-fs-1);
    white-space: nowrap; flex-shrink: 0;
  }
  .shot-grind {
    display: flex; align-items: center; gap: 4px;
    margin-top: var(--glp-sp-1); font-size: var(--glp-fs-1); color: var(--sub);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .shot-grind svg { width: 11px; height: 11px; flex-shrink: 0; opacity: .7; }

  /* ── nav ── */
  .nav-row {
    display: flex; align-items: center;
    gap: var(--glp-sp-2); margin-bottom: var(--glp-sp-3);
  }
  .nav-arrow {
    background: none; border: none;
    padding: 0; width: 32px; height: 32px;
    cursor: pointer; color: color-mix(in srgb, var(--text) 35%, transparent);
    font-size: var(--glp-fs-5); line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: color .15s; touch-action: manipulation; flex-shrink: 0;
  }
  .nav-arrow:active:not([disabled]) { color: var(--text); }
  .nav-arrow[disabled] { opacity: .12; cursor: default; pointer-events: none; }
  .nav-dots {
    flex: 1; display: flex; gap: 5px;
    align-items: center; justify-content: center;
  }
  .nav-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: color-mix(in srgb, var(--text) 18%, transparent);
    flex-shrink: 0;
  }
  /* The active dot is the active row of the shot list — exactly the case
     --glp-aline was introduced for (a themed, contrast-corrected line/marker
     standing in for what used to just be flat --text). */
  .nav-dot.active {
    width: 18px; border-radius: 3px;
    background: var(--glp-aline);
  }
  .nav-dot.active.changed {
    animation: dot-grow .22s cubic-bezier(.34,1.56,.64,1) both;
  }
  @keyframes dot-grow {
    from { width: 5px; border-radius: 50%; opacity: .4; }
    to   { width: 18px; border-radius: 3px; opacity: 1; }
  }
  .nav-ts {
    font-size: var(--glp-fs-1); color: var(--sub);
    text-align: center; margin-top: -6px; margin-bottom: var(--glp-sp-3); opacity: .7;
  }

  /* ── guided metric line (#120) ──────────────────────────────────────────
     Was two separate three-tile box rows (.metric-trio for a historical
     shot, .live-stats for a brewing one) — the single clearest "generated
     UI" tell in this file per two independent audits landing on the exact
     same finding. One component now serves both call sites (_metricLineHtml()
     in the render code below); which one is on screen is still driven by the
     brewing flag, same as before.
     The three roles (recipe = what was asked for, process = what happened,
     result = what came out) stay legible without three separate boxes: they
     are told apart by size/weight/color alone, not by grouping into cards —
     recipe is the quietest (muted, regular weight), process is mid-weight,
     result is the loudest (largest, full-contrast text or, for the historical
     yield/ratio pairing, plain — see the role assignment at the call site for
     why temp/pressure/weight map to recipe/process/result while brewing, and
     ratio/duration/yield do so for a finished shot). */
  .metric-line {
    display: flex; align-items: flex-end; gap: var(--glp-sp-5);
    margin-bottom: var(--glp-sp-3);
  }
  .metric-item { display: flex; flex-direction: column; gap: 2px; }
  .metric-item .num { font-variant-numeric: tabular-nums; line-height: 1; }
  .metric-item .unit { font-size: var(--glp-fs-1); font-weight: 500; color: var(--sub); margin-left: 1px; }
  .metric-item .lbl { font-size: var(--glp-fs-1); color: var(--sub); }
  .metric-item.role-recipe  .num { font-size: var(--glp-fs-3); font-weight: 600; color: var(--sub); }
  .metric-item.role-process .num { font-size: var(--glp-fs-4); font-weight: 700; color: var(--text); }
  .metric-item.role-result  .num { font-size: var(--glp-fs-5); font-weight: 700; color: var(--text); }

  /* secondary stats — border diet (#120): not clickable, so grouping comes
     from being inline text on the card's own background, not a nested box. */
  .stats-secondary {
    display: flex; gap: var(--glp-sp-5); margin-bottom: var(--glp-sp-3);
  }
  .stat-pill { display: flex; flex-direction: column; gap: 2px; }
  .stat-pill-label { font-size: var(--glp-fs-1); color: var(--sub); }
  .stat-pill-value { font-size: var(--glp-fs-3); font-weight: 700; letter-spacing: -.02em; }

  /* rating stars — drawn icons (ICONS.of('star')) replace the ★ text
     character; filled vs. empty is the .on class on the same shape. */
  .rating-row {
    display: flex; justify-content: center; align-items: center; gap: 3px;
    margin-bottom: var(--glp-sp-3);
  }
  .rating-row .glp-i { width: 15px; height: 15px; opacity: .2; }
  .rating-row .glp-i.on { opacity: 1; fill: currentColor; }
  .rating-row .glp-i.on.high  { color: var(--green); }
  .rating-row .glp-i.on.mid   { color: var(--amber); }
  .rating-row .glp-i.on.low   { color: var(--accent); }

  /* ── chart ── */
  .chart-wrap {
    margin-bottom: var(--glp-sp-1);
    border-radius: var(--glp-radius-sm);
    overflow: hidden;
  }
  .chart-legend2 {
    display: flex; flex-wrap: wrap; gap: 6px var(--glp-sp-4); justify-content: center;
    margin-top: var(--glp-sp-2);
  }
  .cl-item { font-size: var(--glp-fs-1); color: var(--sub); display: flex; align-items: center; gap: 5px; }
  .cl-item b { color: var(--text); font-weight: 700; }
  .cl-dot { width: 9px; height: 3px; border-radius: 2px; display: inline-block; }
  .chart-phases { display: flex; gap: var(--glp-sp-2); justify-content: center; margin-top: 6px; margin-bottom: var(--glp-sp-3); }
  .ph-tag { font-size: var(--glp-fs-1); font-weight: 600; padding: 2px var(--glp-sp-2); border-radius: var(--glp-radius-sm); }
  .ph-pre { color: var(--glp-series-pres); background: color-mix(in srgb, var(--glp-series-pres) 14%, transparent); }
  .ph-ext { color: var(--glp-series-flow); background: color-mix(in srgb, var(--glp-series-flow) 13%, transparent); }

  /* ── curve-draw-in (#120) ── shot load draws the curve instead of a
     shimmer loader — movement encodes the state "a shot just loaded", it
     doesn't decorate. Only the historical shot chart animates (see the
     animate param on buildShotChart()/the .glp-anim class below); the
     live brewing chart redraws on every datapoint tick and must never
     restart a 1.5s intro on each of those. stroke-dasharray/-dashoffset use
     an overestimate of the longest possible polyline in this chart's 320×150
     viewBox — the exact path length doesn't matter for this technique, only
     that the dash length is at least as long as the path. */
  .glp-anim .glp-curve-line {
    stroke-dasharray: 900;
    stroke-dashoffset: 900;
    animation: glp-draw-line 1s ease-out forwards;
  }
  .glp-anim .glp-curve-line.s-weight   { animation-delay: 0s; }
  .glp-anim .glp-curve-line.s-flow     { animation-delay: .15s; }
  .glp-anim .glp-curve-line.s-pressure { animation-delay: .3s; }
  .glp-anim .glp-curve-line.s-temp     { animation-delay: .45s; }
  .glp-anim .glp-curve-phase {
    opacity: 0;
    animation: glp-fade-in .8s ease-out forwards;
  }
  .glp-anim .glp-curve-endpoint {
    opacity: 0;
    animation: glp-fade-in .3s ease-out forwards;
    animation-delay: 1.3s;
  }
  @keyframes glp-draw-line { from { stroke-dashoffset: 900; } to { stroke-dashoffset: 0; } }
  @keyframes glp-fade-in   { from { opacity: 0; } to { opacity: 1; } }

  /* ── profile picker ── */
  /* live machine panel */
  .live-machine { margin-bottom: var(--glp-sp-4); }
  .lm-head {
    display: flex; align-items: center; gap: 6px;
    font-size: var(--glp-fs-1);
    color: var(--sub); margin-bottom: var(--glp-sp-2);
  }
  .lm-live-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 45%, transparent);
    animation: lm-pulse 2s ease-in-out infinite;
  }
  @keyframes lm-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: .35; }
  }
  .lm-tiles { display: flex; gap: var(--glp-sp-2); }
  /* Border diet (#120): static readouts, not clickable — grouped by fill,
     no border. The warming state still needs to stand out, so it keeps a
     tinted background instead of a tinted border. */
  .lm-tile {
    flex: 1; background: var(--surface);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-2) 6px; text-align: center;
  }
  .lm-tile.warming { background: color-mix(in srgb, var(--amber) 12%, var(--surface)); }
  .lm-val { font-size: var(--glp-fs-4); font-weight: 700; color: var(--text); letter-spacing: -.02em; line-height: 1.1; }
  .lm-tile.warming .lm-val { color: var(--amber); }
  .lm-unit { font-size: var(--glp-fs-1); color: var(--sub); margin-left: 1px; font-weight: 500; }
  .lm-lbl { font-size: var(--glp-fs-1); color: var(--sub); margin-top: 2px; }

  .profile-picker { margin-bottom: var(--glp-sp-4); }
  .profile-current-btn {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--glp-radius-sm);
    padding: var(--glp-sp-3) var(--glp-sp-4);
    min-height: 46px;
    cursor: pointer; color: var(--text);
    font-family: inherit; font-size: var(--glp-fs-2); font-weight: 600;
    display: flex; align-items: center; justify-content: space-between;
    touch-action: manipulation; transition: all .15s;
  }
  .profile-current-btn:active { background: var(--s2); }
  .profile-current-btn.open {
    border-color: color-mix(in srgb, var(--text) 18%, transparent);
    border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;
  }
  .profile-label-small { font-size: var(--glp-fs-1); color: var(--sub); font-weight: 500; }
  .profile-current-name { flex: 1; text-align: left; }
  .profile-chevron {
    color: var(--sub); font-size: var(--glp-fs-1); margin-left: var(--glp-sp-2);
    transition: transform .2s; opacity: .6;
  }
  .profile-chevron.open { transform: rotate(180deg); }
  /* Border diet (#120): this panel is a dropdown surface, not itself
     clickable — dropping its border (previously bordered on all 4 sides,
     nested inside the card's own border, with the .profile-opt buttons
     bordered again inside THAT) was the "three levels deep" case from the
     redesign notes. The buttons below keep their border; they're what's
     actually clickable. */
  .profile-opts {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: var(--glp-sp-3) var(--glp-sp-3) var(--glp-sp-3);
    background: var(--surface);
    border-bottom-left-radius: var(--glp-radius-sm); border-bottom-right-radius: var(--glp-radius-sm);
  }
  .profile-opt {
    background: color-mix(in srgb, var(--text) 6%, transparent); border: 1px solid var(--border);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-2) var(--glp-sp-4); min-height: 34px;
    cursor: pointer; color: var(--text);
    font-family: inherit; font-size: var(--glp-fs-1); font-weight: 500;
    touch-action: manipulation; transition: all .15s; white-space: nowrap;
  }
  .profile-opt:active { background: color-mix(in srgb, var(--text) 12%, transparent); }
  .profile-opt.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); font-weight: 700;
  }

  /* ── banners ── border diet (#120): status text, not clickable — the
     tinted background alone carries the semantic color now. */
  .brewing-banner {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-3) var(--glp-sp-4);
    font-size: var(--glp-fs-2); font-weight: 700; color: var(--accent);
    text-align: center; margin-bottom: var(--glp-sp-3);
  }
  .steam-banner {
    background: color-mix(in srgb, var(--amber) 7%, transparent);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-2) var(--glp-sp-4);
    font-size: var(--glp-fs-2); font-weight: 600; color: var(--amber);
    text-align: center; margin-bottom: var(--glp-sp-3);
  }
  /* Same --accent family as .brewing-banner and .maint-pill.due (#170) --
     descaling is a due-maintenance operation in this design system's own
     color language, not a brand-new hue. Differentiated from the static
     brewing/steam banners by a slow icon pulse instead: an ongoing
     maintenance process reads as "in progress", not just "on". */
  .descaling-banner {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-3) var(--glp-sp-4);
    font-size: var(--glp-fs-2); font-weight: 700; color: var(--accent);
    text-align: center; margin-bottom: var(--glp-sp-3);
  }
  .descaling-banner svg { animation: descale-pulse 1.6s ease-in-out infinite; }
  @keyframes descale-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .water-low {
    background: color-mix(in srgb, var(--accent) 7%, transparent);
    border-radius: var(--glp-radius-sm); padding: 7px var(--glp-sp-4);
    font-size: var(--glp-fs-1); font-weight: 600; color: var(--accent);
    text-align: center; margin-bottom: var(--glp-sp-3);
  }
  .brewing-banner svg, .steam-banner svg, .descaling-banner svg, .water-low svg, .preheat-ready svg {
    width: 13px; height: 13px; vertical-align: -2px;
  }

  /* ── preheat ── */
  .preheat-ready {
    display: flex; align-items: center; justify-content: center; gap: var(--glp-sp-2);
    background: color-mix(in srgb, var(--green) 8%, transparent);
    color: var(--green); border-radius: var(--glp-radius-sm); padding: var(--glp-sp-3) var(--glp-sp-4);
    font-size: var(--glp-fs-2); font-weight: 700; margin-bottom: var(--glp-sp-4);
  }
  .preheat-warming { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--glp-sp-4); }
  .preheat-warming-label {
    display: flex; justify-content: space-between; align-items: center; gap: 4px;
    font-size: var(--glp-fs-1); color: var(--sub);
  }
  .preheat-warming-label svg { width: 12px; height: 12px; opacity: .7; }
  .preheat-bar-bg { height: 3px; background: color-mix(in srgb, var(--text) 7%, transparent); border-radius: 2px; overflow: hidden; }
  .preheat-bar-fill {
    height: 100%; border-radius: 2px;
    background: var(--glp-accent);
    transition: width .8s ease;
  }

  /* ── ready-by preheat scheduler (#61) ── border diet (#120): the wrapper
     groups via surface fill only; the time input and buttons inside keep
     their borders since those are the actually-interactive elements. */
  .ready-by {
    display: flex; align-items: center; justify-content: space-between; gap: var(--glp-sp-3);
    background: var(--surface);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-3) var(--glp-sp-4); margin-top: var(--glp-sp-3); margin-bottom: var(--glp-sp-4);
  }
  .ready-by-picker { flex-direction: column; align-items: stretch; gap: var(--glp-sp-2); }
  .ready-by-picker-row { display: flex; align-items: center; gap: var(--glp-sp-2); }
  .ready-by-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .ready-by-label { font-size: var(--glp-fs-1); color: var(--sub); font-weight: 500; }
  .ready-by-set .ready-by-label { color: var(--text); font-size: var(--glp-fs-2); font-weight: 700; }
  .ready-by-countdown { font-size: var(--glp-fs-1); color: var(--sub); }
  .ready-by-time-input {
    background: var(--s2); border: 1px solid var(--border); border-radius: var(--glp-radius-sm);
    color: var(--text); font-family: inherit; font-size: var(--glp-fs-2); padding: 6px var(--glp-sp-2);
    min-height: 34px; flex: 1; min-width: 0;
  }
  .ready-by-btn {
    border: none; border-radius: var(--glp-radius-sm); font-family: inherit; font-weight: 700;
    font-size: var(--glp-fs-1); padding: 7px var(--glp-sp-3); cursor: pointer; min-height: 34px;
    touch-action: manipulation; white-space: nowrap;
  }
  .ready-by-btn.primary { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); }
  .ready-by-btn.ghost   { background: transparent; border: 1px solid var(--border); color: var(--sub); }

  /* ── maintenance ── border diet (#120): the row itself is only clickable
     (role="button") when it has a confirm flow behind it — a static
     grinder-status row gets no border, just the shared surface fill. */
  .maint-list { display: flex; flex-direction: column; gap: var(--glp-sp-2); margin-bottom: var(--glp-sp-3); }
  .maint-row {
    background: var(--surface);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-3);
    display: flex; flex-direction: column; gap: 5px;
  }
  .maint-row[role="button"] { border: 1px solid var(--border); }
  .maint-row-top { display: flex; align-items: center; gap: var(--glp-sp-2); }
  .maint-row-top svg { width: 14px; height: 14px; opacity: .8; flex-shrink: 0; }
  .maint-name { flex: 1; font-size: var(--glp-fs-2); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .maint-pill {
    font-size: var(--glp-fs-1); font-weight: 700; padding: 2px var(--glp-sp-2); border-radius: var(--glp-radius-sm);
    white-space: nowrap; display: inline-flex; align-items: center; gap: 3px;
  }
  .maint-pill .glp-i { width: 11px; height: 11px; }
  .maint-pill.ok    { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
  .maint-pill.soon  { color: var(--amber); background: color-mix(in srgb, var(--amber) 12%, transparent); }
  .maint-pill.due   { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .maint-pill.never { color: var(--sub); background: color-mix(in srgb, var(--text) 7%, transparent); }
  .maint-sub { font-size: var(--glp-fs-1); color: var(--sub); }
  .maint-bar-bg { height: 2px; background: color-mix(in srgb, var(--text) 7%, transparent); border-radius: 1px; overflow: hidden; }
  .maint-bar { height: 100%; border-radius: 1px; }
  .maint-bar.ok    { background: var(--green); }
  .maint-bar.soon  { background: var(--amber); }
  .maint-bar.due   { background: var(--accent); }
  .maint-bar.never { background: color-mix(in srgb, var(--text) 12%, transparent); }
  .section-label, .maint-section-label { font-size: var(--glp-fs-1); color: var(--sub); font-weight: 600; margin-top: var(--glp-sp-1); }
  .maint-row[role="button"] { cursor: pointer; transition: border-color .15s, background .15s; }
  .maint-row[role="button"]:hover { border-color: color-mix(in srgb, var(--text) 16%, transparent); }
  .maint-row.confirming { border: 1px solid color-mix(in srgb, var(--amber) 40%, transparent); background: color-mix(in srgb, var(--amber) 6%, transparent); }
  .maint-confirm { display: flex; align-items: center; gap: var(--glp-sp-2); margin-top: var(--glp-sp-1); }
  .maint-confirm-q { flex: 1; font-size: var(--glp-fs-1); color: var(--sub); }
  .maint-confirm-yes, .maint-confirm-no {
    border: none; border-radius: var(--glp-radius-sm); font-family: inherit; font-weight: 700;
    font-size: var(--glp-fs-1); padding: 5px var(--glp-sp-3); cursor: pointer;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .maint-confirm-yes { background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); }
  .maint-confirm-no  { background: var(--surface); color: var(--sub); }
  .maint-confirm-no svg { width: 11px; height: 11px; }

  /* ── orders tab ── */
  .tab-badge {
    display: inline-block; min-width: 16px; padding: 0 var(--glp-sp-1); margin-left: var(--glp-sp-1);
    font-size: var(--glp-fs-1); font-weight: 600; line-height: 16px; text-align: center;
    border-radius: var(--glp-radius-sm); background: var(--accent); color: #fff;
  }
  /* Border diet (#120): accepted rows group via fill only; a pending order
     keeps a border, but as a semantic "needs your attention" state marker
     (like maint-row.confirming above), not a default box around content. */
  .ord-list { display: flex; flex-direction: column; gap: var(--glp-sp-2); margin-bottom: var(--glp-sp-3); }
  .ord-row {
    background: var(--surface);
    border-radius: var(--glp-radius-sm); padding: var(--glp-sp-3); display: flex; flex-direction: column; gap: 7px;
  }
  .ord-row.pending  { border: 1px solid color-mix(in srgb, var(--amber) 30%, transparent); }
  .ord-top { display: flex; align-items: baseline; gap: var(--glp-sp-2); }
  .ord-top .glp-i { width: 13px; height: 13px; vertical-align: -1px; opacity: .8; }
  .ord-item { flex: 1; font-size: var(--glp-fs-3); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord-who  { font-size: var(--glp-fs-1); color: var(--sub); white-space: nowrap; flex-shrink: 0; }
  .ord-note { font-size: var(--glp-fs-1); color: var(--sub); font-style: italic; }
  .ord-sub  { font-size: var(--glp-fs-1); color: var(--green); font-weight: 600; }
  .ord-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .ord-q { font-size: var(--glp-fs-1); color: var(--sub); margin-right: 2px; }
  .ord-btn {
    border: none; border-radius: var(--glp-radius-sm); font-family: inherit; font-weight: 700;
    font-size: var(--glp-fs-1); padding: 6px var(--glp-sp-3); cursor: pointer; min-height: 32px;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .ord-btn.primary { background: var(--green); color: #06210f; }
  .ord-btn.eta     { background: color-mix(in srgb, var(--text) 9%, transparent); color: var(--text); }
  .ord-btn.danger  { background: var(--accent); color: #fff; }
  .ord-btn.ghost   { background: transparent; border: 1px solid var(--border); color: var(--sub); }
  .ord-btn svg { width: 12px; height: 12px; }

  /* ── footer ── */
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    font-size: var(--glp-fs-1); color: var(--sub);
    border-top: 1px solid color-mix(in srgb, var(--text) 5%, transparent);
    padding-top: var(--glp-sp-2); margin-top: 6px; gap: var(--glp-sp-2);
  }
  .footer-item { display: flex; align-items: center; gap: 4px; }
  .footer-item svg { width: 11px; height: 11px; opacity: .8; flex-shrink: 0; }
  .footer a { color: var(--sub); text-decoration: none; }
  .footer a:hover { color: var(--text); }

  /* ── misc ── */
  .unavailable {
    color: var(--sub); font-size: var(--glp-fs-2);
    text-align: center; padding: var(--glp-sp-5) 0; opacity: .6;
  }
  .no-shot { text-align: center; padding: var(--glp-sp-5) 0; }
  .no-shot-label { font-size: var(--glp-fs-2); color: var(--sub); margin-bottom: 4px; }
  .no-shot-hint  { font-size: var(--glp-fs-1); color: color-mix(in srgb, var(--text) 20%, transparent); }

  /* ── touch targets ── */
  @media (pointer: coarse) {
    .card { padding: 16px 14px 12px; }
    .nav-arrow { width: 40px; height: 40px; font-size: var(--glp-fs-5); }
    .tab-btn   { min-height: 44px; }
    .profile-current-btn { min-height: 50px; }
    .profile-opt { min-height: 40px; padding: 9px 18px; }
    .power-btn { min-height: 42px; }
    .metric-item.role-result .num { font-size: var(--glp-fs-6); }
  }

  /* ── prefers-reduced-motion (#120) ── previously covered one of the four
     animated effects in this file (.lm-live-dot only); now complete. Each
     entry disables the animation AND pins the element to the state the
     animation would have ended at — for .lm-live-dot/.status-dot.brewing
     that's just their static (already-defined) base rule, so "animation:
     none" alone is enough; the nav-dot width/radius is likewise already
     fixed by .nav-dot.active outside the keyframe. The curve draw-in is the
     one case where "no animation" would otherwise mean "invisible forever"
     (stroke-dashoffset stuck at 900, opacity stuck at 0), so those three
     properties get pinned to their finished values explicitly. */
  @media (prefers-reduced-motion: reduce) {
    .lm-live-dot { animation: none; }
    .status-dot.brewing { animation: none; }
    .nav-dot.active.changed { animation: none; }
    .glp-curve-line, .glp-curve-phase, .glp-curve-endpoint { animation: none; }
    .glp-curve-line { stroke-dashoffset: 0; }
    .glp-curve-phase, .glp-curve-endpoint { opacity: 1; }
  }
`;
