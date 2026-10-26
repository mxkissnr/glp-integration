import { TOKENS } from '../../shared/tokens.ts';
import { SHEET_STYLES } from '../../shared/sheet.ts';

export const STYLES: string = `
${TOKENS}

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
  /* Base sizing for every drawn icon inserted via ICONS.of()
     (cards/shared/icons.ts) — 1em locks it to whatever font-size token its
     container already resolves through, so a coffee cup dropped into a button
     label vs.
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
  /* A bean chip with details is a chip plus a small info button (#274). The
     wrapper takes the grid cell the bare chip used to fill, so chips without
     details keep the exact same size and wrapping; the button hangs off the
     chip's right edge instead of adding a row. */
  .variant-chip-wrap { display: inline-flex; align-items: stretch; min-width: 0; }
  .variant-chip-wrap > .variant-chip { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .bean-info-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; padding: 0; border: 1px solid var(--oc-border); border-left: none;
    border-radius: 0 var(--glp-radius-sm) var(--glp-radius-sm) 0;
    background: var(--oc-surface); color: var(--oc-sub);
    font-size: var(--glp-fs-1); cursor: pointer; transition: all .15s;
  }
  .bean-info-btn:hover { color: var(--oc-text); background: color-mix(in srgb, var(--oc-text) 7%, transparent); }
  .bean-info-btn:focus-visible { outline: 2px solid var(--glp-aline); outline-offset: 1px; }

  /* Bean description, rendered as the details sheet's body (#274). The sheet
     panel is already a surface with its own padding, so this block adds none
     of its own — a second card inside a card would read as a nesting level
     that does not exist. */
  .bean-info { margin: 0; }
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
    .menu-item, .note-input, .order-btn, .new-order-btn, .variant-chip, .bean-info-btn {
      transition: none;
    }
    .status-card, .status-card.accepted .status-eta {
      animation: none;
    }
  }

  /* The sheet's mount point: an empty div after the card, so a re-render
     cannot take an open sheet down with it. The dialog inside is fixed. */
  .glp-sheet-slot { display: block; }

  /* The shared bottom sheet (#274): appended last so its rules win over the
     card's own, and so it resolves this card's --glp-* tokens. */
${SHEET_STYLES}
`;
