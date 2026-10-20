// Built as an IIFE by esbuild (npm run build), so top-level declarations never
// leak into the shared document-global scope this card shares with
// glp-order-card.js as a second classic <script src> in the same HA frontend
// page (#141, glp-integration#157).
import { render, html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { STYLES } from './styles.ts';
import { T, SUPPORTED_LANGS, setLang, getLang } from './i18n.ts';
import { roastAgeDays, esc, safeUrl, parseTs, THEME_PRESETS, HEX_COLOR_RE } from './helpers.ts';
import { MACHINE_ICON_MINI, ICONS } from './icons.ts';
import { applySemanticColorContrast } from '../../shared/contrast.ts';
import { appMachineEntry, appMachineTheme, appMachineType, matchMachineStatusEntity } from '../../shared/machine.ts';
import { fmtUptime, buildShotChart, buildLiveChart, chartLegendHtml, metricLineHtml } from './charts.ts';
import type { TemplateResult } from 'lit';
import type {
  Hass, HassStateObject, CardConfig, ThemeStops,
  RecentShot, BaristaOrder, BeanInfo, GrinderEntry,
} from './types.ts';
// Bumped only in a release — a feature or fix PR leaves this alone (see
// cards/CLAUDE.md and the PR template). Logged on startup below.
const GLP_CARD_VERSION = '2.22.0';

// Fallback for a ready-by Set/Cancel whose sensor confirmation never lands
// (#214). The optimistic value is cleared the moment _readReadyBy() sees the
// sensor confirm it, so this timer only covers a call the backend never
// applied; sized to the integration's default 60 s poll because its refresh
// after the service call is debounced.
const READY_BY_PENDING_FALLBACK_MS = 60000;

// A tile in the live-machine panel below the profile picker.
interface LmTile {
  val: string | number;
  unit: string;
  lbl: string;
  warm?: boolean;
}

// Every value _viewModel() derives for a render. Built up in two steps (the
// machine-off early return carries only the first fields), so the partial
// first object is asserted; the fields are always present once the augmented
// return runs.
interface ViewModel {
  prefix: string;
  bsPrefix: string;
  selPrefix: string;
  switchState: HassStateObject | null;
  standbyState: HassStateObject | undefined;
  machineOff: boolean;
  switchOff: boolean;
  uptimePreheatEl: number;
  readyByTargetAt: Date | null;
  readyByPlannedAt: Date | null;
  _powerBtn: TemplateResult | typeof nothing;
  totalShots: number;
  shotObj: RecentShot | null | undefined;
  brewing: boolean;
  liveDatapoints: Record<string, number[] | undefined> | null;
  liveProfile: string | null;
  isDescaling: boolean;
  steamOn: boolean;
  elapsedSec: number | null;
  profile: string | null;
  coffee: string | null;
  drinkType: string | null;
  grinder: string | null;
  grind: string | null;
  duration: string | null;
  weight: string | null;
  ratio: string | null;
  pressure: string | null;
  rating: number | null;
  shotTemp: string | null;
  temp: string | null;
  targetTemp: string | null;
  livePressure: string | null;
  liveWeight: string | null;
  boilerOff: boolean;
  waterLevel: number | null;
  preheatReady: boolean;
  preheatHasEnt: boolean;
  preheatRem: number;
  preheatEl: number;
  preheatTotal: number | null;
  preheatPct: number | null;
  preheatMinLeft: number | null;
  profileOptions: string[] | null;
  currentProfile: string | null;
  profileSwitching: boolean;
  profileAvailable: boolean;
  status: string | null;
  dotClass: string;
  today: string;
  syncTime: string | null;
  glpUrl: string | null;
  maintAvailable: boolean;
  ordersTabAvail: boolean;
  showMaint: boolean;
  showOrders: boolean;
  pendingOrders: number;
  indexChanged: boolean;
  showNav: boolean;
  liveDur: number | null;
  histDp: RecentShot['dp'] | null;
  shotChartKey: string | number | null;
  animateChart: boolean;
  lmTiles: LmTile[];
  score: number | null;
  scoreCls: 'high' | 'mid' | 'low' | '';
  verdictWord: string;
}

// ─── card ──────────────────────────────────────────────────────────────────────

class GlpCard extends HTMLElement {
  // Instance state. `declare` keeps these type-only, so a field initializer
  // can never change the emitted ES2022 output (#180).
  declare _hass: Hass | null;
  declare _config: CardConfig;
  declare _profileOpen: boolean;
  declare _shotIndex: number;
  declare _prevShotIndex: number;
  declare _recentShots: RecentShot[];
  declare _lastLatestId: string | number | null | undefined;
  declare _swipeSx: number;
  declare _swipeSy: number;
  declare _lastChartShotKey: string | number | null;
  declare _activeTab: string;
  declare _pendingProfile: string | null;
  declare _pendingProfileTimer: ReturnType<typeof setTimeout> | null;
  declare _maintConfirm: string | null;
  declare _machineOnSince: number | null;
  declare _uptimeTimer: ReturnType<typeof setInterval> | null;
  declare _orders: BaristaOrder[];
  declare _ordersSig: string | null;
  declare _ordersPoll: ReturnType<typeof setInterval> | null;
  declare _beansInfo: Map<string, BeanInfo> | null;
  declare _beansInfoById: Map<number, BeanInfo> | null;
  declare _beansInfoAt: number;
  declare _beansInfoUnavailable: boolean;
  declare _orderEtaFor: string | null;
  declare _orderDeclineFor: string | null;
  declare _switchEntity: string | null;
  declare _iconGradId: string;
  declare _readyByTimer: ReturnType<typeof setInterval> | null;
  declare _readyByPlannedAt: Date | null;
  declare _readyByTargetAt: Date | null;
  declare _pendingReadyByTargetAt: Date | false | null;
  declare _pendingReadyByTimer: ReturnType<typeof setTimeout> | null;
  declare _lastKnownReadyByTargetAt: Date | null;
  declare _lastKnownReadyByPlannedAt: Date | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._profileOpen  = false;
    this._shotIndex     = 0;
    this._prevShotIndex = -1;
    this._recentShots   = [];
    this._lastLatestId  = null;
    // Last touch origin for the swipe-target gesture. The listener is now
    // bound from the template, so the state lives here.
    this._swipeSx = 0;
    this._swipeSy = 0;
    // Tracks which historical shot the chart last drew, so the shot-load
    // curve-draw-in (#120) plays once per actual shot-load transition, not
    // on every incidental re-render an hass push triggers (same problem the
    // nav-dot "changed" tracking a few lines below solves for the dots).
    this._lastChartShotKey = null;
    this._activeTab    = 'shot';
    this._pendingProfile = null;
    this._maintConfirm = null;
    this._machineOnSince = null;
    this._uptimeTimer = null;
    this._orders = [];
    this._ordersSig = null;
    this._ordersPoll = null;
    this._beansInfo = null;
    this._beansInfoById = null;
    this._beansInfoAt = 0;
    this._beansInfoUnavailable = false;
    this._orderEtaFor = null;
    this._orderDeclineFor = null;
    this._switchEntity = localStorage.getItem('glp_switch_entity') || null;
    // Per-instance-unique SVG gradient id (#87) — a dashboard can render more
    // than one glp-card, and duplicate <linearGradient id> values across
    // instances would make later instances' gradients resolve to an
    // earlier instance's (or fail to resolve at all in some browsers).
    this._iconGradId = `glp-icon-${Math.random().toString(36).slice(2, 10)}`;
    this._readyByTimer = null;
    this._readyByPlannedAt = null;
    this._readyByTargetAt = null;
    // optimistic ready-by state (#66): a Date while a "Set" is pending
    // confirmation, `false` while a "Cancel" is pending confirmation, `null`
    // when nothing is pending — see _readReadyBy().
    this._pendingReadyByTargetAt = null;
    this._pendingReadyByTimer = null;
    // last-known-good cache (#68): 'unavailable' is a transient connectivity
    // blip, not a real "nothing scheduled" signal — see _readReadyBy().
    this._lastKnownReadyByTargetAt = null;
    this._lastKnownReadyByPlannedAt = null;

    // Delegated power-button/ready-by handlers on shadowRoot — attached once
    // here (Lit patches the shadow DOM in place, so the host listener
    // outlives every render). Bound on 'click' (#225): the old touch-down
    // binding fired the action the instant a finger touched the button, so a
    // scroll starting on the power button toggled the machine, and keyboard
    // activation only ever emits click.
    this.shadowRoot!.addEventListener('click', (e: Event) => {
      if ((e.target as Element).closest('[data-action="toggle-switch"]')) {
        e.stopPropagation();
        if (this._hass && this._switchEntity)
          this._hass.callService!('switch', 'toggle', { entity_id: this._switchEntity });
        return;
      }
      if ((e.target as Element).closest('[data-action="set-ready-by"]')) {
        e.stopPropagation();
        const input = this.shadowRoot!.getElementById('glp-readyby-input') as HTMLInputElement | null;
        const target = this._resolveReadyByTarget(input?.value, new Date());
        if (this._hass && target) {
          this._hass.callService!('gaggiuino_profiler', 'set_ready_by', {
            target_time: target.toISOString(),
            ...(this._config?.machine != null ? { machine: this._config.machine } : {}),
          });
          this._pendingReadyByTargetAt = target;   // optimistic: show immediately until the sensor confirms
          clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>);
          this._pendingReadyByTimer = setTimeout(() => { this._pendingReadyByTargetAt = null; this._render(); }, READY_BY_PENDING_FALLBACK_MS);
          this._render();
        }
        return;
      }
      if ((e.target as Element).closest('[data-action="cancel-ready-by"]')) {
        e.stopPropagation();
        if (this._hass) {
          this._hass.callService!('gaggiuino_profiler', 'set_ready_by', {
            ...(this._config?.machine != null ? { machine: this._config.machine } : {}),
          });
          this._pendingReadyByTargetAt = false;   // optimistic: show the picker immediately until the sensor confirms
          clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>);
          this._pendingReadyByTimer = setTimeout(() => { this._pendingReadyByTargetAt = null; this._render(); }, READY_BY_PENDING_FALLBACK_MS);
          this._render();
        }
      }
    });
  }

  // Handlers bound from the Lit templates (elements survive renders now, so
  // per-render addEventListener wiring would stack listeners). The delegated
  // power/ready-by buttons stay on the constructor's shadowRoot listener.
  _toggleProfilePicker(): void {
    this._profileOpen = !this._profileOpen;
    this._render();
  }

  _selectProfile(val: string): void {
    if (this._hass) {
      const entityId = this._resolvePrefix().replace(/^sensor\./, 'select.') + 'profile';
      this._hass.callService!('select', 'select_option', { entity_id: entityId, option: val });
      this._pendingProfile = val;   // optimistic: show immediately until the machine confirms
      clearTimeout(this._pendingProfileTimer as ReturnType<typeof setTimeout>);
      this._pendingProfileTimer = setTimeout(() => { this._pendingProfile = null; this._render(); }, 8000);
    }
    this._profileOpen = false;
    this._render();
  }

  _selectTab(tab: string): void {
    if (tab !== this._activeTab) { this._activeTab = tab; this._maintConfirm = null; this._render(); }
  }

  _startUptimeTicker(): void {
    if (this._uptimeTimer) return;
    this._uptimeTimer = setInterval(() => {
      // This span's text must stay a property binding (`.textContent=`) in
      // the template, never a Lit child part (`>${...}<`): overwriting
      // textContent here every second would delete a child part's marker
      // comments and crash the next Lit render (#180).
      const el = this.shadowRoot!.getElementById('glp-uptime-text');
      if (el && this._machineOnSince) el.textContent = fmtUptime(Date.now() - this._machineOnSince);
    }, 1000);
  }

  _startReadyByTicker(): void {
    if (this._readyByTimer) return;
    this._readyByTimer = setInterval(() => {
      // Same property-binding requirement as the uptime ticker above (#180).
      const el = this.shadowRoot!.getElementById('glp-readyby-countdown');
      if (el) el.textContent = this._readyByCountdownText(this._readyByPlannedAt, this._readyByTargetAt);
    }, 1000);
  }

  connectedCallback(): void { this._startOrdersPoll(); }

  disconnectedCallback(): void {
    if (this._uptimeTimer) { clearInterval(this._uptimeTimer as ReturnType<typeof setInterval>); this._uptimeTimer = null; }
    if (this._ordersPoll) { clearInterval(this._ordersPoll as ReturnType<typeof setInterval>); this._ordersPoll = null; }
    if (this._readyByTimer) { clearInterval(this._readyByTimer as ReturnType<typeof setInterval>); this._readyByTimer = null; }
  }

  // ── ready-by preheat scheduler (#61) ───────────────────────────────────────
  // Reads sensor.<prefix>preheat_ready_by_target_at / _planned_switch_on_at
  // (integration >= 1.22.0 — see README); both are ISO-datetime-string
  // sensors, 'unknown' when nothing is scheduled.
  //
  // 'unknown' vs 'unavailable' (#68): 'unknown' is a real signal — the
  // backend genuinely has nothing scheduled (or the schedule just fired/was
  // cancelled) — and clears the display. 'unavailable' means the entity is
  // transiently unreachable (a coordinator poll blip, integration reload,
  // etc.) and must NOT be read as "nothing scheduled"; it falls back to the
  // last successfully-parsed value, cached per-sensor on the instance.
  _readReadyBy(): { targetAt: Date | null; plannedAt: Date | null } {
    const read = (suffix: string): { kind: 'value'; date: Date } | { kind: 'unavailable' } | { kind: 'unknown' } => {
      const s = this._s(suffix);
      if (s && s.state !== 'unknown' && s.state !== 'unavailable') {
        const d = new Date(s.state as string);
        if (!isNaN(d.getTime())) return { kind: 'value', date: d };
      }
      if (s && s.state === 'unavailable') return { kind: 'unavailable' };
      return { kind: 'unknown' };
    };

    const targetRead = read('preheat_ready_by_target_at');
    if (targetRead.kind === 'value') this._lastKnownReadyByTargetAt = targetRead.date;
    else if (targetRead.kind === 'unknown') this._lastKnownReadyByTargetAt = null;
    const realTargetAt = targetRead.kind === 'value' ? targetRead.date
      : targetRead.kind === 'unavailable' ? (this._lastKnownReadyByTargetAt || null)
      : null;

    const plannedRead = read('preheat_planned_switch_on_at');
    if (plannedRead.kind === 'value') this._lastKnownReadyByPlannedAt = plannedRead.date;
    else if (plannedRead.kind === 'unknown') this._lastKnownReadyByPlannedAt = null;
    const realPlannedAt = plannedRead.kind === 'value' ? plannedRead.date
      : plannedRead.kind === 'unavailable' ? (this._lastKnownReadyByPlannedAt || null)
      : null;

    // Optimistic override (#66): prefer the just-picked/just-cancelled value
    // over the live sensor read until the sensor confirms it (or a timeout
    // gives up) — same pattern as _pendingProfile. `_pendingReadyByTargetAt`
    // is a Date while "Set" is pending, `false` while "Cancel" is pending.
    if (this._pendingReadyByTargetAt === false) {
      if (!realTargetAt) { clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>); this._pendingReadyByTargetAt = null; }
      else return { targetAt: null, plannedAt: null };
    } else if (this._pendingReadyByTargetAt) {
      // Compare by value, not truthiness (#70): a stale realTargetAt (old
      // target still live, or the #68 unavailable-fallback cache holding the
      // pre-reschedule value) must not clear a pending re-schedule to a
      // *different* new target — only the matching value counts as confirmed.
      if (realTargetAt && realTargetAt.getTime() === this._pendingReadyByTargetAt.getTime()) {
        clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>); this._pendingReadyByTargetAt = null;
      } else return { targetAt: this._pendingReadyByTargetAt, plannedAt: null };
    }
    return { targetAt: realTargetAt, plannedAt: realPlannedAt };
  }

  // Combines a picked "HH:MM" time-of-day with a reference `now` into a
  // concrete Date: today if that time hasn't passed yet, tomorrow if it has
  // (a "ready by 07:00" picked at 22:00 means tomorrow 07:00). Pure/testable
  // on purpose — no DOM/hass access.
  _resolveReadyByTarget(timeString: unknown, now: Date = new Date()): Date | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeString || '').trim());
    if (!m) return null;
    const hh = parseInt(m[1]!, 10), mm = parseInt(m[2]!, 10);
    if (hh > 23 || mm > 59) return null;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target;
  }

  // True only when the displayed shot actually changed since the last call
  // (#120) — gates the curve draw-in animation so it plays on a real
  // "shot loaded" transition (nav, swipe, first load) and not on every
  // incidental re-render an hass push triggers while looking at the same
  // shot. Pure/testable on purpose, same reasoning as _resolveReadyByTarget()
  // above; a null currentKey (no shot showing) never counts as a change.
  _shotChartKeyChanged(prevKey: string | number | null, currentKey: string | number | null): boolean {
    return currentKey != null && currentKey !== prevKey;
  }

  // `targetAt` is only needed to distinguish "nothing scheduled" (blank) from
  // "target set but the server hasn't reported plannedAt yet" (e.g. right
  // after an optimistic Set click, #66) — shown as a neutral "scheduling…".
  _readyByCountdownText(plannedAt: Date | null, targetAt: Date | null): string {
    if (!plannedAt) return targetAt ? T('ready_by_scheduling') : '';
    const diffMs = plannedAt.getTime() - Date.now();
    if (diffMs <= 0) return T('ready_by_switching_now');
    return T('ready_by_switching_in', Math.ceil(diffMs / 60000) as unknown as string);
  }

  _buildReadyByHtml(targetAt: Date | null, plannedAt: Date | null): TemplateResult {
    if (targetAt) {
      const hhmm = targetAt.toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });
      return html`<div class="ready-by ready-by-set">
        <div class="ready-by-info">
          <span class="ready-by-label">${T('ready_by_target', hhmm)}</span>
          <span class="ready-by-countdown" id="glp-readyby-countdown" .textContent=${this._readyByCountdownText(plannedAt, targetAt)}></span>
        </div>
        <button class="ready-by-btn ghost" data-action="cancel-ready-by">${T('ready_by_cancel')}</button>
      </div>`;
    }
    // The time input is deliberately uncontrolled — no value binding a render
    // could overwrite — because Lit only patches attributes it bound, so a
    // hass update leaves a time the user is typing in place.
    return html`<div class="ready-by ready-by-picker">
      <span class="ready-by-label">${T('ready_by_set_label')}</span>
      <div class="ready-by-picker-row">
        <input type="time" class="ready-by-time-input" id="glp-readyby-input"/>
        <button class="ready-by-btn primary" data-action="set-ready-by">${T('ready_by_set')}</button>
      </div>
    </div>`;
  }

  // ── Barista orders (via the integration REST proxy) ───────────────────────
  _startOrdersPoll(): void {
    if (this._ordersPoll || !this._hass?.fetchWithAuth) { if (!this._ordersPoll) setTimeout(() => this._startOrdersPoll(), 1500); return; }
    this._fetchOrders(true);
    this._ordersPoll = setInterval(() => this._fetchOrders(false), 6000);
  }

  async _fetchOrders(force: boolean): Promise<void> {
    if (!this._hass?.fetchWithAuth) return;
    let list;
    try {
      const r = await this._hass.fetchWithAuth('/api/glp/orders');
      if (!r.ok) return;
      list = await r.json();
    } catch { return; }
    const active = (Array.isArray(list) ? list : [])
      .filter(o => o.status === 'pending' || o.status === 'accepted')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const sig = JSON.stringify(active.map(o => [o.id, o.status, o.eta, o.acceptedAt]));
    if (!force && sig === this._ordersSig) return;
    this._ordersSig = sig;
    this._orders = active;
    this._render();
  }

  async _orderAction(id: string, action: string, body: Record<string, unknown>): Promise<void> {
    if (!this._hass?.fetchWithAuth || !id) return;
    this._orderEtaFor = null;
    this._orderDeclineFor = null;
    try {
      await this._hass.fetchWithAuth(`/api/glp/orders/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
    } catch { /* ignore — next poll reconciles */ }
    await this._fetchOrders(true);
  }

  _buildOrdersHtml(): TemplateResult {
    if (!this._orders.length) return html`<div class="unavailable">${T('orders_none')}</div>`;
    const tap = (fn: () => void) => (e: Event) => { e.stopPropagation(); fn(); };
    const cancel = tap(() => { this._orderEtaFor = null; this._orderDeclineFor = null; this._render(); });
    const declineRow = (id: string) => html`<div class="ord-actions"><span class="ord-q">${T('ord_decline_q')}</span>
      <button class="ord-btn danger" data-ord-decline-yes=${id} @click=${tap(() => this._orderAction(id, 'decline', {}))}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('ord_yes')}</button>
      <button class="ord-btn ghost" data-ord-cancel="1" @click=${cancel}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('close'))}</button></div>`;
    return html`<div class="ord-list">${this._orders.map(o => {
      const label = o.variant ? `${o.item} · ${o.variant}` : o.item;
      const head = html`<div class="ord-top"><span class="ord-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${label}</span>${o.customer ? html`<span class="ord-who">${o.customer}</span>` : nothing}</div>
        ${o.note ? html`<div class="ord-note">„${o.note}"</div>` : nothing}`;
      if (o.status === 'pending') {
        const actions = this._orderDeclineFor === o.id ? declineRow(o.id)
          : this._orderEtaFor === o.id
            ? html`<div class="ord-actions"><span class="ord-q">${T('ord_done_in')}</span>${[3,5,8,10].map(m => html`<button class="ord-btn eta" data-ord-accept=${o.id} data-eta=${m} @click=${tap(() => this._orderAction(o.id, 'accept', { eta: m }))}>${m} min</button>`)}<button class="ord-btn ghost" data-ord-cancel="1" @click=${cancel}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('close'))}</button></div>`
            : html`<div class="ord-actions"><button class="ord-btn primary" data-ord-eta=${o.id} @click=${tap(() => { this._orderEtaFor = o.id; this._render(); })}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('ord_accept')}</button><button class="ord-btn ghost" data-ord-decline=${o.id} @click=${tap(() => { this._orderDeclineFor = o.id; this._render(); })}>${T('ord_decline')}</button></div>`;
        return html`<div class="ord-row pending">${head}${actions}</div>`;
      }
      const minsLeft = (o.acceptedAt && o.eta) ? Math.max(0, Math.ceil((o.acceptedAt + o.eta * 60000 - Date.now()) / 60000)) : null;
      const actions = this._orderDeclineFor === o.id ? declineRow(o.id)
        : html`<div class="ord-actions"><button class="ord-btn primary" data-ord-done=${o.id} @click=${tap(() => this._orderAction(o.id, 'complete', {}))}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('ord_done')}</button><button class="ord-btn ghost" data-ord-decline=${o.id} @click=${tap(() => { this._orderDeclineFor = o.id; this._render(); })}>${T('ord_decline')}</button></div>`;
      return html`<div class="ord-row accepted">${head}
        <div class="ord-sub">${minsLeft != null ? T('ord_ready_in', minsLeft as unknown as string) : T('ord_preparing')}</div>${actions}</div>`;
    })}</div>`;
  }

  _navShot(dir: string): void {
    if (this._activeTab !== 'shot') return;    // don't swipe-navigate shots on maint/orders tabs
    const max = this._recentShots.length - 1;
    if (dir === 'prev' && this._shotIndex < max) this._navShotAnimated(dir, this._shotIndex + 1);
    if (dir === 'next' && this._shotIndex > 0)   this._navShotAnimated(dir, this._shotIndex - 1);
  }

  _navShotAnimated(dir: string, newIndex: number): void {
    const oldContent = this.shadowRoot!.querySelector('.swipe-content') as HTMLElement | null;
    const oldClone   = oldContent ? (oldContent.cloneNode(true) as HTMLElement) : null;

    this._shotIndex = newIndex;
    this._render();

    const newSwipe   = this.shadowRoot!.querySelector('.swipe-target') as HTMLElement | null;
    const newContent = this.shadowRoot!.querySelector('.swipe-content') as HTMLElement | null;
    if (!oldClone || !newSwipe || !newContent) return;

    // prev = going to older shot → new content enters from right, old exits left
    const enterX = dir === 'prev' ? '36px' : '-36px';
    const exitX  = dir === 'prev' ? '-36px' : '36px';

    // Old clone: absolute overlay on top of new content, aligned to top
    oldClone.style.cssText = 'position:absolute;top:0;left:0;right:0;pointer-events:none;z-index:2;';
    newSwipe.appendChild(oldClone);

    // New content starts slightly offset and faded
    newContent.style.transform = `translateX(${enterX})`;
    newContent.style.opacity   = '0';

    const T = 'transform .22s cubic-bezier(.25,.46,.45,.94), opacity .18s ease-out';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      newContent.style.transition = T;
      newContent.style.transform  = 'translateX(0)';
      newContent.style.opacity    = '1';
      oldClone.style.transition   = T;
      oldClone.style.transform    = `translateX(${exitX})`;
      oldClone.style.opacity      = '0';
      setTimeout(() => {
        if (oldClone.parentNode) oldClone.remove();
        ['transform', 'transition', 'opacity'].forEach(p => newContent.style.removeProperty(p));
      }, 250);
    }));
  }

  // setConfig() also accepts the optional per-machine colour theme keys
  // (#87): `theme` (one of the THEME_PRESETS keys), `accent_color` (a flat
  // custom #rrggbb), and `accent_gradient` (a [start, end] #rrggbb pair) —
  // see _resolveMachineTheme(). These mirror the GLP app's `machines.theme`
  // storage contract (gaggiuino-local-profiler#595) as this card's
  // standalone/no-app YAML fallback; the app's own stored theme (#701, see
  // _appMachineTheme() below) takes precedence over these once available.
  setConfig(config: CardConfig): void {
    this._config = { title: 'Gaggiuino', ...config };
    // Re-resolve the switch entity from the machine-scoped storage key now
    // that `machine` (if any) is known — the constructor ran before
    // setConfig() and could only read the unscoped global key.
    this._switchEntity = localStorage.getItem(this._switchStorageKey())
      || localStorage.getItem('glp_switch_entity') || null;
  }

  // The app's own stored per-machine theme (#701), read from hass state by
  // the shared machine lookup; null when nothing valid is synced.
  _appMachineTheme(): ThemeStops | null {
    return appMachineTheme(appMachineEntry(this._hass, this._config?.machine));
  }

  // Resolves this card's effective theme to a {a,b} hex pair, or null when
  // nothing valid is configured/synced (falls back to the default
  // --glp-accent-start/-end = --glp-accent behavior). The app's own stored
  // theme (#701, _appMachineTheme()) takes precedence over this card's YAML
  // config, matching the precedence already promised in setConfig()'s
  // comment. YAML precedence among itself, matching "more specific wins":
  // accent_gradient > accent_color > theme preset key. Strict hex
  // validation only (HEX_COLOR_RE) — operator-set YAML, not attacker input,
  // but never let an unvalidated string reach a style attribute regardless
  // of source.
  _resolveMachineTheme(): ThemeStops | null {
    const fromApp = this._appMachineTheme();
    if (fromApp) return fromApp;
    const cfg = this._config || {};
    if (Array.isArray(cfg.accent_gradient) && cfg.accent_gradient.length === 2 &&
        HEX_COLOR_RE.test(cfg.accent_gradient[0]!) && HEX_COLOR_RE.test(cfg.accent_gradient[1]!)) {
      return { a: cfg.accent_gradient[0]!, b: cfg.accent_gradient[1]! };
    }
    if (typeof cfg.accent_color === 'string' && HEX_COLOR_RE.test(cfg.accent_color)) {
      return { a: cfg.accent_color, b: cfg.accent_color };
    }
    if (typeof cfg.theme === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, cfg.theme)) {
      return THEME_PRESETS[cfg.theme as keyof typeof THEME_PRESETS];
    }
    return null;
  }

  // Applies the resolved machine theme (if any) as inline --glp-accent-start
  // /--glp-accent-end overrides on the host — same "inline style always wins
  // the cascade" pattern as _applySemanticColorContrast(). Called from
  // _render() before that method, so its luminance read already sees the
  // themed colours. Removes the inline overrides (falling back to the
  // GLP-TOKENS stylesheet defaults) when no theme is configured, so a config
  // change back to "no theme" is reflected on the next render too.
  _applyMachineTheme(): void {
    const theme = this._resolveMachineTheme();
    if (theme) {
      this.style.setProperty('--glp-accent-start', theme.a);
      this.style.setProperty('--glp-accent-end', theme.b);
    } else {
      this.style.removeProperty('--glp-accent-start');
      this.style.removeProperty('--glp-accent-end');
    }
  }

  set hass(hass: Hass) {
    this._hass = hass;
    { const l = String(hass?.language || hass?.locale?.language || 'de').slice(0, 2).toLowerCase(); setLang(SUPPORTED_LANGS.includes(l) ? l : 'en'); }
    if (!this._ordersPoll) this._startOrdersPoll();
    this._loadBeansInfo();
    this._render();
  }

  // ── Bean metadata (via the integration REST proxy, app >= 1.96) ───────────
  async _loadBeansInfo(): Promise<void> {
    if (!this._hass?.fetchWithAuth) return;
    if (this._beansInfoUnavailable) return;                       // proxy/app too old — feature off
    if (this._beansInfoAt && Date.now() - this._beansInfoAt < 300000) return;
    this._beansInfoAt = Date.now();
    try {
      const r = await this._hass.fetchWithAuth('/api/glp/library/beans-info');
      if (!r.ok) { this._beansInfoUnavailable = true; return; }
      const list = await r.json();
      const beans = Array.isArray(list) ? list : [];
      this._beansInfoById = new Map(beans.filter(b => b.id != null).map(b => [b.id, b]));
      this._beansInfo = new Map(beans.map(b => [String(b.name || '').toLowerCase(), b]));
    } catch { /* transient — retry after the cache window */ }
  }

  // #55 (follow-up to gaggiuino-local-profiler#456): prefers the stable
  // beanId link over the free-text coffee name — mirrors the app's
  // resolveBeanForAnnotation, since a delete+reimport under the same name
  // gets a new id but keeps stale references matching by name alone. Falls
  // back to name matching when beanId isn't available (shots that predate
  // beanId on the annotation, or an integration too old to expose it).
  _beanExtraHtml(coffee: string | null, beanId: number | null | undefined): TemplateResult | typeof nothing {
    const bean = (beanId != null && this._beansInfoById?.get(beanId))
      || this._beansInfo?.get(String(coffee || '').toLowerCase());
    if (!bean) return nothing;
    // flagEmoji() dropped without replacement (#120) — the flag rendered
    // via regional-indicator codepoints, changed shape per OS, and carried
    // no information the coffee name/variety text next to it didn't already.
    const parts = [];
    if (bean.variety) parts.push(bean.variety);
    const age = roastAgeDays(bean.roastDate);
    if (age != null) parts.push(`${age}d`);
    if (!parts.length) return nothing;
    const title = age != null ? T('bean_roasted_ago', age as unknown as string) : '';
    return html`<span class="shot-bean-extra" title=${ifDefined(title || undefined)}>${parts.join(' · ')}</span>`;
  }

  // machine (#50): optional config option naming/slugging a specific
  // machine, for setups with more than one GLP machine device (see the app's
  // multi-machine mode, GLP #317, and glp-integration #47's forthcoming
  // per-machine devices). When set, matches a *_machine_status entity whose
  // friendly_name or entity_id references it, before falling back to the
  // existing "first Gaggiuino-named entity, else any" heuristic — so cards
  // without this option (the vast majority today, single-machine setups)
  // behave exactly as before.
  _resolvePrefix(): string {
    if (this._config.entity_prefix) return this._config.entity_prefix;
    const candidates = Object.keys(this._hass!.states).filter(id => id.endsWith('_machine_status'));
    if (this._config?.machine) {
      const matched = matchMachineStatusEntity(this._hass!, candidates, this._config.machine);
      if (matched) return matched.replace(/machine_status$/, '');
    }
    const found = candidates.find(id =>
      (this._hass!.states[id]?.attributes?.friendly_name as string)?.toLowerCase().includes('gaggiuino'));
    if (found) return found.replace(/machine_status$/, '');
    const fallback = candidates[0];
    return fallback ? fallback.replace(/machine_status$/, '') : 'sensor.gaggiuino_local_profiler_';
  }

  // Machine-scoped localStorage key (#50) so the switch entity choice for
  // one machine's card doesn't collide with another's on the same
  // dashboard. Falls back to the original global key when `machine` isn't
  // configured — unchanged behavior for existing single-machine cards.
  _switchStorageKey(): string {
    const machine = this._config?.machine;
    if (!machine) return 'glp_switch_entity';
    return `glp_switch_entity_${String(machine).toLowerCase().replace(/\s+/g, '_')}`;
  }

  _s(suffix: string): HassStateObject | undefined { return this._hass!.states[this._resolvePrefix() + suffix]; }

  _val(suffix: string, fallback: string | null = '—'): string | null {
    const s = this._s(suffix);
    return s && s.state !== 'unknown' && s.state !== 'unavailable' ? s.state as string : fallback;
  }

  _num(suffix: string, decimals = 1, fallback: string | null = null): string | null {
    const v = this._val(suffix, null);
    if (v === null) return fallback;
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n.toFixed(decimals);
  }

  _reltime(suffix: string): string | null {
    const s = this._s(suffix);
    if (!s || s.state === 'unknown' || s.state === 'unavailable') return null;
    const diff = Math.round((Date.now() - new Date(s.state as string).getTime()) / 60000);
    if (diff < 1) return T('just_now');
    if (diff < 60) return T('mins_ago', diff as unknown as string);
    const h = Math.round(diff / 60);
    return h < 24 ? T('hours_ago', h as unknown as string) : T('days_ago', Math.round(h / 24) as unknown as string);
  }

  // Icon column is now an ICONS name (#120), not an emoji glyph — resolved
  // through ICONS.of() in _buildMaintHtml() below.
  static MAINT_TASKS: [string, string, string, string][] = [
    ['maintenance_descaling',    'maint_descaling',   'flask',   'descaling'],
    ['maintenance_backflush',    'maint_backflush',   'refresh', 'backflush'],
    ['maintenance_group_head',   'maint_grouphead',   'shower',  'grouphead'],
    ['maintenance_gaskets',      'maint_gaskets',     'circle',  'gaskets'],
    ['maintenance_water_filter', 'maint_waterfilter', 'droplet', 'waterfilter'],
  ];

  _maintAvailable(): boolean {
    return GlpCard.MAINT_TASKS.some(([s]) => this._s(s)) || !!this._s('maintenance_grinders');
  }
  _maintAnyDue(): boolean {
    return GlpCard.MAINT_TASKS.some(([s]) => this._s(s)?.state === 'due')
      || this._s('maintenance_grinders')?.state === 'due';
  }

  _buildMaintHtml(): TemplateResult {
    // pill_ok/pill_due used to carry a ✓/⚠ glyph in the string itself; the
    // glyph now lives here as an icon next to the (glyph-free) translated
    // text, so translators aren't carrying markup in six languages (#120).
    const pills: Record<string, string> = { ok: T('pill_ok'), soon: T('pill_soon'), due: T('pill_due'), never: T('pill_never') };
    const pillIcon: Record<string, string> = { ok: 'check', due: 'warning' };
    const row = (icon: string, name: string, status: string | undefined, pct: string | undefined, daysSince: number | null | undefined, shotsSince: number | null | undefined, task: string | undefined) => {
      const cls  = pills[status as string] ? status as string : 'never';
      const pctW = Math.max(0, Math.min(100, Math.round((parseFloat(pct as string) || 0) * 100)));
      const sub  = [
        daysSince != null ? (daysSince === 0 ? T('maint_today') : T('days_ago', daysSince as unknown as string)) : null,
        shotsSince != null && shotsSince > 0 ? `${shotsSince} Shots` : null,
      ].filter(Boolean).join(' · ');
      const confirming = task && this._maintConfirm === task;
      return html`<div class="maint-row${confirming ? ' confirming' : ''}" data-maint-task=${ifDefined(task || undefined)} role=${ifDefined(task ? 'button' : undefined)} @click=${(e: Event) => {
        if (!task) return;
        if ((e.target as Element).closest('[data-maint-done],[data-maint-cancel]')) return;
        this._maintConfirm = this._maintConfirm === task ? null : task;
        this._render();
      }}>
        <div class="maint-row-top">
          ${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of(icon))}
          <span class="maint-name">${name}</span>
          <span class="maint-pill ${cls}">${pillIcon[cls] ? unsafeHTML(ICONS.of(pillIcon[cls])) : nothing}${pills[status as string] || '—'}</span>
        </div>
        ${sub ? html`<div class="maint-sub">${sub}</div>` : nothing}
        <div class="maint-bar-bg"><div class="maint-bar ${cls}" style="width:${pctW}%"></div></div>
        ${confirming ? html`<div class="maint-confirm">
          <span class="maint-confirm-q">${T('maint_confirm_q')}</span>
          <button class="maint-confirm-yes" data-maint-done=${task} @click=${(e: Event) => { e.stopPropagation(); if (this._hass && task) this._hass.callService!('gaggiuino_profiler', 'maintenance_done', { task }); this._maintConfirm = null; this._render(); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('ord_yes')}</button>
          <button class="maint-confirm-no" data-maint-cancel="1" @click=${(e: Event) => { e.stopPropagation(); this._maintConfirm = null; this._render(); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('close'))}</button>
        </div>` : nothing}
      </div>`;
    };
    const rows = GlpCard.MAINT_TASKS.map(([suffix, nameKey, icon, task]) => {
      const s = this._s(suffix);
      if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
      const a = s.attributes || {};
      return row(icon, T(nameKey), s.state, a.pct as string, a.days_since as number | null | undefined, a.shots_since as number | null | undefined, task);
    }).filter(Boolean);
    const gAttrs = this._s('maintenance_grinders')?.attributes || {};
    const gRows  = Object.entries(gAttrs)
      .filter(([, v]) => v && typeof v === 'object' && 'status' in v)
      .map(([name, v]) => row('gear', name, (v as GrinderEntry).status, (v as GrinderEntry).pct, (v as GrinderEntry).days_since, (v as GrinderEntry).shots_since, (v as GrinderEntry).task));
    if (!rows.length && !gRows.length)
      return html`<div class="unavailable">${T('maint_none')}</div>`;
    return html`<div class="maint-list">
      ${rows}
      ${gRows.length ? html`<div class="maint-section-label">${T('maint_grinders')}</div>${gRows}` : nothing}
    </div>`;
  }

  // Picks the contrast-safe semantic colour variants and --glp-aline at
  // runtime from the host's resolved colours; see cards/shared/contrast.ts.
  _applySemanticColorContrast(): void {
    applySemanticColorContrast(this);
  }

  // #195: the switch-only "off" rule — a configured switch reported `off` or
  // `unavailable`. Drives the power button, whose click toggles the switch, so
  // standby must not influence it.
  _isSwitchOff(switchState: HassStateObject | null | undefined): boolean {
    return !!(this._switchEntity &&
      (switchState?.state === 'off' || switchState?.state === 'unavailable'));
  }

  // #195: a GaggiMate in standby keeps its switch reported `on`, so it used
  // to fall through to the warm-up view and look frozen. Standby is a
  // distinct `effectively off` signal (binary_sensor.<prefix>machine_standby
  // from glp-integration#219); a missing entity or any other state keeps the
  // switch-only rule.
  _isMachineOff(switchState: HassStateObject | null | undefined, standbyState: HassStateObject | undefined): boolean {
    return this._isSwitchOff(switchState) || standbyState?.state === 'on';
  }

  // Derives every value the render needs from `hass`/config, in the same order
  // and with the same side effects the single-method _render() had. The
  // machine-off branch returns before the recent-shot/tab derivations run,
  // exactly as before. Nothing here touches the DOM or writes an HTML string —
  // the section methods below turn this one plain object into Lit templates.
  _viewModel(): ViewModel {
    const prefix    = this._resolvePrefix();
    const bsPrefix  = prefix.replace(/^sensor\./, 'binary_sensor.');
    const selPrefix = prefix.replace(/^sensor\./, 'select.');

    // switch entity
    const resolvedSwitch = this._config.switch_entity
      || (this._s('machine_status')?.attributes?.switch_entity as string | undefined) || null;
    if (resolvedSwitch && resolvedSwitch !== this._switchEntity) {
      this._switchEntity = resolvedSwitch;
      localStorage.setItem(this._switchStorageKey(), resolvedSwitch);
    }
    const switchState = this._switchEntity ? this._hass!.states[this._switchEntity] : null;
    // Derived from preheat_elapsed (restart-safe, persisted by the add-on),
    // not switch.*.last_changed — that jumps to restart time on every HA
    // core restart even while the machine stays physically on (#158).
    const uptimePreheatEl = parseFloat(this._val('preheat_elapsed', null) as string);
    this._machineOnSince = (switchState?.state === 'on' && !isNaN(uptimePreheatEl))
      ? Date.now() - uptimePreheatEl * 1000 : null;
    const standbyState = this._hass!.states[bsPrefix + 'machine_standby'];
    const machineOff  = this._isMachineOff(switchState, standbyState);
    // The power button toggles the switch (not standby), so its class/label
    // follow the switch-only rule — otherwise a standby machine would offer
    // "Power on" while the click actually cuts the switch.
    const switchOff   = this._isSwitchOff(switchState);

    // ready-by preheat scheduler (#61) — only meaningful while the machine is
    // off; moot once it's on/warming/ready, so it's only rendered below in
    // the machineOff branch, but read here so both branches share one source.
    const { targetAt: readyByTargetAt, plannedAt: readyByPlannedAt } = this._readReadyBy();
    this._readyByPlannedAt = readyByPlannedAt;
    this._readyByTargetAt = readyByTargetAt;

    const _powerBtn = this._switchEntity ? html`
      <button class="power-btn ${switchOff ? 'is-off' : 'is-on'}" data-action="toggle-switch"
              title=${switchOff ? T('power_on') : T('power_off')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.28 1.09-4.3 2.58-5.42L6.17 5.17A8.932 8.932 0 0 0 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9A8.932 8.932 0 0 0 17.83 5.17z"/>
        </svg>
      </button>` : nothing;

    const vm = {
      prefix, bsPrefix, selPrefix,
      switchState, standbyState, machineOff, switchOff,
      uptimePreheatEl, readyByTargetAt, readyByPlannedAt,
      _powerBtn,
    } as ViewModel;

    // ── machine off ──────────────────────────────────────────────────────────
    if (machineOff) return vm;

    // ── recent shots ─────────────────────────────────────────────────────────
    const machineStatusEnt = this._s('machine_status');
    const freshShots = machineStatusEnt?.attributes?.recent_shots;
    if (Array.isArray(freshShots) && freshShots.length > 0) {
      const latestId = freshShots[0]?.id;
      if (latestId !== undefined && latestId !== this._lastLatestId) {
        this._lastLatestId = latestId;
        this._shotIndex    = 0;
      }
      this._recentShots = freshShots;
    }
    if (this._shotIndex >= this._recentShots.length)
      this._shotIndex = Math.max(0, this._recentShots.length - 1);

    const totalShots = this._recentShots.length;
    const shotObj    = (this._shotIndex < totalShots) ? this._recentShots[this._shotIndex] : null;

    // ── brewing ──────────────────────────────────────────────────────────────
    const brewingEnt     = this._hass!.states[bsPrefix + 'brewing'];
    const brewing        = brewingEnt?.state === 'on';
    const liveDatapoints = (brewingEnt?.attributes?.datapoints || null) as Record<string, number[] | undefined> | null;
    const liveProfile    = (brewingEnt?.attributes?.profile_name || null) as string | null;
    // #170: is_descaling is a separate live-session flag on the Brewing
    // binary sensor (glp-integration#186), always exposed regardless of
    // is_on/isLive -- same shape as is_flushing, added by the same PR but
    // not surfaced in the card yet (out of scope for #170).
    const isDescaling    = !!brewingEnt?.attributes?.is_descaling;
    const steamOn        = this._hass!.states[bsPrefix + 'steam_switch']?.state === 'on';
    const tArr           = liveDatapoints?.timeInShot;
    const elapsedSec     = tArr?.length ? Math.round(tArr[tArr.length - 1]! / 10) : null;

    // ── shot values ───────────────────────────────────────────────────────────
    const profile    = shotObj?.profile    ?? this._val('last_shot_profile', null);
    const coffee     = shotObj?.coffee     ?? this._val('last_shot_coffee',  null);
    const drinkType  = shotObj?.drink_type ?? null;
    const grinder    = shotObj?.grinder ?? null;
    const grind      = shotObj?.grind   ?? null;
    const duration = shotObj != null
      ? (shotObj.duration != null ? shotObj.duration.toFixed(1) : null)
      : this._num('last_shot_duration', 1);
    const weight = shotObj != null
      ? (shotObj.yield_g  != null ? shotObj.yield_g.toFixed(1)  : null)
      : this._num('last_shot_yield', 1);
    const ratio = shotObj != null
      ? (shotObj.ratio    != null ? shotObj.ratio.toFixed(2)    : null)
      : this._num('last_shot_brew_ratio', 2);
    const pressure = shotObj != null
      ? (shotObj.pressure != null ? shotObj.pressure.toFixed(1) : null)
      : this._num('last_shot_avg_pressure', 1);
    const rating = shotObj != null
      ? (shotObj.rating || null)
      : (() => { const v = parseInt(this._val('last_shot_rating', null) as string); return (!isNaN(v) && v >= 1 && v <= 5) ? v : null; })();
    // brew temperature of the *displayed shot* (avg of its temperature curve) — not the live machine value
    const shotTemp = (() => {
      const t = shotObj?.dp?.t;
      if (!Array.isArray(t) || !t.length) return null;
      const avg = t.reduce((a, b) => a + b, 0) / t.length;
      return (avg > 200 ? avg / 10 : avg).toFixed(1);
    })();

    // ── live / machine ───────────────────────────────────────────────────────
    const temp        = this._num('machine_temperature', 1);
    const targetTemp  = this._num('machine_target_temperature', 1);
    const livePressure = this._num('machine_live_pressure', 1);
    const liveWeight   = this._num('machine_live_weight', 1);
    // "Boiler off" profiles report a near-zero target — show "Aus" instead of a meaningless 1°
    const boilerOff   = targetTemp !== null && parseFloat(targetTemp) < 30;
    const waterLevel   = (() => {
      const v = parseFloat(this._val('machine_water_level', null) as string);
      return isNaN(v) ? null : Math.round(v);
    })();

    // ── preheat ───────────────────────────────────────────────────────────────
    const preheatReady   = this._hass!.states[bsPrefix + 'preheat_ready']?.state === 'on';
    const preheatHasEnt  = !!this._hass!.states[bsPrefix + 'preheat_ready'];
    const preheatRem     = parseFloat(this._val('preheat_remaining', null) as string);
    const preheatEl      = uptimePreheatEl;
    const preheatTotal   = (!isNaN(preheatRem) && !isNaN(preheatEl)) ? preheatEl + preheatRem : null;
    const preheatPct     = preheatTotal ? Math.min(1, preheatEl / preheatTotal) : null;
    const preheatMinLeft = isNaN(preheatRem) ? null : Math.ceil(preheatRem / 60);

    // ── profile picker ────────────────────────────────────────────────────────
    const profileEntity  = this._hass!.states[selPrefix + 'profile'];
    const profileOptions = (profileEntity?.attributes?.options || null) as string[] | null;
    const realProfile = (profileEntity?.state && profileEntity.state !== 'unavailable')
      ? profileEntity.state : null;
    // optimistic: keep showing the just-selected profile until the machine confirms it
    if (this._pendingProfile && realProfile === this._pendingProfile) this._pendingProfile = null;
    const currentProfile = this._pendingProfile || realProfile;
    const profileSwitching = !!this._pendingProfile;
    const profileAvailable = Array.isArray(profileOptions) && profileOptions.length > 0;

    // ── status ────────────────────────────────────────────────────────────────
    const status   = this._val('machine_status', null);
    const dotClass = brewing ? 'brewing' : status === 'online' ? 'online' : status === 'error' ? 'error' : '';
    const today    = this._val('shots_today', '—');
    const syncTime = this._reltime('last_sync');
    const glpUrl   = safeUrl(this._config.glp_url);

    // ── maintenance ───────────────────────────────────────────────────────────
    const maintAvailable = this._maintAvailable();
    const ordersTabAvail = this._orders.length > 0;
    if (brewing && this._activeTab === 'maint') this._activeTab = 'shot';
    if (this._activeTab === 'orders' && !ordersTabAvail) this._activeTab = 'shot';
    const showMaint  = maintAvailable && !brewing && this._activeTab === 'maint';
    const showOrders = ordersTabAvail && this._activeTab === 'orders';
    const pendingOrders = this._orders.filter(o => o.status === 'pending').length;

    // ── nav dots ──────────────────────────────────────────────────────────────
    const indexChanged = this._shotIndex !== this._prevShotIndex;
    this._prevShotIndex = this._shotIndex;
    const showNav = !brewing && !showMaint && !showOrders && totalShots > 1;

    // ── chart ──────────────────────────────────────────────────────────────────
    const liveDur = Array.isArray(liveDatapoints?.timeInShot) && liveDatapoints.timeInShot.length
      ? liveDatapoints.timeInShot[liveDatapoints.timeInShot.length - 1]! / 10 : null;

    const histDp = !brewing && shotObj?.dp || null;
    const shotChartKey = shotObj ? (shotObj.id ?? `idx:${this._shotIndex}`) : null;
    const animateChart = this._shotChartKeyChanged(this._lastChartShotKey, shotChartKey);
    this._lastChartShotKey = shotChartKey;

    // ── live machine panel (static, shown when on & not brewing) ──────────────
    const lmTiles = [
      temp !== null ? {
        val: temp, unit: '°',
        lbl: boilerOff ? 'Temp · Boiler aus' : (targetTemp !== null ? `Temp · Ziel ${targetTemp}°` : 'Temp'),
        warm: !boilerOff && targetTemp !== null && parseFloat(temp) < parseFloat(targetTemp) - 1,
      } : null,
      livePressure !== null ? { val: livePressure, unit: ' bar', lbl: 'Druck' } : null,
      liveWeight   !== null ? { val: liveWeight,   unit: ' g',   lbl: 'Waage' } : null,
    ].filter(Boolean);

    // ── shot section ─────────────────────────────────────────────────────────
    // Score ring → typographic verdict (#120): thresholds intentionally
    // UNCHANGED from before this pass (80/55 on the 0-100 `score` field, not
    // the redesign brief's 90/70 — that figure describes the app-level
    // achievement scale, a different metric; changing this card's actual
    // scoring boundary would be a behavior change outside a visual redesign,
    // so it stays exactly as it was). Only the presentation changed: number
    // + word instead of a ringed circle.
    const score = shotObj?.score ?? null;
    const scoreCls = score == null ? '' : score >= 80 ? 'high' : score >= 55 ? 'mid' : 'low';
    const verdictWord = { high: T('verdict_high'), mid: T('verdict_mid'), low: T('verdict_low') }[scoreCls as 'high' | 'mid' | 'low'];

    return Object.assign(vm, {
      totalShots, shotObj,
      brewing, liveDatapoints, liveProfile, isDescaling, steamOn, elapsedSec,
      profile, coffee, drinkType, grinder, grind,
      duration, weight, ratio, pressure, rating, shotTemp,
      temp, targetTemp, livePressure, liveWeight, boilerOff, waterLevel,
      preheatReady, preheatHasEnt, preheatRem, preheatEl, preheatTotal, preheatPct, preheatMinLeft,
      profileOptions, currentProfile, profileSwitching, profileAvailable,
      status, dotClass, today, syncTime, glpUrl,
      maintAvailable, ordersTabAvail, showMaint, showOrders, pendingOrders,
      indexChanged, showNav,
      liveDur, histDp, shotChartKey, animateChart, lmTiles,
      score, scoreCls, verdictWord,
    });
  }

  // ── section builders (each returns a Lit TemplateResult built from the
  // _viewModel() object) ─────────────────────────────────────────────────────

  _machineOffHtml(vm: ViewModel): TemplateResult {
    const { standbyState, _powerBtn } = vm;
    const machineType = appMachineType(appMachineEntry(this._hass, this._config?.machine));
    const readyByHtml = this._buildReadyByHtml(vm.readyByTargetAt, vm.readyByPlannedAt);
      const offOrders = this._orders.length > 0 ? html`
        <div style="padding:0 var(--glp-sp-3) var(--glp-sp-3)">
          <div class="section-label" style="margin-bottom:var(--glp-sp-2)">${T('tab_orders')}</div>
          ${this._buildOrdersHtml()}
        </div>` : nothing;
      return html`
        <style>${STYLES}</style>
        <ha-card><div class="card collapsed">
          <div class="header">
            <div class="title">
              <span class="machine-icon-badge">${/* MACHINE_ICON_MINI() emits fixed SVG geometry, no user input */ unsafeSVG(MACHINE_ICON_MINI(this._iconGradId, machineType))}</span>
              ${this._config.title}
            </div>
            <div class="header-right">
              <span class="off-label">${standbyState?.state === 'on' ? T('machine_standby') : T('off_label')}</span>${_powerBtn}
            </div>
          </div>
          ${readyByHtml}
          ${offOrders}
        </div></ha-card>`;
  }

  _tabBarHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { maintAvailable, ordersTabAvail, showMaint, showOrders, pendingOrders } = vm;
    return (maintAvailable || ordersTabAvail) ? html`
      <div class="tab-bar">
        <button class="tab-btn${(!showMaint && !showOrders) ? ' active':''}" data-tab="shot" @click=${() => { this._selectTab('shot'); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} Shot</button>
        ${ordersTabAvail ? html`<button class="tab-btn${showOrders ? ' active':''}" data-tab="orders" @click=${() => { this._selectTab('orders'); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('cart'))} ${T('tab_orders')}${pendingOrders ? html` <span class="tab-badge">${pendingOrders}</span>` : nothing}</button>` : nothing}
        ${maintAvailable ? html`<button class="tab-btn${showMaint ? ' active':''}" data-tab="maint" @click=${() => { this._selectTab('maint'); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('wrench'))} ${T('tab_maint')}${this._maintAnyDue() ? html` ${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('warning', 'due'))}` : nothing}</button>` : nothing}
      </div>` : nothing;
  }

  _navHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { indexChanged, showNav, totalShots, shotObj } = vm;
    let navHtml: TemplateResult | typeof nothing = nothing;
    if (showNav) {
      const dots = this._recentShots.slice(0, 10).map((_, i) => {
        const active = i === this._shotIndex;
        return html`<span class="nav-dot${active ? ` active${indexChanged ? ' changed' : ''}` : ''}"></span>`;
      });
      const prevDis = this._shotIndex >= totalShots - 1;
      const nextDis = this._shotIndex <= 0;
      let tsLine: TemplateResult | typeof nothing = nothing;
      if (this._shotIndex > 0 && shotObj?.ts) {
        const d = parseTs(shotObj.ts);
        if (d && !isNaN(d as unknown as number))
          tsLine = html`<div class="nav-ts">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})} ${d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>`;
      }
      navHtml = html`
        <div class="nav-row">
          <button class="nav-arrow" data-nav="next" ?disabled=${nextDis} @click=${(e: Event) => { if ((e.currentTarget as HTMLButtonElement).hasAttribute('disabled')) return; this._navShot('next'); }}>‹</button>
          <div class="nav-dots">${dots}</div>
          <button class="nav-arrow" data-nav="prev" ?disabled=${prevDis} @click=${(e: Event) => { if ((e.currentTarget as HTMLButtonElement).hasAttribute('disabled')) return; this._navShot('prev'); }}>›</button>
        </div>${tsLine}`;
    }
    return navHtml;
  }

  _profilePickerHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, showMaint, profileAvailable, currentProfile, profileSwitching, profileOptions } = vm;
    return !brewing && !showMaint && profileAvailable ? html`
      <div class="profile-picker">
        <button class="profile-current-btn${this._profileOpen?' open':''}" data-action="toggle-profile" @click=${(e: Event) => { e.stopPropagation(); this._toggleProfilePicker(); }}>
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:1px">
            <span class="profile-label-small">${T('profile_label')}</span>
            <span class="profile-current-name">${currentProfile || '—'}${profileSwitching ? html`<span style="color:var(--amber);font-weight:500;font-size:var(--glp-fs-1)"> · ${T('profile_switching')}</span>` : nothing}</span>
          </div>
          <span class="profile-chevron${this._profileOpen?' open':''}">▾</span>
        </button>
        ${this._profileOpen ? html`<div class="profile-opts">
          ${profileOptions!.map(p =>
            html`<button class="profile-opt${p===currentProfile?' active':''}" data-profile-opt=${p} @click=${(e: Event) => { e.stopPropagation(); this._selectProfile(p); }}>${p}</button>`
          )}
        </div>` : nothing}
      </div>` : nothing;
  }

  // Star rating: drawn ICONS.of('star') replaces the ★ text character —
  // filled vs. empty is the .on class on the same shape, not a second glyph.
  _ratingHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { rating } = vm;
    return (() => {
      if (!rating || rating < 1 || rating > 5) return nothing;
      const cls = rating >= 4 ? 'high' : rating >= 3 ? 'mid' : 'low';
      const stars = Array.from({length:5}, (_,i) =>
        unsafeHTML(ICONS.of('star', i < rating ? `on ${cls}` : '')));
      return html`<div class="rating-row">${stars}</div>`;
    })();
  }

  // Historical shot: ratio is the recipe target a profile is set to hit,
  // duration is what actually happened during the pull, yield is what
  // came out — recipe/process/result, see metricLineHtml() above.
  _metricTrioHtml(vm: ViewModel): TemplateResult {
    const { ratio, duration, weight } = vm;
    return html`${/* metricLineHtml() escapes its own input and emits fixed markup */ unsafeHTML(metricLineHtml([
      ratio    ? { role: 'recipe',  num: `1:${ratio}`, unit: '',  label: 'Ratio'          } : null,
      duration ? { role: 'process', num: duration,      unit: 's', label: T('m_duration') } : null,
      weight   ? { role: 'result',  num: weight,        unit: 'g', label: T('m_yield')    } : null,
    ]))}`;
  }

  _secondaryHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { pressure, shotTemp } = vm;
    return (() => {
      const pills = [
        pressure   !== null ? { label: T('m_pressure'), val: `${pressure} bar` }  : null,
        shotTemp   !== null ? { label: T('m_temp'),     val: `${shotTemp}°` }     : null,
      ].filter(Boolean) as { label: string; val: string }[];
      if (!pills.length) return nothing;
      return html`<div class="stats-secondary">
        ${pills.map(p => html`
          <div class="stat-pill">
            <span class="stat-pill-label">${p.label}</span>
            <span class="stat-pill-value">${p.val}</span>
          </div>`)}
      </div>`;
    })();
  }

  _liveSvgHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, liveDatapoints, liveDur } = vm;
    return brewing && liveDatapoints
      ? html`<div class="chart-wrap">${/* buildLiveChart() emits fixed SVG from numeric data */ unsafeSVG(buildLiveChart(liveDatapoints))}</div>${/* chartLegendHtml() escapes its own input */ unsafeHTML(chartLegendHtml(liveDatapoints, liveDur))}` : nothing;
  }

  _histSvgHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { histDp, shotObj, animateChart } = vm;
    return histDp
      ? html`<div class="chart-wrap">${/* buildShotChart() emits fixed SVG from numeric data */ unsafeSVG(buildShotChart(histDp.p||[], histDp.t||[], histDp.w||[], histDp.f||[], shotObj?.duration, animateChart))}</div>${/* chartLegendHtml() escapes its own input */ unsafeHTML(chartLegendHtml(histDp, shotObj?.duration))}` : nothing;
  }

  // ── live brewing stats ──────────────────────────────────────────────────
  // Same metricLineHtml() component as the historical shot (metricTrioHtml
  // above) — see the redesign note on .metric-line in STYLES. Roles while
  // brewing: temp is the recipe's set point being held, pressure is the
  // process happening right now, weight is the result accumulating in the
  // cup. (labels were hardcoded German before this pass — T() is correct
  // behavior here, not a scope change: these three tiles are the same
  // per-shot stats as leg_temp/leg_pressure/leg_weight used elsewhere.)
  _liveStatsHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, temp, livePressure, liveWeight } = vm;
    return brewing ? html`${/* metricLineHtml() escapes its own input and emits fixed markup */ unsafeHTML(metricLineHtml([
      temp         !== null ? { role: 'recipe',  num: temp,         unit: '°', label: T('leg_temp')     } : null,
      livePressure !== null ? { role: 'process', num: livePressure, unit: 'bar', label: T('leg_pressure') } : null,
      liveWeight   !== null ? { role: 'result',  num: liveWeight,   unit: 'g', label: T('leg_weight')   } : null,
    ]))}` : nothing;
  }

  _liveMachineHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, showMaint, lmTiles } = vm;
    return (!brewing && !showMaint && lmTiles.length) ? html`
      <div class="live-machine">
        <div class="lm-head"><span class="lm-live-dot"></span>${T('lm_live')}</div>
        <div class="lm-tiles">
          ${lmTiles.map(t => html`
            <div class="lm-tile${t.warm ? ' warming' : ''}">
              <div class="lm-val">${String(t.val)}<span class="lm-unit">${t.unit}</span></div>
              <div class="lm-lbl">${t.lbl}</div>
            </div>`)}
        </div>
      </div>` : nothing;
  }

  _preheatHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, showMaint, preheatHasEnt, preheatReady, preheatPct, preheatMinLeft } = vm;
    return !brewing && !showMaint && preheatHasEnt ? (
      preheatReady
        ? html`<div class="preheat-ready">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('preheat_ready')}</div>`
        : preheatPct !== null ? html`
          <div class="preheat-warming">
            <div class="preheat-warming-label">
              <span>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('heat'))} ${T('preheat_heating')}</span>
              <span>${preheatMinLeft !== null ? `${preheatMinLeft} min` : ''}</span>
            </div>
            <div class="preheat-bar-bg">
              <div class="preheat-bar-fill" style="width:${Math.round(preheatPct*100)}%"></div>
            </div>
          </div>` : nothing
    ) : nothing;
  }

  _shotSectionHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, showMaint, profile, drinkType, coffee, grinder, grind, shotObj, score, scoreCls, verdictWord } = vm;
    const scoreBadge = score != null
      ? html`<div class="verdict ${scoreCls}"><span class="verdict-num">${score}</span><span class="verdict-sep"> · </span><span class="verdict-word">${verdictWord}</span></div>`
      : nothing;
    return !brewing && !showMaint ? html`
      ${profile
        ? html`<div class="shot-hero">
            <div class="shot-hero-main">
              <div class="shot-profile">${profile}</div>
              <div class="shot-meta">
                ${drinkType ? html`<span class="shot-drink">${drinkType}</span>` : nothing}
                ${coffee    ? html`<span class="shot-coffee">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${coffee}</span>${this._beanExtraHtml(coffee, shotObj?.beanId)}` : nothing}
              </div>
              ${(grinder || grind) ? html`<div class="shot-grind">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('gear'))} ${[grinder, grind].filter(Boolean).join(' · ')}</div>` : nothing}
            </div>
            ${scoreBadge}
          </div>`
        : html`<div class="no-shot">
            <div class="no-shot-label">${T('no_shot_label')}</div>
            <div class="no-shot-hint">${T('no_shot_hint')}</div>
          </div>`}
      ${this._ratingHtml(vm)}
      ${this._metricTrioHtml(vm)}
      ${this._secondaryHtml(vm)}
      ${this._histSvgHtml(vm)}
    ` : nothing;
  }

  _footerHtml(vm: ViewModel): TemplateResult {
    const { today, waterLevel, syncTime, glpUrl } = vm;
    return html`
      <div class="footer">
        <span class="footer-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${T('footer_today', today)}</span>
        ${waterLevel !== null ? html`<span class="footer-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('droplet'))} ${waterLevel}%</span>` : html`<span></span>`}
        <span class="footer-item">
          ${syncTime ? syncTime : nothing}
          ${glpUrl ? html`${syncTime ? ' · ' : ''}<a href=${glpUrl} target="_blank" rel="noopener noreferrer">GLP ↗</a>` : nothing}
        </span>
      </div>`;
  }

  _render(): void {
    if (!this._hass || !this._config) return;

    const vm = this._viewModel();
    const machineType = appMachineType(appMachineEntry(this._hass, this._config?.machine));

    // ── machine off ──────────────────────────────────────────────────────────
    if (vm.machineOff) {
      this._profileOpen = false;
      render(this._machineOffHtml(vm), this.shadowRoot!);
      this._applyMachineTheme();
      this._applySemanticColorContrast();
      this._startReadyByTicker();
      return;
    }

    render(html`
      <style>${STYLES}</style>
      <ha-card><div class="card">

        <div class="header">
          <div class="title">
            <span class="machine-icon-badge">${/* MACHINE_ICON_MINI() emits fixed SVG geometry, no user input */ unsafeSVG(MACHINE_ICON_MINI(this._iconGradId, machineType))}</span>
            ${this._config.title}
          </div>
          <div class="header-right">
            ${this._machineOnSince ? html`<span class="machine-uptime" title=${T('uptime_title')}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('plug'))}<span id="glp-uptime-text" .textContent=${fmtUptime(Date.now() - this._machineOnSince)}></span></span>` : nothing}
            <div class="status-dot ${vm.dotClass}"></div>
            ${vm._powerBtn}
          </div>
        </div>

        ${this._tabBarHtml(vm)}
        ${vm.isDescaling && !vm.brewing ? html`<div class="descaling-banner">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('descale'))} ${T('descaling_mode')}</div>` : nothing}
        ${vm.steamOn && !vm.brewing ? html`<div class="steam-banner">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('steam'))} ${T('steam_mode')}</div>` : nothing}
        ${vm.waterLevel !== null && vm.waterLevel < 20 ? html`<div class="water-low">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('droplet'))} ${T('water_low', vm.waterLevel as unknown as string)}</div>` : nothing}
        ${this._preheatHtml(vm)}
        ${this._profilePickerHtml(vm)}
        ${this._liveMachineHtml(vm)}
        ${this._navHtml(vm)}

        <div class="swipe-target"
          @touchstart=${{ handleEvent: (e: TouchEvent) => { this._swipeSx = e.touches[0]!.clientX; this._swipeSy = e.touches[0]!.clientY; }, passive: true }}
          @touchend=${{ handleEvent: (e: TouchEvent) => {
            if (this._profileOpen) return;
            const dx = e.changedTouches[0]!.clientX - this._swipeSx;
            const dy = e.changedTouches[0]!.clientY - this._swipeSy;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            this._navShot(dx > 0 ? 'next' : 'prev');
          }, passive: true }}>
          <div class="swipe-content">
            ${vm.brewing ? html`
              <div class="brewing-banner">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${T('brewing')}${vm.elapsedSec !== null ? ` · ${vm.elapsedSec}s` : ' …'}</div>
              ${vm.liveProfile ? html`<div class="shot-hero" style="margin-bottom:var(--glp-sp-3)"><div class="shot-profile">${vm.liveProfile}</div></div>` : nothing}
              ${this._liveSvgHtml(vm)}
              ${this._liveStatsHtml(vm)}
            ` : vm.showMaint ? this._buildMaintHtml() : vm.showOrders ? this._buildOrdersHtml() : this._shotSectionHtml(vm)}
          </div>
        </div>

        ${this._footerHtml(vm)}

      </div></ha-card>`, this.shadowRoot!);
    this._applyMachineTheme();
    this._applySemanticColorContrast();
    this._startUptimeTicker();
  }

  getCardSize(): number { return 3; }
  static getStubConfig() { return { entity_prefix: 'sensor.gaggiuino_local_profiler_' }; }
}

// Deferred until HA's scoped-registry polyfill has replaced customElements. #184
const define = () => customElements.get('glp-card') || customElements.define('glp-card', GlpCard);
if (customElements.get('home-assistant')) define();
else customElements.whenDefined('home-assistant').then(define);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'glp-card', name: 'GLP Shot Card',
  description: 'Shows the last espresso shot from Gaggiuino Local Profiler',
  preview: false,
  documentationURL: 'https://github.com/mxkissnr/glp-lovelace-card',
});

console.info(
  `%c GLP-CARD %c v${GLP_CARD_VERSION} `,
  'background:#ff3b30;color:#fff;padding:2px 4px;border-radius:3px 0 0 3px',
  'background:#111113;color:#ff3b30;padding:2px 4px;border-radius:0 3px 3px 0'
);

export { GlpCard, esc, safeUrl, metricLineHtml };
