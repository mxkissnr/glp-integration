// GLP-SHARED colour-contrast helpers imported by both cards (Shot Card and Order Card).

import type { Rgb } from './types.ts';

// Resolves a CSS color string to [r, g, b] (0-255) by normalizing it
// through a scratch element's computed style, so hex/rgb/named/color-mix
// all work — whatever the real cascade actually produced. Split out of
// luminanceOf() (which now builds on it) because --glp-aline has to
// BLEND two resolved colors, not merely compare their luminance.
function rgbOf(host: HTMLElement, cssColor: string): Rgb | null {
  if (!cssColor) return null;
  let rgb: string | undefined;
  try {
    const probe = document.createElement('span');
    probe.style.cssText = 'display:none';
    probe.style.color = cssColor;
    host.shadowRoot!.appendChild(probe);
    rgb = getComputedStyle(probe).color;
    probe.remove();
  } catch { return null; }
  const m = rgb && rgb.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  return m.slice(0, 3).map(Number) as Rgb;
}

// Resolves the relative luminance of a CSS color string by normalizing it
// through a scratch element's computed style (handles hex/rgb/named/etc —
// whatever the real cascade actually resolved a custom property to).
// Returns null if it can't be determined (no DOM, unset value, ...).
function luminanceOf(host: HTMLElement, cssColor: string): number | null {
  const rgb = rgbOf(host, cssColor);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Relative-luminance contrast ratio of two [r,g,b] triples, WCAG 2.x.
function contrastOf(rgbA: Rgb, rgbB: Rgb): number {
  const lum = ([r, g, b]: Rgb) => {
    const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
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
// long comments in the GLP-TOKENS block for the measured contrast
// ratios behind all four). Sets the winning values as an inline style on
// the host, which always outranks the plain :host declarations in STYLES
// regardless of any stylesheet/media-query state. Called from _render()
// right after the shadow DOM (and its :host rules) are rebuilt.
function applySemanticColorContrast(host: HTMLElement): void {
  const bgLuminance = luminanceOf(host, getComputedStyle(host).getPropertyValue('--glp-bg').trim());
  if (bgLuminance != null) {
    // 0.179 is the standard WCAG "flip point": the background luminance
    // above which a darker foreground becomes the higher-contrast choice.
    const light = bgLuminance > 0.179;
    host.style.setProperty('--glp-ok',   light ? '#15803d' : '#22c55e');
    host.style.setProperty('--glp-warn', light ? '#a16207' : '#eab308');
    host.style.setProperty('--glp-err',  light ? '#dc2626' : '#ef4444');
  }
  // mxkissnr/glp-lovelace-card#87 / mxkissnr/glp-order-card#62: when a
  // per-machine gradient theme is active, --glp-accent-start
  // and --glp-accent-end differ — pick the DARKER (lower-luminance) stop
  // as the worst case, since text/icon content can sit anywhere across the
  // gradient. A flat colour (no theme, or a flat custom/preset) has both
  // stops equal, so this reduces to the original single-value check.
  const startLuminance = luminanceOf(host, getComputedStyle(host).getPropertyValue('--glp-accent-start').trim());
  const endLuminance    = luminanceOf(host, getComputedStyle(host).getPropertyValue('--glp-accent-end').trim());
  const accentLuminance = [startLuminance, endLuminance].filter((v): v is number => v != null)
    .reduce<number | null>((min, v) => (min == null || v < min ? v : min), null);
  if (accentLuminance != null) {
    // Pure #000/#fff at the same 0.179 split is a mathematical guarantee
    // of >=4.58:1 against ANY accent color (both text colors measure
    // exactly that at the crossover luminance, and only gain contrast
    // moving away from it) — no need to check specific theme values here.
    host.style.setProperty('--glp-accent-text', accentLuminance > 0.179 ? '#000' : '#fff');
  }
  applyAccentLineContrast(host);
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
function applyAccentLineContrast(host: HTMLElement): void {
  const cs = getComputedStyle(host);
  const bg = rgbOf(host, cs.getPropertyValue('--glp-bg').trim());
  const text = rgbOf(host, cs.getPropertyValue('--glp-text').trim());
  const stops = (['--glp-accent-start', '--glp-accent-end']
    .map(v => rgbOf(host, cs.getPropertyValue(v).trim()))
    .filter(Boolean)) as Rgb[];
  if (!bg || !text || !stops.length) return;
  // Worst case = the stop with the lowest contrast against the background.
  const weakest = stops.reduce((worst, s) =>
    contrastOf(s, bg) < contrastOf(worst, bg) ? s : worst, stops[0]!);
  if (contrastOf(weakest, bg) >= 3) {
    host.style.setProperty('--glp-aline', `rgb(${weakest.join(' ')})`);
    return;
  }
  let out = weakest;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const mixed = weakest.map((c, i) => Math.round(c + (text[i]! - c) * t)) as Rgb;
    out = mixed;
    if (contrastOf(mixed, bg) >= 3) break;
  }
  host.style.setProperty('--glp-aline', `rgb(${out.join(' ')})`);
}

export { rgbOf, luminanceOf, contrastOf, applySemanticColorContrast, applyAccentLineContrast };
