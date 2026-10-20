// GLP-SHARED bottom sheet imported by both cards (Shot Card and Order Card).
//
// One building block for pickers, confirmations and details: a native
// `<dialog>` opened with showModal(), so it renders in the top layer and Home
// Assistant's `transform`/`contain` on a card cannot clip it, and the browser
// supplies Escape handling and the focus trap. On phones it is a bottom sheet
// that opens at half the viewport (or its content height when smaller), drags
// up to full height and drags (or flicks) down to close, like Home Assistant's
// more-info dialog. From 900px up it is a centred dialog with no drag.
//
// The drag/settle maths below is ported from the app's
// public-src/components/sheet-swipe.ts (#1374/#1488) with the same constants
// and pure functions, minus what only fits the app's DOM (desktop side panels,
// view transitions). `sheetSnap()` is new: the app only had "dismiss or spring
// back", the cards also need the half/full detents.
//
// Nothing uses this yet: later slices wire it into both cards (#266, #275).
// Each card adds SHEET_STYLES to its own stylesheet so the sheet keeps that
// card's --glp-* tokens.

import { html, render, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ICONS } from './icons.ts';

// ─── ported drag constants (same values as the app) ──────────────────────────

const DISMISS_FRACTION = 0.25;
const DISMISS_MIN_PX = 80;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;
const FLICK_WINDOW_MS = 100;
// Movement before a press becomes a drag. Below it the gesture stays a tap, so
// the header's close button keeps working.
const DRAG_START_SLOP_PX = 6;
const SPRING_BACK_MS = 200;
// An upward pull only rubber-bands this far (and damped), so the sheet never
// leaves a gap above the bottom edge.
const RUBBER_BAND_MAX_PX = 24;
const RUBBER_BAND_FACTOR = 0.5;
const SHEET_OUT_MS = 220;
const SHEET_OUT_MIN_MS = 120;
const SHEET_OUT_BEZIER = 'cubic-bezier(.2,0,0,1)';

// ─── detents (cards only) ────────────────────────────────────────────────────

// The two phone heights: half the viewport collapsed, at most 92vh expanded so
// a status bar or notch never sits on top of the header. The stylesheet caps
// the collapsed panel at 50vh; HALF_VIEWPORT mirrors that number for the drag
// maths, where the element's height is already clamped by then.
const HALF_VIEWPORT = 0.5;
const FULL_VIEWPORT = 0.92;
// Upward travel that promotes half to full, as a fraction of the sheet height,
// clamped so a short sheet still needs a deliberate pull and a tall one is not
// fussy. Deliberately smaller than dismissDistance(): changing detent should
// be cheaper than closing.
const SNAP_FRACTION = 0.12;
const SNAP_MIN_PX = 40;
const SNAP_MAX_PX = 72;

export interface DragSample {
  t: number;
  y: number;
}

// How far the sheet must travel before a release counts as a dismissal: a
// quarter of its height, capped at 80px so a tall sheet is not too fussy.
export function dismissDistance(sheetHeight: number): number {
  if (!(sheetHeight > 0)) return DISMISS_MIN_PX;
  return Math.min(sheetHeight * DISMISS_FRACTION, DISMISS_MIN_PX);
}

// Downward speed over the last `windowMs` of samples (px/ms). A slow start
// followed by a fast flick still reads as a flick, unlike total-over-total.
export function recentVelocity(samples: DragSample[], windowMs = FLICK_WINDOW_MS): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    const sample = samples[i];
    if (sample && last.t - sample.t <= windowMs) first = sample;
    else break;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

// A long drag always dismisses; a short but fast one does too. Upward or tiny
// moves never do.
export function shouldDismissSheet(dy: number, sheetHeight: number, velocityPxPerMs: number): boolean {
  if (dy <= 0) return false;
  if (dy >= dismissDistance(sheetHeight)) return true;
  return velocityPxPerMs >= DISMISS_VELOCITY_PX_PER_MS;
}

// The translateY for an upward pull of `up` pixels: light, capped rubber-band.
export function rubberBand(up: number): number {
  if (up <= 0) return 0;
  return -Math.min(RUBBER_BAND_MAX_PX, up * RUBBER_BAND_FACTOR);
}

// Whether a touch may start a content drag: only from the top of the scroll
// container, only downward, and never from an interactive control.
export function allowsBodyDrag(scrollTop: number, dy: number, interactiveTarget: boolean): boolean {
  return scrollTop <= 0 && dy > 0 && !interactiveTarget;
}

// Upward travel that changes the detent; see SNAP_FRACTION above.
export function snapDistance(sheetHeight: number): number {
  if (!(sheetHeight > 0)) return SNAP_MIN_PX;
  return Math.min(Math.max(sheetHeight * SNAP_FRACTION, SNAP_MIN_PX), SNAP_MAX_PX);
}

// Where the sheet comes to rest after a drag of `dy` pixels (positive = down)
// on a sheet `height` pixels tall, released at `velocity` px/ms.
//
// Downward: past the dismissal distance (or with a flick) the sheet closes
// from either detent — the gesture that closes a half sheet closes a full one
// too, so a user does not shrink it first. A shorter downward drag lands on
// half, which is also where a full sheet settles when it does not close.
// Upward: a deliberate pull (distance or flick) promotes half to full; a short
// one leaves it at half. A full sheet never over-expands.
export function sheetSnap(
  dy: number,
  height: number,
  velocity: number,
  expanded: boolean,
): 'close' | 'half' | 'full' {
  if (dy > 0) {
    if (shouldDismissSheet(dy, height, velocity)) return 'close';
    return 'half';
  }
  if (dy < 0) {
    const promotes = -dy >= snapDistance(height) || -velocity >= DISMISS_VELOCITY_PX_PER_MS;
    if (!expanded && promotes) return 'full';
    return expanded ? 'full' : 'half';
  }
  return expanded ? 'full' : 'half';
}

// ─── controller ──────────────────────────────────────────────────────────────

export interface GlpSheetContent {
  title: string;
  body: () => TemplateResult;
  actions?: () => TemplateResult;
}

export interface GlpSheetOptions {
  onClose?: () => void;
  // Accessible name for the X button; the cards pass their translated string.
  closeLabel?: string;
}

// Unique per instance, so two sheets in one document cannot share a title id.
let _sheetSeq = 0;

function _now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function _isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (sel: string) => Element | null } | null;
  return !!el?.closest?.(
    'button, a, input, select, textarea, summary, canvas, [role="slider"], [contenteditable="true"]');
}

function _findTouch(list: TouchList, id: number | null): Touch | null {
  for (let i = 0; i < list.length; i++) {
    const touch = list[i];
    if (touch && touch.identifier === id) return touch;
  }
  return null;
}

// Phone/desktop split shared with the app's sheets.
function _isPhoneWidth(win: Window | null): boolean {
  if (!win || typeof win.matchMedia !== 'function') return false;
  try { return win.matchMedia('(max-width: 899px)').matches; } catch { return false; }
}

function _motionOk(win: Window | null): boolean {
  if (!win || typeof win.matchMedia !== 'function') return true;
  try { return !win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

interface HistoryLike {
  pushState?: (data: unknown, unused: string, url?: string) => void;
  back?: () => void;
}

export class GlpSheet {
  private readonly _root: HTMLElement | ShadowRoot;
  private readonly _doc: Document;
  private readonly _win: Window | null;
  private readonly _options: GlpSheetOptions;
  private readonly _titleId: string;
  private _host: HTMLElement | null = null;
  private _dialog: HTMLDialogElement | null = null;
  private _panel: HTMLElement | null = null;
  private _bodyEl: HTMLElement | null = null;
  private _content: GlpSheetContent | null = null;
  private _open = false;
  private _expanded = false;
  // True while this sheet still owns a history entry, so a close path can
  // tell whether back() has to remove one.
  private _historyPushed = false;
  private _cleanup: Array<() => void> = [];
  private _dragCleanup: Array<() => void> = [];
  // A close that is still sliding out, if any. open() settles it first, so a
  // re-open can never be wiped by the previous close's transition timer.
  private _pendingClose: (() => void) | null = null;

  constructor(root: HTMLElement | ShadowRoot, options: GlpSheetOptions = {}) {
    this._root = root;
    this._doc = root.ownerDocument ?? document;
    this._win = (this._doc.defaultView as Window | null) ?? null;
    this._options = options;
    this._titleId = `glp-sheet-title-${++_sheetSeq}`;
  }

  get isOpen(): boolean {
    return this._open;
  }

  open(content: GlpSheetContent): void {
    this._content = content;
    if (this._open) {
      // Already open: refresh in place, never stack a second history entry.
      this.refresh();
      return;
    }
    this._settleClose();
    if (!this._root || typeof this._root.appendChild !== 'function') return;
    if (!this._host) {
      this._host = this._doc.createElement('div');
      this._host.className = 'glp-sheet-host';
      this._root.appendChild(this._host);
    }
    this._open = true;
    this._expanded = false;
    this._historyPushed = false;
    this._render();
    const dialog = this._dialog;
    if (dialog) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
        }
      } else {
        dialog.setAttribute('open', '');
      }
    }
    this._playEnter();
    this._listen();
    this._pushHistory();
  }

  close(): void {
    this._close(true);
  }

  // Re-renders body and actions while open, so live data (a shot list, a
  // picker's selection) updates without closing the sheet.
  refresh(): void {
    if (!this._open) return;
    this._render();
  }

  private _render(): void {
    const host = this._host;
    const content = this._content;
    if (!host || !content) return;
    const label = this._options.closeLabel ?? 'Close';
    render(html`
      <dialog
        class="glp-sheet"
        data-snap=${this._expanded ? 'full' : 'half'}
        aria-labelledby=${this._titleId}
        @cancel=${(e: Event) => { e.preventDefault(); this._close(true); }}
        @click=${(e: Event) => { if (e.target === this._dialog) this._close(true); }}
      >
        <div class="glp-sheet-backdrop" @click=${() => this._close(true)}></div>
        <div class="glp-sheet-panel">
          <div class="glp-sheet-grab" aria-hidden="true"></div>
          <div class="glp-sheet-bar">
            <button class="glp-sheet-close" type="button" aria-label=${label} @click=${() => this._close(true)}>
              ${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('close'))}
            </button>
            <h2 class="glp-sheet-title" id=${this._titleId}>${content.title}</h2>
            <div class="glp-sheet-actions">${content.actions ? content.actions() : nothing}</div>
          </div>
          <div class="glp-sheet-body">${content.body()}</div>
        </div>
      </dialog>
    `, host);
    this._dialog = host.querySelector<HTMLDialogElement>('dialog');
    this._panel = host.querySelector<HTMLElement>('.glp-sheet-panel');
    this._bodyEl = host.querySelector<HTMLElement>('.glp-sheet-body');
    this._attachDrag();
  }

  // Restarts the phone slide-in. The dialog node survives across opens, so the
  // attribute has to be cleared first for the animation to run again.
  private _playEnter(): void {
    const dialog = this._dialog;
    if (!dialog || !_isPhoneWidth(this._win) || !_motionOk(this._win)) return;
    dialog.removeAttribute('data-entering');
    dialog.setAttribute('data-entering', '1');
    const clear = (): void => { dialog.removeAttribute('data-entering'); };
    if (this._win && typeof this._win.setTimeout === 'function') this._win.setTimeout(clear, 280);
    else setTimeout(clear, 280);
  }

  private _listen(): void {
    this._detachListeners();
    const win = this._win;
    if (!win || typeof win.addEventListener !== 'function') return;
    const onPop = (): void => {
      // This sheet's history entry is already gone, so closing must not call
      // back() again.
      if (this._open) this._close(false);
    };
    win.addEventListener('popstate', onPop);
    this._cleanup.push(() => win.removeEventListener('popstate', onPop));
  }

  private _detachListeners(): void {
    for (const off of this._cleanup) off();
    this._cleanup = [];
  }

  private _history(): HistoryLike | null {
    const fromWin = this._win?.history as unknown as HistoryLike | undefined;
    if (fromWin) return fromWin;
    if (typeof history !== 'undefined') return history as unknown as HistoryLike;
    return null;
  }

  private _pushHistory(): void {
    const hist = this._history();
    const push = hist?.pushState;
    if (typeof push !== 'function') return;
    try {
      // Same URL: this entry exists only to give the phone back gesture
      // something to consume, it must not change the dashboard URL.
      const href = this._win?.location?.href;
      if (href) push.call(hist, { glpSheet: true }, '', href);
      else push.call(hist, { glpSheet: true }, '');
      this._historyPushed = true;
    } catch {
      this._historyPushed = false;
    }
  }

  private _close(trimHistory: boolean): void {
    if (!this._open) return;
    this._open = false;
    this._expanded = false;
    this._detachListeners();
    this._detachDrag();
    this._settleClose();
    const finish = (): void => {
      if (this._pendingClose !== finish) return;
      this._finishClose(trimHistory);
      this._pendingClose = null;
    };
    this._pendingClose = finish;
    this._animateOut(finish);
  }

  // Immediately completes a close that is still sliding out, so its timer
  // cannot tear down a sheet that was reopened in the meantime.
  private _settleClose(): void {
    const pending = this._pendingClose;
    if (!pending) return;
    pending();
    this._pendingClose = null;
  }

  private _finishClose(trimHistory: boolean): void {
    const dialog = this._dialog;
    if (dialog) {
      try { dialog.close(); } catch { dialog.removeAttribute('open'); }
      // A stubbed close() can leave the attribute behind; a stale `open` would
      // make the next showModal() throw.
      if (dialog.open) dialog.removeAttribute('open');
    }
    const hadEntry = this._historyPushed;
    this._historyPushed = false;
    if (trimHistory && hadEntry) {
      const hist = this._history();
      const back = hist?.back;
      if (typeof back === 'function') back.call(hist);
    }
    const onClose = this._options.onClose;
    if (typeof onClose === 'function') onClose();
  }

  // Slides the panel out from wherever the drag left it. Phones with motion
  // allowed only; everywhere else the close is instant.
  private _animateOut(done: () => void): void {
    const panel = this._panel;
    const backdrop = this._host?.querySelector<HTMLElement>('.glp-sheet-backdrop') ?? null;
    if (!panel || !_isPhoneWidth(this._win) || !_motionOk(this._win)) { done(); return; }
    const height = (typeof panel.getBoundingClientRect === 'function' ? panel.getBoundingClientRect().height : 0)
      || panel.offsetHeight || 0;
    const duration = Math.max(SHEET_OUT_MIN_MS, SHEET_OUT_MS);
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
      this._resetPanelStyles();
      done();
    };
    const onEnd = (e: Event): void => { if (e.target === panel) finish(); };
    panel.addEventListener('transitionend', onEnd);
    panel.style.transition = `transform ${duration}ms ${SHEET_OUT_BEZIER}`;
    panel.style.transform = `translateY(${Math.max(1, height)}px)`;
    panel.style.height = '';
    if (backdrop) {
      backdrop.style.transition = `opacity ${duration}ms ${SHEET_OUT_BEZIER}`;
      backdrop.style.opacity = '0';
    }
    timer = setTimeout(finish, duration + 60);
  }

  private _resetPanelStyles(): void {
    const panel = this._panel;
    if (panel) {
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.height = '';
    }
    const backdrop = this._host?.querySelector<HTMLElement>('.glp-sheet-backdrop') ?? null;
    if (backdrop) {
      backdrop.style.transition = '';
      backdrop.style.opacity = '';
    }
  }

  // Settles on a detent after a drag: clears the live height/transform and
  // lets the data-snap max-height decide the final size.
  private _settle(expanded: boolean): void {
    this._expanded = expanded;
    const panel = this._panel;
    if (!panel) return;
    const backdrop = this._host?.querySelector<HTMLElement>('.glp-sheet-backdrop') ?? null;
    panel.style.transition = `transform ${SPRING_BACK_MS}ms ${SHEET_OUT_BEZIER}, height ${SPRING_BACK_MS}ms ${SHEET_OUT_BEZIER}`;
    panel.style.transform = '';
    panel.style.height = '';
    if (backdrop) {
      backdrop.style.transition = `opacity ${SPRING_BACK_MS}ms ${SHEET_OUT_BEZIER}`;
      backdrop.style.opacity = '';
    }
    this._render();
    const reset = (): void => { this._resetPanelStyles(); };
    if (this._win && typeof this._win.setTimeout === 'function') this._win.setTimeout(reset, SPRING_BACK_MS + 40);
    else setTimeout(reset, SPRING_BACK_MS + 40);
  }

  private _detachDrag(): void {
    for (const off of this._dragCleanup) off();
    this._dragCleanup = [];
  }

  // Touch drag on the sheet: the grab pill, the header and the content all
  // drag, as long as the content is scrolled to the top, or the sheet is
  // already expanded (where the next downward gesture must be able to shrink
  // it). Touch events (not pointer) keep native `pan-y` scrolling working; the
  // browser scroll is only suppressed with preventDefault once the drag
  // starts. Wider viewports get no drag at all, matching the centred dialog.
  private _attachDrag(): void {
    this._detachDrag();
    const panel = this._panel;
    const bodyEl = this._bodyEl;
    if (!panel || !_isPhoneWidth(this._win) || typeof panel.addEventListener !== 'function') return;

    let active = false;
    let touchId: number | null = null;
    let startY = 0;
    let interactive = false;
    let dragging = false;
    let lastDy = 0;
    let samples: DragSample[] = [];
    let halfH = 0;
    let fullH = 0;

    const panelHeight = (): number => {
      const rect = typeof panel.getBoundingClientRect === 'function' ? panel.getBoundingClientRect() : null;
      return (rect?.height || panel.offsetHeight || 0) || 1;
    };

    // The two detent heights for this gesture. Half is what the panel is at
    // while collapsed (50vh, or less when the content fits); full additionally
    // counts the body height the half cap is hiding, bounded by 92vh.
    const measure = (): void => {
      const rect = typeof panel.getBoundingClientRect === 'function' ? panel.getBoundingClientRect() : null;
      const cur = rect?.height || panel.offsetHeight || 0;
      const vh = this._win?.innerHeight || 0;
      const extra = bodyEl ? Math.max(0, bodyEl.scrollHeight - bodyEl.clientHeight) : 0;
      if (this._expanded) {
        halfH = Math.min(cur, vh * HALF_VIEWPORT);
        fullH = cur;
      } else {
        halfH = cur;
        fullH = Math.max(cur, Math.min(cur + extra, vh * FULL_VIEWPORT));
      }
    };

    const backdrop = this._host?.querySelector<HTMLElement>('.glp-sheet-backdrop') ?? null;

    const applyTransform = (): void => {
      const dy = lastDy;
      const delta = Math.max(0, fullH - halfH);
      panel.style.transition = 'none';
      if (dy >= 0) {
        if (this._expanded && delta > 0 && dy < delta) {
          // Full sheet shrinking back toward half.
          panel.style.height = `${Math.round(fullH - dy)}px`;
          panel.style.transform = '';
        } else {
          const out = this._expanded ? dy - delta : dy;
          panel.style.height = delta > 0 ? `${Math.round(halfH)}px` : '';
          panel.style.transform = out > 0 ? `translateY(${Math.round(out)}px)` : '';
        }
      } else {
        const up = -dy;
        if (!this._expanded && delta > 0 && up < delta) {
          // Half sheet growing toward full.
          panel.style.height = `${Math.round(halfH + up)}px`;
          panel.style.transform = '';
        } else {
          const beyond = !this._expanded && delta > 0 ? up - delta : up;
          panel.style.height = delta > 0 ? `${Math.round(fullH)}px` : '';
          const band = rubberBand(beyond);
          panel.style.transform = band < 0 ? `translateY(${Math.round(band)}px)` : '';
        }
      }
      if (backdrop) {
        backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / panelHeight()));
      }
    };

    const onTouchStart = (e: TouchEvent): void => {
      if (!this._open || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t) return;
      touchId = t.identifier;
      startY = t.clientY;
      interactive = _isInteractiveTarget(e.target);
      active = true;
      dragging = false;
      lastDy = 0;
      samples = [{ t: _now(), y: 0 }];
      measure();
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (!active || touchId === null) return;
      const t = _findTouch(e.touches, touchId);
      if (!t) return;
      const dy = t.clientY - startY;
      const scrollTop = bodyEl ? bodyEl.scrollTop : 0;
      if (!dragging) {
        if (interactive) return;
        const fromBody = !!bodyEl && typeof bodyEl.contains === 'function' && bodyEl.contains(e.target as Node);
        // Downward from scrolled content is a scroll, not a drag; upward from
        // it just collapses the detent differences rather than rubber-banding.
        if (fromBody && dy > 0 && !allowsBodyDrag(scrollTop, dy, interactive)) return;
        if (!fromBody && dy > 0 && !this._expanded && scrollTop > 0) return;
        if (Math.abs(dy) < DRAG_START_SLOP_PX) return;
        dragging = true;
        panel.style.transition = 'none';
      }
      e.preventDefault();
      lastDy = dy;
      samples.push({ t: _now(), y: dy });
      if (samples.length > 40) samples.shift();
      applyTransform();
    };

    const onTouchEnd = (cancelled: boolean): void => {
      if (!active) return;
      active = false;
      touchId = null;
      if (!dragging) {
        this._resetPanelStyles();
        return;
      }
      dragging = false;
      const dy = lastDy;
      const velocity = recentVelocity(samples);
      const at = this._expanded ? fullH : halfH;
      const snap = cancelled
        ? (this._expanded ? 'full' : 'half')
        : sheetSnap(dy, at, velocity, this._expanded);
      if (snap === 'close') {
        this._close(true);
        return;
      }
      this._settle(snap === 'full');
    };

    const onStart = (e: Event): void => onTouchStart(e as TouchEvent);
    const onMove = (e: Event): void => onTouchMove(e as TouchEvent);
    const onEnd = (): void => onTouchEnd(false);
    const onCancel = (): void => onTouchEnd(true);

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onCancel);
    this._dragCleanup.push(() => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onCancel);
    });
  }
}

// ─── styles ──────────────────────────────────────────────────────────────────

// The dialog fills the viewport and is transparent: the backdrop and the panel
// are children, so a drag can fade and move them independently (a ::backdrop
// pseudo-element cannot be animated from script). Each card appends this to
// its own stylesheet, so the --glp-* tokens resolve from that card's cascade.
export const SHEET_STYLES: string = `
  .glp-sheet {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
    color: var(--glp-text);
    font-family: var(--paper-font-body1_-_font-family, -apple-system, sans-serif);
  }
  .glp-sheet::backdrop { background: transparent; }
  .glp-sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
  }
  .glp-sheet-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    background: var(--glp-surface);
    color: var(--glp-text);
    border: 1px solid var(--glp-border);
    border-bottom: none;
    border-radius: var(--glp-radius) var(--glp-radius) 0 0;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.35);
    max-height: 92vh;
    will-change: transform;
  }
  /* Half is the opening detent; full is the panel's own 92vh max-height. */
  .glp-sheet[data-snap="half"] .glp-sheet-panel { max-height: 50vh; }
  .glp-sheet-grab {
    display: block;
    flex: 0 0 auto;
    width: 36px;
    height: 4px;
    margin: var(--glp-sp-2) auto var(--glp-sp-1);
    border-radius: 2px;
    background: var(--glp-border);
  }
  .glp-sheet-bar {
    display: flex;
    align-items: center;
    gap: var(--glp-sp-2);
    flex: 0 0 auto;
    padding: var(--glp-sp-2) var(--glp-sp-4) var(--glp-sp-3);
    border-bottom: 1px solid var(--glp-border);
  }
  .glp-sheet-title {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    font-size: var(--glp-fs-4);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .glp-sheet-close {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--glp-radius-sm);
    background: transparent;
    color: var(--glp-sub);
    font-size: var(--glp-fs-4);
    cursor: pointer;
  }
  .glp-sheet-close:hover { color: var(--glp-text); background: var(--glp-border); }
  .glp-sheet-actions {
    display: flex;
    align-items: center;
    gap: var(--glp-sp-2);
    flex: 0 0 auto;
  }
  .glp-sheet-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--glp-sp-4);
    font-size: var(--glp-fs-2);
    line-height: 1.45;
    touch-action: pan-y;
  }
  /* The cards' base .glp-i rule lives in their own stylesheet; the sheet does
     not assume it, so the close icon still draws as a stroke path here. */
  .glp-sheet .glp-i {
    width: 1em;
    height: 1em;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    flex-shrink: 0;
  }
  /* Phone slide-in, restarted per open by _playEnter(); reduced motion gets
     no animation at all. */
  @media (prefers-reduced-motion: no-preference) and (max-width: 899px) {
    .glp-sheet[data-entering="1"] .glp-sheet-panel { animation: glp-sheet-in 240ms cubic-bezier(.2,0,0,1); }
    .glp-sheet[data-entering="1"] .glp-sheet-backdrop { animation: glp-sheet-fade 240ms cubic-bezier(.2,0,0,1); }
  }
  @keyframes glp-sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes glp-sheet-fade { from { opacity: 0; } to { opacity: 1; } }
  /* Wider viewports: a centred dialog, no grab pill and no drag. */
  @media (min-width: 900px) {
    .glp-sheet-panel {
      left: 50%;
      top: 50%;
      right: auto;
      bottom: auto;
      transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 32px));
      max-height: min(80vh, 720px);
      border-bottom: 1px solid var(--glp-border);
      border-radius: var(--glp-radius);
    }
    .glp-sheet[data-snap="half"] .glp-sheet-panel { max-height: min(80vh, 720px); }
    .glp-sheet-grab { display: none; }
  }
`;
