// App-style chart builders and formatting helpers, split out of glp-card.ts
// (#180). Not a GLP-SHARED block, so fully typed.

import { downsample, CC, esc } from './helpers.ts';
import { T } from './i18n.ts';

// A legend entry and a metric-line tile; the filter(Boolean) casts below
// restore these non-null shapes after the absent rows are dropped.
type LegendItem = { c: string; l: string; v: string };
type MetricItem = { role: string; num: string; unit?: string; label: string };

function _scale(arr: number[] | null | undefined): number[] {
  return (Array.isArray(arr) && arr.length) ? arr.map(v => v / 10) : [];
}

function fmtClock(s: number | null | undefined): string {
  if (s == null || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function fmtUptime(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || isNaN(ms)) return '';
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

// Preinfusion/extraction split detected from the pressure curve (same heuristic as the app)
function detectPhases(times: number[], pressures: number[]): { preinfusion: number; extraction: number } | null {
  if (!times?.length || !pressures || pressures.length < 5) return null;
  const THRESH = 3.5;
  let endIdx = -1;
  for (let i = 0; i < pressures.length; i++) {
    // noUncheckedIndexedAccess widens each indexed read to number|undefined;
    // the guard above already proves both arrays are present and long enough.
    if (times[i]! >= 1 && pressures[i]! >= THRESH) { endIdx = i; break; }
  }
  if (endIdx <= 0) return null;
  const preinfusion = times[endIdx]!;
  if (preinfusion < 1.5) return null;
  return { preinfusion, extraction: times[times.length - 1]! - preinfusion };
}

// App-style labeled chart: pressure + flow on left (bar) axis, temperature + weight on
// right axis, real time axis (s), gridlines, axis labels and preinfusion/extraction shading.
// `animate` (#120) turns on the shot-load curve-draw-in: pressure, flow,
// temp and weight draw in from the left, staggered, the phase-shading fills
// fading in behind them, an endpoint marker on the final weight last — see
// the .glp-anim rules in STYLES. Only the historical shot chart passes
// true; the live brewing chart (buildLiveChart(), below) never does, since
// it redraws on every incoming datapoint and must never replay a 1.5s intro
// on each of those ticks.
export function buildShotChart(pres: number[], temp: number[], wt: number[], flow: number[], durationSec: number | null | undefined, animate = false): string {
  const W = 320, H = 150, L = 30, R = 30, TOP = 12, BOT = 24;
  const plotW = W - L - R, plotH = H - TOP - BOT;
  const pr = _scale(downsample(pres || [], 150));
  const te = _scale(downsample(temp || [], 150));
  const we = _scale(downsample(wt   || [], 150));
  const fl = _scale(downsample(flow || [], 150));
  const n  = Math.max(pr.length, te.length, we.length, fl.length);
  if (n < 2) return '';
  const dur   = durationSec && durationSec > 0 ? durationSec : (n - 1);
  const times = Array.from({ length: n }, (_, i) => (i / (n - 1)) * dur);
  const PMAX  = 12;
  const rMax  = Math.max(110, Math.ceil(((te.length ? Math.max(...te) : 0) + 5) / 10) * 10);

  const xAt = (i: number) => L + (i / (n - 1)) * plotW;
  const xT  = (s: number) => L + (Math.max(0, Math.min(dur, s)) / dur) * plotW;
  const yL  = (v: number) => TOP + plotH - (Math.max(0, Math.min(PMAX, v)) / PMAX) * plotH;
  const yR  = (v: number) => TOP + plotH - (Math.max(0, Math.min(rMax, v)) / rMax) * plotH;
  const line = (arr: number[], map: (v: number) => number, color: string, sw: number, series: string) => arr.length < 2 ? '' :
    `<polyline points="${arr.map((v, i) => `${xAt(i).toFixed(1)},${map(v).toFixed(1)}`).join(' ')}"
      class="${animate ? `glp-curve-line s-${series}` : ''}"
      fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;

  const ph = detectPhases(times, pr);
  let phases = '';
  if (ph) {
    const xp = xT(ph.preinfusion);
    const phaseCls = animate ? ' class="glp-curve-phase"' : '';
    phases = `<rect${phaseCls} x="${L}" y="${TOP}" width="${(xp - L).toFixed(1)}" height="${plotH}" fill="color-mix(in srgb, var(--glp-series-pres, ${CC.pres}) 13%, transparent)"/>`
           + `<rect${phaseCls} x="${xp.toFixed(1)}" y="${TOP}" width="${(L + plotW - xp).toFixed(1)}" height="${plotH}" fill="color-mix(in srgb, var(--glp-series-flow, ${CC.flow}) 10%, transparent)"/>`;
  }
  // Endpoint marker (#120): the shot's final weight, the last thing the
  // draw-in reveals — appears only in animate mode, at the last weight
  // sample's actual plotted position.
  const endpoint = (animate && we.length)
    ? `<circle class="glp-curve-endpoint" cx="${xAt(we.length - 1).toFixed(1)}" cy="${yR(we[we.length - 1]!).toFixed(1)}" r="2.6" fill="${CC.wt}"/>`
    : '';

  let grid = '', leftLbl = '';
  [0, 3, 6, 9, 12].forEach(b => {
    const y = yL(b);
    grid    += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${L + plotW}" y2="${y.toFixed(1)}" stroke="color-mix(in srgb, var(--glp-text, #e4e4e7) 6%, transparent)" stroke-width="0.5"/>`;
    leftLbl += `<text x="${L - 4}" y="${(y + 2.5).toFixed(1)}" text-anchor="end" font-size="7" fill="var(--glp-sub, #a1a1aa)">${b}</text>`;
  });
  let rightLbl = '';
  [0, 0.5, 1].forEach(fr => {
    const val = Math.round(rMax * fr), y = yR(val);
    rightLbl += `<text x="${L + plotW + 4}" y="${(y + 2.5).toFixed(1)}" text-anchor="start" font-size="7" fill="var(--glp-sub, #a1a1aa)">${val}</text>`;
  });
  const step = dur <= 15 ? 3 : dur <= 30 ? 5 : dur <= 60 ? 10 : 15;
  let ticks = '';
  for (let s = 0; s <= dur + 0.001; s += step) {
    const x = xT(s);
    ticks += `<line x1="${x.toFixed(1)}" y1="${TOP + plotH}" x2="${x.toFixed(1)}" y2="${(TOP + plotH + 3).toFixed(1)}" stroke="color-mix(in srgb, var(--glp-text, #e4e4e7) 18%, transparent)" stroke-width="0.5"/>`
           + `<text x="${x.toFixed(1)}" y="${(TOP + plotH + 13).toFixed(1)}" text-anchor="middle" font-size="7" fill="var(--glp-sub, #a1a1aa)">${Math.round(s)}s</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" class="${animate ? 'glp-anim' : ''}">
    <rect x="${L}" y="${TOP}" width="${plotW}" height="${plotH}" fill="color-mix(in srgb, var(--glp-text, #e4e4e7) 3%, transparent)"/>
    ${phases}${grid}
    <line x1="${L}" y1="${TOP + plotH}" x2="${L + plotW}" y2="${TOP + plotH}" stroke="color-mix(in srgb, var(--glp-text, #e4e4e7) 22%, transparent)" stroke-width="0.6"/>
    ${line(we, yR, CC.wt, 1.6, 'weight')}
    ${line(fl, yL, CC.flow, 1.8, 'flow')}
    ${line(pr, yL, CC.pres, 2.2, 'pressure')}
    ${line(te, yR, CC.temp, 2, 'temp')}
    ${endpoint}
    ${leftLbl}${rightLbl}${ticks}
    <text x="${L - 2}" y="${TOP - 3}" text-anchor="start" font-size="6.5" fill="var(--glp-sub, #a1a1aa)">bar</text>
    <text x="${L + plotW + 2}" y="${TOP - 3}" text-anchor="end" font-size="6.5" fill="var(--glp-sub, #a1a1aa)">°C · g</text>
  </svg>`;
}

export function buildLiveChart(dp: Record<string, number[] | undefined>): string {
  const ti  = dp.timeInShot;
  const dur = Array.isArray(ti) && ti.length ? ti[ti.length - 1]! / 10 : null;
  return buildShotChart(dp.pressure || [], dp.temperature || [],
    dp.shotWeight || dp.weight || [], dp.pumpFlow || dp.weightFlow || [], dur);
}

// Legend with peak/final values + units and phase tags
export function chartLegendHtml(dp: Record<string, number[] | undefined>, durationSec: number | null | undefined): string {
  const p = _scale(dp.p || dp.pressure), t = _scale(dp.t || dp.temperature),
        w = _scale(dp.w || dp.shotWeight || dp.weight), f = _scale(dp.f || dp.pumpFlow || dp.weightFlow);
  const mx = (a: number[]) => a.length ? Math.max(...a) : null;
  const last = (a: number[]) => a.length ? a[a.length - 1]! : null;
  const items = ([
    p.length ? { c: CC.pres, l: T('leg_pressure'), v: `${mx(p)!.toFixed(1)} bar` }  : null,
    f.length ? { c: CC.flow, l: T('leg_flow'),     v: `${mx(f)!.toFixed(1)} ml/s` } : null,
    t.length ? { c: CC.temp, l: T('leg_temp'),     v: `${mx(t)!.toFixed(0)}°` }     : null,
    w.length ? { c: CC.wt,   l: T('leg_weight'),   v: `${last(w)!.toFixed(1)} g` }  : null,
  ] as (LegendItem | null)[]).filter(Boolean) as LegendItem[];
  let phaseTags = '';
  if (p.length > 1) {
    const dur = durationSec && durationSec > 0 ? durationSec : (p.length - 1);
    const times = Array.from({ length: p.length }, (_, i) => (i / (p.length - 1)) * dur);
    const ph = detectPhases(times, p);
    if (ph) phaseTags = `<div class="chart-phases">
      <span class="ph-tag ph-pre">${T('ph_pre')} ${fmtClock(ph.preinfusion)}</span>
      <span class="ph-tag ph-ext">${T('ph_ext')} ${fmtClock(ph.extraction)}</span></div>`;
  }
  return `<div class="chart-legend2">${items.map(i =>
    `<span class="cl-item"><span class="cl-dot" style="background:${i.c}"></span>${i.l} <b>${esc(i.v)}</b></span>`
  ).join('')}</div>${phaseTags}`;
}

// Guided metric line (#120) — one component for what used to be two
// separate three-tile box rows (a historical shot's duration/yield/ratio,
// and a brewing shot's live temp/pressure/weight). `items` is
// [{role, num, unit, label}]; role is 'recipe' | 'process' | 'result' and
// drives typographic weight only (see the .metric-item.role-* rules in
// STYLES) — there is deliberately no per-item box left to tell them apart.
export function metricLineHtml(items: (MetricItem | null | undefined)[]): string {
  const tiles = items.filter(Boolean) as MetricItem[];
  if (!tiles.length) return '';
  return `<div class="metric-line">
    ${tiles.map(t => `
      <div class="metric-item role-${t.role}">
        <div class="num">${esc(t.num)}${t.unit ? `<span class="unit">${esc(t.unit)}</span>` : ''}</div>
        <div class="lbl">${esc(t.label)}</div>
      </div>`).join('')}
  </div>`;
}
