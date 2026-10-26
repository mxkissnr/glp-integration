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
import { moreInfo, toast, haptic } from '../../shared/ha-events.ts';
import { GlpSheet } from '../../shared/sheet.ts';
import type { GlpSheetContent } from '../../shared/sheet.ts';
import { fmtUptime, buildShotChart, buildLiveChart, chartLegendHtml, metricLineHtml } from './charts.ts';
import type { TemplateResult } from 'lit';
import type {
  Hass, HassStateObject, CardConfig, ThemeStops, MachineEntry,
  RecentShot, BaristaOrder, BeanInfo, GrinderEntry, MaintTaskDetail,
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

// A press held this long on the card header opens the machine's more-info
// dialog, like Home Assistant's own long-press. Any earlier pointerup, a
// cancel/leave or a move past HEADER_PRESS_MOVE_PX turns it back into a no-op.
const HEADER_LONG_PRESS_MS = 500;
const HEADER_PRESS_MOVE_PX = 10;

// The card's UI language follows the Home Assistant frontend language and
// falls back to English (the i18n table's own fallback) when hass has none or
// names one this card has no table for.
function resolveLang(hass: Hass | null | undefined): string {
  const l = String(hass?.language || hass?.locale?.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGS.includes(l) ? l : 'en';
}

// A configured entity_prefix names this card's machine: a sensor entity id and
// nothing else. A typo (or a non-string from YAML) would otherwise silently
// fall back to "no entity found" and render an empty card.
const ENTITY_PREFIX_RE = /^sensor\.[a-z0-9_]+$/;

// A tile in the live-machine panel below the profile picker.
interface LmTile {
  val: string | number;
  unit: string;
  lbl: string;
  // The sensor this value comes from: tapping the tile opens its history.
  entity: string;
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

// What a render actually depended on: the resolved prefix, the language and
// theme, the identity of every state object the card reads, and the wall-clock
// minute. HA replaces a state object only when that entity changes, so comparing
// a fresh snapshot with the last render's tells the `hass` setter whether a push
// concerns this card at all (see _needsRender()). The minute is in there because
// two texts are derived from Date.now() at render time — the order ETA countdown
// and the "last sync N min ago" line — so without it they freeze as long as no
// watched entity changes.
interface RenderInputs {
  prefix: string;
  language: string;
  theme: string;
  ids: string[];
  states: (HassStateObject | undefined)[];
  minute: number;
}

// ─── card ──────────────────────────────────────────────────────────────────────

class GlpCard extends HTMLElement {
  // Instance state. `declare` keeps these type-only, so a field initializer
  // can never change the emitted ES2022 output (#180).
  declare _hass: Hass | null;
  declare _config: CardConfig;
  // The card's one bottom sheet (shared GlpSheet), created on first use.
  declare _sheet: GlpSheet | null;
  // The slot node that sheet was mounted into; a view switch replaces it.
  declare _sheetSlot: HTMLElement | null;
  // The language the cached sheet's close label was built with.
  declare _sheetLang: string | null;
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
  declare _machineOnSince: number | null;
  declare _uptimeTimer: ReturnType<typeof setInterval> | null;
  declare _orders: BaristaOrder[];
  declare _ordersSig: string | null;
  declare _ordersPoll: ReturnType<typeof setInterval> | null;
  declare _ordersRetry: ReturnType<typeof setTimeout> | null;
  declare _ordersOff: boolean;
  declare _beansInfo: Map<string, BeanInfo> | null;
  declare _beansInfoById: Map<number, BeanInfo> | null;
  declare _beansInfoAt: number;
  declare _beansInfoUnavailable: boolean;
  // The order the sheet is showing, plus which of its action steps is open and
  // the data it was last rendered from.
  declare _orderSheetId: string | null;
  declare _orderSheetEta: boolean;
  declare _orderSheetDecline: boolean;
  declare _orderSheetSig: string;
  declare _switchEntity: string | null;
  declare _iconGradId: string;
  declare _readyByTimer: ReturnType<typeof setInterval> | null;
  declare _readyByPlannedAt: Date | null;
  declare _readyByTargetAt: Date | null;
  declare _pendingReadyByTargetAt: Date | false | null;
  declare _pendingReadyByTimer: ReturnType<typeof setTimeout> | null;
  declare _headerPressTimer: ReturnType<typeof setTimeout> | null;
  declare _headerPressX: number;
  declare _headerPressY: number;
  declare _lastKnownReadyByTargetAt: Date | null;
  declare _lastKnownReadyByPlannedAt: Date | null;
  // Caches for the whole-map scans (_stateKeys, _resolvePrefix) and for the
  // render/contrast gating; all keyed on the hass.states object they came from.
  declare _stateKeysStates: Record<string, HassStateObject> | null;
  declare _stateKeysCache: string[] | null;
  declare _prefixStates: Record<string, HassStateObject> | null;
  declare _prefixConfig: CardConfig | null;
  declare _prefixValue: string | null;
  declare _machineEntryCached: boolean;
  declare _machineEntryStates: Record<string, HassStateObject> | null;
  declare _machineEntryMachine: string | null | undefined;
  declare _machineEntryValue: MachineEntry | null | undefined;
  declare _renderInputs: RenderInputs | null;
  declare _contrastKey: string | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sheet        = null;
    this._sheetSlot    = null;
    this._sheetLang = null;
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
    this._pendingProfileTimer = null;
    this._machineOnSince = null;
    this._uptimeTimer = null;
    this._orders = [];
    this._ordersSig = null;
    this._ordersPoll = null;
    this._ordersRetry = null;
    // Set when the orders endpoint answers 404: the feature is off in the
    // app, so this card instance stops asking until it is re-created.
    this._ordersOff = false;
    this._beansInfo = null;
    this._beansInfoById = null;
    this._beansInfoAt = 0;
    this._beansInfoUnavailable = false;
    this._orderSheetId = null;
    this._orderSheetEta = false;
    this._orderSheetDecline = false;
    this._orderSheetSig = '';
    this._switchEntity = this._readSwitchEntity();
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
    this._headerPressTimer = null;
    this._headerPressX = 0;
    this._headerPressY = 0;
    // last-known-good cache (#68): 'unavailable' is a transient connectivity
    // blip, not a real "nothing scheduled" signal — see _readReadyBy().
    this._lastKnownReadyByTargetAt = null;
    this._lastKnownReadyByPlannedAt = null;
    this._stateKeysStates = null;
    this._stateKeysCache = null;
    this._prefixStates = null;
    this._prefixConfig = null;
    this._prefixValue = null;
    this._machineEntryCached = false;
    this._machineEntryStates = null;
    this._machineEntryMachine = undefined;
    this._machineEntryValue = null;
    this._renderInputs = null;
    this._contrastKey = null;

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
          this._callService('switch', 'toggle', { entity_id: this._switchEntity }, () => {
            haptic(this, 'success');
          });
        return;
      }
      if ((e.target as Element).closest('[data-action="set-ready-by"]')) {
        e.stopPropagation();
        const input = this.shadowRoot!.getElementById('glp-readyby-input') as HTMLInputElement | null;
        const target = this._resolveReadyByTarget(input?.value, new Date());
        if (this._hass && target) {
          const hhmm = target.toLocaleTimeString(this._locale(), { hour: '2-digit', minute: '2-digit' });
          this._callService('gaggiuino_profiler', 'set_ready_by', {
            target_time: target.toISOString(),
            ...(this._config?.machine != null ? { machine: this._config.machine } : {}),
          }, () => {
            toast(this, T('toast_ready_by', hhmm));
            haptic(this, 'success');
          }, () => this._clearPendingReadyBy());
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
          this._callService('gaggiuino_profiler', 'set_ready_by', {
            ...(this._config?.machine != null ? { machine: this._config.machine } : {}),
          }, () => {
            haptic(this, 'success');
          }, () => this._clearPendingReadyBy());
          this._pendingReadyByTargetAt = false;   // optimistic: show the picker immediately until the sensor confirms
          clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>);
          this._pendingReadyByTimer = setTimeout(() => { this._pendingReadyByTargetAt = null; this._render(); }, READY_BY_PENDING_FALLBACK_MS);
          this._render();
        }
      }
    });

    // Header long-press (Home Assistant's own gesture for "open the entity"):
    // 500 ms with the finger still, then the machine's more-info dialog.
    // Buttons inside the header keep their own gesture, so a press on the
    // power button only toggles.
    this.shadowRoot!.addEventListener('pointerdown', (e: Event) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      if (!target.closest('.header')) return;
      // A press that starts on a button belongs to that button: the power
      // button must never also open the machine dialog.
      if (target.closest('button')) return;
      const pe = e as PointerEvent;
      this._headerPressX = pe.clientX;
      this._headerPressY = pe.clientY;
      clearTimeout(this._headerPressTimer as ReturnType<typeof setTimeout>);
      this._headerPressTimer = setTimeout(() => {
        this._headerPressTimer = null;
        this._longPressHeader();
      }, HEADER_LONG_PRESS_MS);
    });
    const endHeaderPress = (): void => {
      if (!this._headerPressTimer) return;
      clearTimeout(this._headerPressTimer as ReturnType<typeof setTimeout>);
      this._headerPressTimer = null;
    };
    this.shadowRoot!.addEventListener('pointerup', endHeaderPress);
    this.shadowRoot!.addEventListener('pointercancel', endHeaderPress);
    // pointerleave does not bubble, so only a capture listener on the shadow
    // root sees the pointer leaving the header for outside the card.
    this.shadowRoot!.addEventListener('pointerleave', endHeaderPress, true);
    this.shadowRoot!.addEventListener('pointermove', (e: Event) => {
      if (!this._headerPressTimer) return;
      const pe = e as PointerEvent;
      const dx = pe.clientX - this._headerPressX;
      const dy = pe.clientY - this._headerPressY;
      // A scroll or swipe is not a long press; an event without coordinates
      // cannot prove either way, so it leaves the timer alone.
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > HEADER_PRESS_MOVE_PX) endHeaderPress();
    });
  }

  // Handlers bound from the Lit templates (elements survive renders now, so
  // per-render addEventListener wiring would stack listeners). The delegated
  // power/ready-by buttons stay on the constructor's shadowRoot listener.
  _selectProfile(val: string): void {
    if (this._hass) {
      const entityId = this._resolvePrefix().replace(/^sensor\./, 'select.') + 'profile';
      haptic(this, 'selection');
      this._callService('select', 'select_option', { entity_id: entityId, option: val }, () => {
        toast(this, T('toast_profile', val));
        haptic(this, 'success');
      }, () => {
        this._pendingProfile = null;
        clearTimeout(this._pendingProfileTimer as ReturnType<typeof setTimeout>);
        this._pendingProfileTimer = null;
        this._render();
      });
      this._pendingProfile = val;   // optimistic: show immediately until the machine confirms
      clearTimeout(this._pendingProfileTimer as ReturnType<typeof setTimeout>);
      this._pendingProfileTimer = setTimeout(() => { this._pendingProfile = null; this._render(); }, 8000);
    }
    this._render();
  }

  _selectTab(tab: string): void {
    if (tab !== this._activeTab) {
      this._activeTab = tab;
      haptic(this, 'selection');
      this._render();
    }
  }

  _startUptimeTicker(): void {
    if (this._uptimeTimer || !this.isConnected) return;
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
    if (this._readyByTimer || !this.isConnected) return;
    this._readyByTimer = setInterval(() => {
      // Same property-binding requirement as the uptime ticker above (#180).
      const el = this.shadowRoot!.getElementById('glp-readyby-countdown');
      if (el) el.textContent = this._readyByCountdownText(this._readyByPlannedAt, this._readyByTargetAt);
    }, 1000);
  }

  // Restarts the orders poll when the card is re-attached (dashboard edit
  // mode, view switch): hass stops arriving, and the setter only starts a
  // poll while connected. The render puts back whichever ticker the current
  // view needs, since disconnectedCallback cleared it.
  connectedCallback(): void {
    this._startOrdersPoll();
    // A re-attached card has fresh DOM, so the contrast pass must run again.
    this._contrastKey = null;
    if (this._hass) this._render();
  }

  // Every timer this card owns must stop here: a detached card gets no more
  // hass pushes, so nothing else would ever clear them.
  disconnectedCallback(): void {
    if (this._uptimeTimer) clearInterval(this._uptimeTimer as ReturnType<typeof setInterval>);
    this._uptimeTimer = null;
    this._stopOrdersPoll();               // interval plus the proxy retry
    if (this._readyByTimer) clearInterval(this._readyByTimer as ReturnType<typeof setInterval>);
    this._readyByTimer = null;
    if (this._pendingProfileTimer) clearTimeout(this._pendingProfileTimer as ReturnType<typeof setTimeout>);
    this._pendingProfileTimer = null;
    if (this._pendingReadyByTimer) clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>);
    this._pendingReadyByTimer = null;
    if (this._headerPressTimer) clearTimeout(this._headerPressTimer as ReturnType<typeof setTimeout>);
    this._headerPressTimer = null;
    // A sheet left open by a removed card would keep its history entry
    // behind; close() trims that entry too.
    this._sheet?.close();
  }

  // ── bottom sheet (shared GlpSheet) ────────────────────────────────────────
  // The sheet mounts into a slot node the card template renders after the
  // card. Anything appended straight to the shadow root would be dropped by
  // the next Lit render, which clears everything it did not commit itself.
  _sheetSlotHtml(): TemplateResult {
    return html`<div class="glp-sheet-slot"></div>`;
  }

  // One sheet per card, created on first use. A view switch (machine on/off)
  // replaces the slot node, and a language change makes the cached sheet's
  // close label stale, so either rebuilds it.
  _sheetFor(): GlpSheet | null {
    const slot = this.shadowRoot?.querySelector<HTMLElement>('.glp-sheet-slot') ?? null;
    if (!slot) return null;
    const previous = this._sheet;
    if (!this._sheet || this._sheetSlot !== slot || this._sheetLang !== getLang()) {
      // Dropped before close(), so the old sheet's own onClose below sees that
      // it is no longer the current one (and never touches the half-built
      // replacement).
      this._sheet = null;
      previous?.close();
      const sheet = new GlpSheet(slot, {
        closeLabel: T('sheet_close'),
        // However the sheet was closed, the order it showed is no longer the
        // subject of any pending action step. A superseded sheet closes too
        // (its slot or language is gone), and its slide-out finishes after the
        // replacement is already showing the order, so only the current sheet
        // may clear that state.
        onClose: () => {
          if (this._sheet !== sheet) return;
          this._forgetOrderSheet();
        },
      });
      this._sheet = sheet;
      this._sheetSlot = slot;
      this._sheetLang = getLang();
    }
    return this._sheet;
  }

  // Arrow/Home/End move focus between the options of an open picker, wrapping
  // at both ends. Enter and Space select the focused option: preventing the
  // key default stops the browser from firing its own click on top of the one
  // dispatched here, so a key press is exactly one selection.
  _sheetOptionKeyNav(e: KeyboardEvent): void {
    const key = e.key;
    if (key === 'Enter' || key === ' ') {
      const option = (e.target as HTMLElement | null)?.closest<HTMLElement>('[role="option"]');
      if (!option) return;
      e.preventDefault();
      option.click();
      return;
    }
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
    const opts = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]'));
    if (!opts.length) return;
    e.preventDefault();
    const at = opts.indexOf(e.target as HTMLElement);
    let next: number;
    if (key === 'Home') next = 0;
    else if (key === 'End') next = opts.length - 1;
    else if (key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % opts.length;
    else next = at < 0 ? opts.length - 1 : (at - 1 + opts.length) % opts.length;
    opts[next]?.focus();
  }

  // ── Home Assistant events (documented custom-card events) ─────────────────
  // callService returns a Promise in HA, but a stub may return nothing, so the
  // result is always promisified. A rejected call is a failed action: the
  // caller rolls its optimistic state back, then the user gets a toast and a
  // failure vibration.
  _callService(
    domain: string, service: string, data: Record<string, unknown>,
    onDone?: () => void, onFail?: () => void,
  ): void {
    const hass = this._hass;
    if (!hass?.callService) return;
    let call: Promise<unknown>;
    try {
      call = Promise.resolve(hass.callService(domain, service, data));
    } catch {
      this._actionFailed(onFail);
      return;
    }
    call.then(() => { onDone?.(); }, () => { this._actionFailed(onFail); });
  }

  _actionFailed(onFail?: () => void): void {
    onFail?.();
    toast(this, T('toast_action_failed'));
    haptic(this, 'failure');
  }

  // Rolls the optimistic ready-by state back after a rejected call.
  _clearPendingReadyBy(): void {
    this._pendingReadyByTargetAt = null;
    clearTimeout(this._pendingReadyByTimer as ReturnType<typeof setTimeout>);
    this._pendingReadyByTimer = null;
    this._render();
  }

  // A long press on the header opens the machine itself: its switch entity
  // when one is configured, the status sensor otherwise.
  _longPressHeader(): void {
    moreInfo(this, this._switchEntity || this._resolvePrefix() + 'machine_status');
    haptic(this, 'selection');
  }

  // Tapping a live value opens that entity's history.
  _showHistory(entityId: string): void {
    moreInfo(this, entityId);
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

  // Dates and times follow Home Assistant's locale, then its language, then
  // the card's active language — never a fixed locale.
  _locale(): string {
    return String(this._hass?.locale?.language || this._hass?.language || getLang());
  }

  _buildReadyByHtml(targetAt: Date | null, plannedAt: Date | null): TemplateResult {
    if (targetAt) {
      const hhmm = targetAt.toLocaleTimeString(this._locale(), { hour: '2-digit', minute: '2-digit' });
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
    const hass = this._hass;
    // Nothing may arm a timer on a detached card: nothing would ever clear it
    // and its requests would keep running behind a removed dashboard card.
    if (this._ordersPoll || !this.isConnected || this._ordersOff || !hass) return;
    if (!hass.fetchWithAuth) {
      // The integration's proxy is not available yet; the next hass push
      // calls back in here, and this retry covers a push that never comes.
      if (!this._ordersRetry)
        this._ordersRetry = setTimeout(() => { this._ordersRetry = null; this._startOrdersPoll(); }, 1500);
      return;
    }
    this._fetchOrders(true);
    this._ordersPoll = setInterval(() => this._fetchOrders(false), 6000);
  }

  _stopOrdersPoll(): void {
    if (this._ordersPoll) { clearInterval(this._ordersPoll as ReturnType<typeof setInterval>); this._ordersPoll = null; }
    if (this._ordersRetry) { clearTimeout(this._ordersRetry as ReturnType<typeof setTimeout>); this._ordersRetry = null; }
  }

  async _fetchOrders(force: boolean): Promise<void> {
    if (!this._hass?.fetchWithAuth) return;
    let list;
    try {
      const r = await this._hass.fetchWithAuth('/api/glp/orders');
      // 404: the orders feature is switched off in the app (or the proxy is
      // too old). Polling would only ever answer 404, so stop for this card.
      if (r.status === 404) { this._ordersOff = true; this._stopOrdersPoll(); return; }
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
    this._render();   // every render ends in _syncOrderSheet()
  }

  // Keeps an open order sheet in step with the list: another device may have
  // handled the order, in which case the sheet has nothing left to act on and
  // closes silently; otherwise it is re-rendered so its waiting time and
  // ready-in line follow the list. Runs at the end of every render because
  // neither view may leave a sheet behind on a slot node it just replaced.
  _syncOrderSheet(): void {
    const id = this._orderSheetId;
    if (id == null) return;
    const order = this._orderById(id);
    if (!order) { this._closeOrderSheet(); return; }
    const previous = this._sheet;
    // The id survives _sheetFor(): a rebuild drops the old sheet from the field
    // before closing it, so the onClose that clears the state no longer fires.
    const sheet = this._sheetFor();
    if (!sheet) return;
    // _sheetFor() rebuilds after a view switch or a language change, which
    // closes the old sheet; the order then has to be handed to the new one.
    const rebuilt = sheet !== previous;
    // Not rebuilt and not open: a close is in progress (its slide-out has
    // already flipped isOpen) or done, and re-opening would undo it.
    if (!rebuilt && !sheet.isOpen) return;
    const sig = this._orderSheetSigFor(order);
    if (!rebuilt && sig === this._orderSheetSig) return;
    this._orderSheetSig = sig;
    sheet.open(this._orderSheetContent(id, order));
  }

  // What the sheet's body is derived from. The minute is in there because the
  // waiting line is relative to now, so an open sheet follows it the same way
  // the card's own minute-based render does.
  _orderSheetSigFor(order: BaristaOrder): string {
    return JSON.stringify([
      order.status, order.eta, order.acceptedAt, order.item, order.variant,
      order.customer, order.note, Math.floor(Date.now() / 60000),
    ]);
  }

  // The sheet is shared, so its content stops being about an order whenever a
  // picker or a maintenance task takes it over, and whenever the card closes it.
  _forgetOrderSheet(): void {
    this._orderSheetId = null;
    this._orderSheetEta = false;
    this._orderSheetDecline = false;
    this._orderSheetSig = '';
  }

  // Forgets the order and closes the sheet. The sheet's own onClose does the
  // same, but only once a phone's slide-out has finished.
  _closeOrderSheet(): void {
    this._forgetOrderSheet();
    this._sheet?.close();
  }

  _orderById(id: string): BaristaOrder | null {
    return this._orders.find(o => o.id === id) ?? null;
  }

  // Whole minutes left until the promised time, or null when the accepted
  // order carries no eta.
  _orderMinsLeft(order: BaristaOrder): number | null {
    if (!order.acceptedAt || !order.eta) return null;
    return Math.max(0, Math.ceil((order.acceptedAt + order.eta * 60000 - Date.now()) / 60000));
  }

  // How long the order has been waiting: "just now" under a minute, then whole
  // minutes.
  _orderWaitingText(createdAt: number | undefined): string {
    const at = parseTs(createdAt);
    if (!at) return T('ord_waiting_now');
    const mins = Math.floor((Date.now() - at.getTime()) / 60000);
    if (!(mins >= 1)) return T('ord_waiting_now');
    return T('ord_waiting', String(mins));
  }

  // Runs one barista action. fetchWithAuth resolves on 4xx/5xx, so the response
  // status decides success: an ok answer closes the sheet with a confirmation,
  // a failed one keeps it open and reports itself. Either way the list is
  // refetched so the card and an open sheet show what the app really has.
  async _orderAction(id: string, action: string, body: Record<string, unknown>): Promise<void> {
    if (!this._hass?.fetchWithAuth || !id) return;
    let ok = false;
    try {
      ok = (await this._hass.fetchWithAuth(`/api/glp/orders/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      })).ok;
    } catch { /* the request never landed, so the action failed */ }
    if (ok) {
      // State first: on a phone the close only flips isOpen and slides out, so
      // the refetch below would otherwise see the order still marked open and
      // re-open the sheet it just closed.
      this._closeOrderSheet();
      toast(this, action === 'accept'
        ? T('toast_ord_accepted', String(body.eta ?? ''))
        : action === 'complete' ? T('toast_ord_done') : T('toast_ord_declined'));
      haptic(this, 'success');
    } else {
      toast(this, T('toast_action_failed'));
      haptic(this, 'failure');
    }
    await this._fetchOrders(true);
  }

  // Every row is a read-only summary (#264): the barista actions live in the
  // shared sheet, so a long queue no longer grows the card with a button row
  // per order. The row itself is the tap target, keyboard included.
  _buildOrdersHtml(): TemplateResult {
    if (!this._orders.length) return html`<div class="unavailable">${T('orders_none')}</div>`;
    return html`<div class="ord-list">${this._orders.map(o => this._orderRowHtml(o))}</div>`;
  }

  _orderRowHtml(order: BaristaOrder): TemplateResult {
    const label = order.variant ? `${order.item} · ${order.variant}` : order.item;
    const minsLeft = this._orderMinsLeft(order);
    const open = (): void => { this._openOrderSheet(order.id); };
    return html`<div class="ord-row ${order.status === 'pending' ? 'pending' : 'accepted'}" data-order-id=${order.id} role="button" tabindex="0" @click=${open} @keydown=${(e: Event) => {
      const key = (e as KeyboardEvent).key;
      if (key !== 'Enter' && key !== ' ') return;
      e.preventDefault();   // Space would scroll the page
      open();
    }}><div class="ord-top"><span class="ord-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${label}</span>${order.customer ? html`<span class="ord-who">${order.customer}</span>` : nothing}</div>${order.note ? html`<div class="ord-note">„${order.note}"</div>` : nothing}${order.status === 'accepted' ? html`<div class="ord-sub">${minsLeft != null ? T('ord_ready_in', String(minsLeft)) : T('ord_preparing')}</div>` : nothing}</div>`;
  }

  // One order in the shared sheet (#264): the same summary plus its waiting
  // time, and the actions that used to sit in the row. Pending orders offer
  // Accept (which swaps the actions to the ETA choice in place) and Decline; an
  // accepted one offers Done and Decline. Decline first asks for a second tap,
  // and Cancel there returns to the normal actions without closing the sheet.
  _openOrderSheet(id: string): void {
    const order = this._orderById(id);
    if (!order) return;
    const sheet = this._sheetFor();
    if (!sheet) return;
    this._orderSheetId = id;
    this._orderSheetEta = false;
    this._orderSheetDecline = false;
    this._orderSheetSig = this._orderSheetSigFor(order);
    sheet.open(this._orderSheetContent(id, order));
  }

  // Both callbacks read the order back from the live list, so a refresh after a
  // poll shows the new status and waiting time even though the content object
  // was built earlier.
  _orderSheetContent(id: string, order: BaristaOrder): GlpSheetContent {
    return {
      title: order.variant ? `${order.item} · ${order.variant}` : order.item,
      body: () => this._orderSheetBody(this._orderById(id) ?? order),
      actions: () => this._orderSheetActions(this._orderById(id) ?? order),
    };
  }

  _orderSheetBody(order: BaristaOrder): TemplateResult {
    const minsLeft = this._orderMinsLeft(order);
    return html`<div class="ord-detail">
      ${order.variant ? html`<div class="ord-detail-val">${order.variant}</div>` : nothing}
      ${order.customer ? html`<div class="ord-detail-who">${order.customer}</div>` : nothing}
      ${order.note ? html`<div class="ord-note">„${order.note}"</div>` : nothing}
      <div class="ord-sub">${this._orderWaitingText(order.createdAt)}</div>
      ${order.status === 'accepted' ? html`<div class="ord-sub">${minsLeft != null ? T('ord_ready_in', String(minsLeft)) : T('ord_preparing')}</div>` : nothing}
    </div>`;
  }

  _orderSheetActions(order: BaristaOrder): TemplateResult {
    // The ETA choice and the decline question replace the actions in place:
    // refresh() re-renders the sheet, so neither needs a second sheet.
    if (this._orderSheetDecline) {
      return html`<span class="ord-q">${T('ord_decline_q')}</span>
        <button type="button" class="ord-btn danger" data-ord-decline-yes=${order.id} @click=${() => { this._orderAction(order.id, 'decline', {}); }}>${T('ord_yes')}</button>
        <button type="button" class="ord-btn ghost" data-ord-cancel="1" @click=${() => { this._orderSheetDecline = false; this._sheet?.refresh(); }}>${T('sheet_cancel')}</button>`;
    }
    if (order.status === 'pending' && this._orderSheetEta) {
      return html`<span class="ord-q">${T('ord_done_in')}</span>${[3, 5, 8, 10].map(m => html`<button type="button" class="ord-btn eta" data-ord-accept=${order.id} data-eta=${m} @click=${() => { this._orderAction(order.id, 'accept', { eta: m }); }}>${m} min</button>`)}<button type="button" class="ord-btn ghost" data-ord-cancel="1" @click=${() => { this._orderSheetEta = false; this._sheet?.refresh(); }}>${T('sheet_cancel')}</button>`;
    }
    const primary = order.status === 'pending'
      ? html`<button type="button" class="ord-btn primary" data-ord-eta=${order.id} @click=${() => { this._orderSheetEta = true; this._sheet?.refresh(); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('ord_accept')}</button>`
      : html`<button type="button" class="ord-btn primary" data-ord-done=${order.id} @click=${() => { this._orderAction(order.id, 'complete', {}); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('ord_done')}</button>`;
    return html`${primary}<button type="button" class="ord-btn ghost" data-ord-decline=${order.id} @click=${() => { this._orderSheetDecline = true; this._sheet?.refresh(); }}>${T('ord_decline')}</button>`;
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
    const prefix = config?.entity_prefix;
    if (prefix != null && (typeof prefix !== 'string' || !ENTITY_PREFIX_RE.test(prefix))) {
      // Home Assistant shows a thrown message as the card's error text.
      throw new Error('entity_prefix must be a sensor entity id, for example sensor.gaggiuino_local_profiler_');
    }
    this._config = { title: 'Gaggiuino', ...config };
    // New config can change the prefix, the language-independent theme or the
    // switch entity, so nothing cached from the previous config may survive;
    // clearing the render inputs also makes the next hass render unconditionally.
    this._prefixStates = null;
    this._prefixConfig = null;
    this._prefixValue = null;
    this._machineEntryCached = false;
    this._machineEntryStates = null;
    this._machineEntryMachine = undefined;
    this._machineEntryValue = null;
    this._renderInputs = null;
    this._contrastKey = null;
    // Re-resolve the switch entity from the machine-scoped storage key now
    // that `machine` (if any) is known — the constructor ran before
    // setConfig() and could not tell whether this card is machine-scoped.
    this._switchEntity = this._readSwitchEntity();
  }

  // The app's own stored per-machine theme (#701), read from hass state by
  // the shared machine lookup; null when nothing valid is synced.
  _appMachineTheme(): ThemeStops | null {
    return appMachineTheme(this._machineEntry());
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
    setLang(resolveLang(hass));
    // A detached card gets one last hass push when its view goes away; it must
    // not use it to arm a poll disconnectedCallback has already cleaned up.
    if (this.isConnected && !this._ordersPoll) this._startOrdersPoll();
    this._loadBeansInfo();
    // HA pushes on every state change of ANY entity, so rendering unconditionally
    // repainted this card many times a second for changes it never shows. HA
    // replaces a state object only when that entity changes, so comparing object
    // identity tells whether this push touches anything the last render read.
    if (this._needsRender()) this._render();
  }

  // Every id the card can read: everything under the resolved prefix, the
  // machine-status entities the app-level machine lookups scan, and the
  // configured switch. Kept sorted-free because hass.states key order is stable
  // until an entity is added or removed, which the length/key check catches.
  _watchedIds(prefix: string): string[] {
    // The card reads the same machine slug in several domains (sensor.,
    // binary_sensor., select.), so match on the object id after the domain.
    const dot = prefix.indexOf('.');
    const base = dot === -1 ? prefix : prefix.slice(dot + 1);
    const ids = this._stateKeys().filter(id => {
      const d = id.indexOf('.');
      return (d === -1 ? id : id.slice(d + 1)).startsWith(base) || id.endsWith('_machine_status');
    });
    if (this._switchEntity && !ids.includes(this._switchEntity)) ids.push(this._switchEntity);
    return ids;
  }

  // What a render depends on, as cheaply comparable plain values plus the
  // identity of every state object it read.
  _renderInputsFor(): RenderInputs {
    const states = this._hass!.states;
    const prefix = this._resolvePrefix();
    const ids = this._watchedIds(prefix);
    return {
      prefix,
      language: resolveLang(this._hass),
      theme: this._themeKey(),
      ids,
      states: ids.map(id => states[id]),
      minute: Math.floor(Date.now() / 60000),
    };
  }

  // True when this hass push changed something the card shows: an entity of its
  // own changed object, an entity appeared or disappeared under the prefix, the
  // prefix/language/theme changed, or the minute rolled over (the ETA countdown
  // and the relative timestamps are derived from Date.now()). The minute costs
  // at most one extra render per minute and only when a push arrives at all; no
  // timer is involved. The first push after setConfig always renders
  // (`_renderInputs` is cleared there).
  _needsRender(): boolean {
    // Without a config _render() cannot paint at all, and no snapshot exists to
    // compare against (HA calls setConfig() before the first hass push).
    if (!this._config) return false;
    const prev = this._renderInputs;
    if (!prev) return true;
    const next = this._renderInputsFor();
    if (prev.prefix !== next.prefix || prev.language !== next.language || prev.theme !== next.theme) return true;
    if (prev.minute !== next.minute) return true;
    if (prev.ids.length !== next.ids.length) return true;
    for (let i = 0; i < next.ids.length; i++) {
      if (prev.ids[i] !== next.ids[i] || prev.states[i] !== next.states[i]) return true;
    }
    return false;
  }

  // The theme inputs the colour-contrast pass reads: HA's selected theme and
  // dark mode, plus the accent pair _applyMachineTheme() wrote to the host.
  _themeKey(): string {
    const themes = this._hass?.themes;
    const t = this._resolveMachineTheme();
    return [
      themes?.selectedTheme ?? themes?.theme ?? '',
      themes?.darkMode === true ? 'dark' : 'light',
      t ? `${t.a}:${t.b}` : '',
    ].join('|');
  }

  // ── Bean metadata (via the integration REST proxy, app >= 1.96) ───────────
  async _loadBeansInfo(): Promise<void> {
    if (!this._hass?.fetchWithAuth) return;
    if (this._beansInfoUnavailable) return;                       // proxy/app too old — feature off
    if (this._beansInfoAt && Date.now() - this._beansInfoAt < 300000) return;
    this._beansInfoAt = Date.now();
    try {
      const r = await this._hass.fetchWithAuth('/api/glp/library/beans-info');
      // Only a 404 means the feature is really gone (proxy/app too old). A
      // 502/503 during an app restart is transient: keep the feature on and
      // retry after the cache window instead of hiding bean info until the
      // page is reloaded.
      if (r.status === 404) { this._beansInfoUnavailable = true; return; }
      if (!r.ok) return;
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

  // hass.states' key list, cached per states object: HA builds a new states map
  // on every push, so identity is enough to invalidate it.
  _stateKeys(): string[] {
    const states = this._hass!.states;
    if (this._stateKeysStates !== states || !this._stateKeysCache) {
      this._stateKeysStates = states;
      this._stateKeysCache = Object.keys(states);
    }
    return this._stateKeysCache!;
  }

  // machine (#50): optional config option naming/slugging a specific
  // machine, for setups with more than one GLP machine device (see the app's
  // multi-machine mode, GLP #317, and glp-integration #47's forthcoming
  // per-machine devices). When set, matches a *_machine_status entity whose
  // friendly_name or entity_id references it, before falling back to the
  // existing "first Gaggiuino-named entity, else any" heuristic — so cards
  // without this option (the vast majority today, single-machine setups)
  // behave exactly as before.
  //
  // Scanned on every _s() call (~25 per render), so the result is remembered
  // alongside the states object and config it was computed from; setConfig()
  // clears it. The states map only needs re-scanning when an entity is added or
  // removed, which HA signals by building a new map.
  _resolvePrefix(): string {
    if (this._config.entity_prefix) return this._config.entity_prefix;
    const states = this._hass!.states;
    if (this._prefixStates === states && this._prefixConfig === this._config && this._prefixValue !== null) {
      return this._prefixValue;
    }
    const candidates = this._stateKeys().filter(id => id.endsWith('_machine_status'));
    let prefix: string | null = null;
    if (this._config?.machine) {
      const matched = matchMachineStatusEntity(this._hass!, candidates, this._config.machine);
      if (matched) prefix = matched.replace(/machine_status$/, '');
    }
    if (prefix === null) {
      const found = candidates.find(id =>
        (this._hass!.states[id]?.attributes?.friendly_name as string)?.toLowerCase().includes('gaggiuino'));
      const chosen = found || candidates[0];
      prefix = chosen ? chosen.replace(/machine_status$/, '') : 'sensor.gaggiuino_local_profiler_';
    }
    this._prefixStates = states;
    this._prefixConfig = this._config;
    this._prefixValue = prefix;
    return prefix;
  }

  // The app's machines[] entry, cached like _resolvePrefix(): appMachineEntry()
  // rescans every *_machine_status key on each call, and the render asks for it
  // three times (theme, machine type, header icon).
  _machineEntry(): MachineEntry | null | undefined {
    const states = this._hass?.states ?? null;
    if (this._machineEntryCached && this._machineEntryStates === states &&
        this._machineEntryMachine === this._config?.machine) {
      return this._machineEntryValue;
    }
    this._machineEntryCached = true;
    this._machineEntryStates = states;
    this._machineEntryMachine = this._config?.machine;
    this._machineEntryValue = appMachineEntry(this._hass, this._config?.machine);
    return this._machineEntryValue;
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

  // A card configured for one machine never adopts the unscoped global key:
  // every card on the dashboard shares it, so it may hold another machine's
  // switch and toggling it would power the wrong machine. Cards without
  // `machine` keep reading the global key as before.
  _readSwitchEntity(): string | null {
    const scoped = localStorage.getItem(this._switchStorageKey());
    if (scoped) return scoped;
    if (this._config?.machine) return null;
    return localStorage.getItem('glp_switch_entity') || null;
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

  // One date format for the maintenance sheet: the sensor's `last_date`
  // attribute is ISO in current app versions, but older data used a local
  // DD.MM.YYYY string, and anything unparsable is shown as it arrived rather
  // than silently dropped.
  _maintLastDate(raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return '—';
    let d: Date | null = null;
    if (typeof raw === 'number') {
      d = parseTs(raw);
    } else if (typeof raw === 'string') {
      const text = raw.trim();
      const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/.exec(text);
      if (m) {
        const y = m[3]!.length === 2 ? 2000 + parseInt(m[3]!, 10) : parseInt(m[3]!, 10);
        d = new Date(y, parseInt(m[2]!, 10) - 1, parseInt(m[1]!, 10));
      } else {
        d = parseTs(text);
      }
    }
    if (!d || isNaN(d.getTime())) return typeof raw === 'string' ? raw : '—';
    return d.toLocaleDateString(this._locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Opens the shared sheet for one maintenance task: the same last-done date,
  // counters and status pill the row shows, plus the two actions. The sensors
  // carry no interval, so the sheet does not claim one.
  _openMaintSheet(detail: MaintTaskDetail): void {
    this._forgetOrderSheet();
    const sheet = this._sheetFor();
    if (!sheet) return;
    const cls: 'ok' | 'soon' | 'due' | 'never' =
      detail.status === 'ok' || detail.status === 'soon' || detail.status === 'due'
        ? detail.status : 'never';
    const pills: Record<'ok' | 'soon' | 'due' | 'never', string> = {
      ok: T('pill_ok'), soon: T('pill_soon'), due: T('pill_due'), never: T('pill_never'),
    };
    const pillText = pills[cls];
    const pillIcon = cls === 'ok' ? 'check' : cls === 'due' ? 'warning' : null;
    const sub = [
      detail.daysSince != null
        ? (detail.daysSince === 0 ? T('maint_today') : T('days_ago', String(detail.daysSince)))
        : null,
      detail.shotsSince != null && detail.shotsSince > 0 ? T('maint_shots', String(detail.shotsSince)) : null,
    ].filter(Boolean).join(' · ');
    sheet.open({
      title: detail.name,
      body: () => html`
        <div class="maint-detail">
          <div class="maint-detail-row">
            <span class="maint-detail-lbl">${T('maint_last_done')}</span>
            <span class="maint-detail-val">${this._maintLastDate(detail.lastDate)}</span>
          </div>
          ${sub ? html`<div class="maint-sub">${sub}</div>` : nothing}
          <span class="maint-pill ${cls}">${pillIcon ? unsafeHTML(ICONS.of(pillIcon)) : nothing}${pillText}</span>
        </div>`,
      actions: () => html`
        <button type="button" class="maint-sheet-done" data-maint-done=${detail.task} @click=${() => { this._maintDone(detail); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${T('maint_done_today')}</button>
        <button type="button" class="maint-sheet-cancel" data-maint-cancel="1" @click=${() => { this._sheet?.close(); }}>${T('sheet_cancel')}</button>`,
    });
  }

  // Exactly one maintenance_done call per confirmation; the shared helper adds
  // the failure toast and vibration, the success path toasts the task name.
  _maintDone(detail: MaintTaskDetail): void {
    this._callService('gaggiuino_profiler', 'maintenance_done', { task: detail.task }, () => {
      toast(this, T('toast_maint_done', detail.name));
      haptic(this, 'success');
    });
    this._sheet?.close();
  }

  _buildMaintHtml(): TemplateResult {
    // pill_ok/pill_due used to carry a ✓/⚠ glyph in the string itself; the
    // glyph now lives here as an icon next to the (glyph-free) translated
    // text, so translators aren't carrying markup in six languages (#120).
    const pills: Record<string, string> = { ok: T('pill_ok'), soon: T('pill_soon'), due: T('pill_due'), never: T('pill_never') };
    const pillIcon: Record<string, string> = { ok: 'check', due: 'warning' };
    const row = (icon: string, name: string, status: string | undefined, pct: string | undefined, daysSince: number | null | undefined, shotsSince: number | null | undefined, task: string | undefined, lastDate: string | null | undefined) => {
      const cls  = pills[status as string] ? status as string : 'never';
      const pctW = Math.max(0, Math.min(100, Math.round((parseFloat(pct as string) || 0) * 100)));
      const sub  = [
        daysSince != null ? (daysSince === 0 ? T('maint_today') : T('days_ago', daysSince as unknown as string)) : null,
        shotsSince != null && shotsSince > 0 ? T('maint_shots', shotsSince as unknown as string) : null,
      ].filter(Boolean).join(' · ');
      // A row with a task opens the confirmation sheet; a static grinder-status
      // row has no task and stays inert (#265).
      const open = () => {
        if (!task) return;
        this._openMaintSheet({
          task, name, status: cls,
          daysSince: daysSince ?? null, shotsSince: shotsSince ?? null,
          lastDate: lastDate ?? null,
        });
      };
      return html`<div class="maint-row" data-maint-task=${ifDefined(task || undefined)} role=${ifDefined(task ? 'button' : undefined)} tabindex=${ifDefined(task ? '0' : undefined)} @click=${open} @keydown=${(e: Event) => {
        if (!task) return;
        const key = (e as KeyboardEvent).key;
        if (key !== 'Enter' && key !== ' ') return;
        e.preventDefault();   // Space would scroll the page
        open();
      }}>
        <div class="maint-row-top">
          ${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of(icon))}
          <span class="maint-name">${name}</span>
          <span class="maint-pill ${cls}">${pillIcon[cls] ? unsafeHTML(ICONS.of(pillIcon[cls])) : nothing}${pills[status as string] || '—'}</span>
        </div>
        ${sub ? html`<div class="maint-sub">${sub}</div>` : nothing}
        <div class="maint-bar-bg"><div class="maint-bar ${cls}" style="width:${pctW}%"></div></div>
      </div>`;
    };
    const rows = GlpCard.MAINT_TASKS.map(([suffix, nameKey, icon, task]) => {
      const s = this._s(suffix);
      if (!s || s.state === 'unavailable' || s.state === 'unknown') return null;
      const a = s.attributes || {};
      return row(icon, T(nameKey), s.state, a.pct as string, a.days_since as number | null | undefined, a.shots_since as number | null | undefined, task, a.last_date as string | null | undefined);
    }).filter(Boolean);
    const gAttrs = this._s('maintenance_grinders')?.attributes || {};
    const gRows  = Object.entries(gAttrs)
      .filter(([, v]) => v && typeof v === 'object' && 'status' in v)
      .map(([name, v]) => row('gear', name, (v as GrinderEntry).status, (v as GrinderEntry).pct, (v as GrinderEntry).days_since, (v as GrinderEntry).shots_since, (v as GrinderEntry).task, (v as GrinderEntry).last_date));
    if (!rows.length && !gRows.length)
      return html`<div class="unavailable">${T('maint_none')}</div>`;
    return html`<div class="maint-list">
      ${rows}
      ${gRows.length ? html`<div class="maint-section-label">${T('maint_grinders')}</div>${gRows}` : nothing}
    </div>`;
  }

  // Picks the contrast-safe semantic colour variants and --glp-aline at
  // runtime from the host's resolved colours; see cards/shared/contrast.ts.
  // It appends probe spans and reads getComputedStyle ~10 times, forcing a
  // style recalculation, but the result only depends on the theme — so it only
  // re-runs when those inputs changed. cleared in setConfig/connectedCallback.
  _applySemanticColorContrast(): void {
    const key = this._themeKey();
    if (this._contrastKey === key) return;
    applySemanticColorContrast(this);
    this._contrastKey = key;
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
              title=${switchOff ? T('power_on') : T('power_off')}
              aria-label=${switchOff ? T('power_on') : T('power_off')}>
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
    const lmTileCandidates: (LmTile | null)[] = [
      temp !== null ? {
        val: temp, unit: '°',
        lbl: boilerOff ? T('lm_temp_off') : (targetTemp !== null ? T('lm_temp_target', targetTemp) : T('lm_temp')),
        entity: `${prefix}machine_temperature`,
        warm: !boilerOff && targetTemp !== null && parseFloat(temp) < parseFloat(targetTemp) - 1,
      } : null,
      livePressure !== null ? { val: livePressure, unit: ' bar', lbl: T('lm_pressure'), entity: `${prefix}machine_live_pressure` } : null,
      liveWeight   !== null ? { val: liveWeight,   unit: ' g',   lbl: T('lm_weight'),   entity: `${prefix}machine_live_weight` } : null,
    ];
    const lmTiles = lmTileCandidates.filter((t): t is LmTile => t !== null);

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
    const machineType = appMachineType(this._machineEntry());
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
        </div></ha-card>${this._sheetSlotHtml()}`;
  }

  _tabBarHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { maintAvailable, ordersTabAvail, showMaint, showOrders, pendingOrders } = vm;
    return (maintAvailable || ordersTabAvail) ? html`
      <div class="tab-bar">
        <button class="tab-btn${(!showMaint && !showOrders) ? ' active':''}" data-tab="shot" @click=${() => { this._selectTab('shot'); }}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${T('tab_shot')}</button>
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
          tsLine = html`<div class="nav-ts">${d.toLocaleDateString(this._locale(),{day:'2-digit',month:'2-digit',year:'2-digit'})} ${d.toLocaleTimeString(this._locale(),{hour:'2-digit',minute:'2-digit'})}</div>`;
      }
      navHtml = html`
        <div class="nav-row">
          <button class="nav-arrow" data-nav="next" ?disabled=${nextDis} aria-label=${T('nav_next')} @click=${(e: Event) => { if ((e.currentTarget as HTMLButtonElement).hasAttribute('disabled')) return; this._navShot('next'); }}>‹</button>
          <div class="nav-dots">${dots}</div>
          <button class="nav-arrow" data-nav="prev" ?disabled=${prevDis} aria-label=${T('nav_prev')} @click=${(e: Event) => { if ((e.currentTarget as HTMLButtonElement).hasAttribute('disabled')) return; this._navShot('prev'); }}>›</button>
        </div>${tsLine}`;
    }
    return navHtml;
  }

  _profilePickerHtml(vm: ViewModel): TemplateResult | typeof nothing {
    const { brewing, showMaint, profileAvailable, currentProfile, profileSwitching } = vm;
    return !brewing && !showMaint && profileAvailable ? html`
      <div class="profile-picker">
        <button class="profile-current-btn" data-action="toggle-profile" @click=${(e: Event) => { e.stopPropagation(); this._openProfileSheet(); }}>
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:1px">
            <span class="profile-label-small">${T('profile_label')}</span>
            <span class="profile-current-name">${currentProfile || '—'}${profileSwitching ? html`<span style="color:var(--amber);font-weight:500;font-size:var(--glp-fs-1)"> · ${T('profile_switching')}</span>` : nothing}</span>
          </div>
          <span class="profile-chevron">▾</span>
        </button>
      </div>` : nothing;
  }

  // The profile list lives in the shared sheet now (#265): one option per
  // profile with the active one marked, opened at the active option so a long
  // list starts where the user last touched it.
  _openProfileSheet(): void {
    const entityId = this._resolvePrefix().replace(/^sensor\./, 'select.') + 'profile';
    const entity = this._hass?.states[entityId];
    const options = (entity?.attributes?.options || null) as string[] | null;
    if (!Array.isArray(options) || !options.length) return;
    // The same optimistic rule the picker's own label follows, so the sheet
    // marks the profile the card is showing, not the one the machine has yet
    // to confirm.
    const current = this._pendingProfile || entity?.state || null;
    this._forgetOrderSheet();
    const sheet = this._sheetFor();
    if (!sheet) return;
    sheet.open({
      title: T('profile_label'),
      body: () => html`<div class="profile-sheet-list" role="listbox" aria-label=${T('profile_label')} @keydown=${(e: KeyboardEvent) => this._sheetOptionKeyNav(e)}>
        ${options.map(p => html`<button
          type="button"
          class="profile-sheet-opt${p === current ? ' active' : ''}"
          role="option"
          data-profile-opt=${p}
          aria-selected=${p === current ? 'true' : 'false'}
          @click=${() => { this._selectProfile(p); sheet.close(); }}>
          <span class="profile-sheet-name">${p}</span>
          ${p === current ? unsafeHTML(ICONS.of('check')) : nothing}
        </button>`)}
      </div>`,
    });
    // The sheet renders synchronously, so the options are in the DOM here.
    const slot = this._sheetSlot;
    const focused = slot?.querySelector<HTMLElement>('.profile-sheet-opt.active')
      ?? slot?.querySelector<HTMLElement>('.profile-sheet-opt');
    focused?.focus();
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
      ratio    ? { role: 'recipe',  num: `1:${ratio}`, unit: '',  label: T('m_ratio')     } : null,
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
          ${lmTiles.map(t => {
            // An aria-label replaces the button's text, so the value has to be
            // part of it or a screen reader never announces what the tile says.
            const label = `${t.lbl} ${t.val}${t.unit}`.replace(/\s+/g, ' ').trim();
            return html`
            <button type="button" class="lm-tile${t.warm ? ' warming' : ''}"
                    aria-label="${label} · ${T('lm_history')}"
                    @click=${() => this._showHistory(t.entity)}>
              <div class="lm-val">${String(t.val)}<span class="lm-unit">${t.unit}</span></div>
              <div class="lm-lbl">${t.lbl}</div>
            </button>`;
          })}
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
        ${waterLevel !== null
          ? html`<button type="button" class="footer-item footer-history"
                        aria-label="${waterLevel}% · ${T('lm_history')}"
                        @click=${() => this._showHistory(`${vm.prefix}machine_water_level`)}>${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('droplet'))} ${waterLevel}%</button>`
          : html`<span></span>`}
        <span class="footer-item">
          ${syncTime ? syncTime : nothing}
          ${glpUrl ? html`${syncTime ? ' · ' : ''}<a href=${glpUrl} target="_blank" rel="noopener noreferrer">GLP ↗</a>` : nothing}
        </span>
      </div>`;
  }

  _render(): void {
    if (!this._hass || !this._config) return;
    // Also set here (not only in the hass setter) so a card rendered straight
    // from a hass object — a preview, a test — uses that object's language.
    setLang(resolveLang(this._hass));

    const vm = this._viewModel();
    const machineType = appMachineType(this._machineEntry());

    // ── machine off ──────────────────────────────────────────────────────────
    if (vm.machineOff) {
      // The profile picker and the maintenance tab do not exist in this view,
      // so a sheet they opened has nothing left to act on. Orders are listed
      // here too, so an order sheet stays: _syncOrderSheet() re-mounts it on
      // the slot this render just built.
      if (this._orderSheetId == null) this._sheet?.close();
      render(this._machineOffHtml(vm), this.shadowRoot!);
      this._syncOrderSheet();
      this._applyMachineTheme();
      this._applySemanticColorContrast();
      this._startReadyByTicker();
      this._renderInputs = this._renderInputsFor();
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
            if (this._sheet?.isOpen) return;
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

      </div></ha-card>${this._sheetSlotHtml()}`, this.shadowRoot!);
    // An order sheet survives the machine-off view and back, both of which
    // replace the slot it is mounted in.
    this._syncOrderSheet();
    this._applyMachineTheme();
    this._applySemanticColorContrast();
    this._startUptimeTicker();
    // Remembered from what this render actually read, so the next hass push can
    // compare object identity instead of repainting blindly.
    this._renderInputs = this._renderInputsFor();
  }

  getCardSize(): number { return 3; }
  // An empty config lets _resolvePrefix() find the machine from the entities
  // Home Assistant already has, so a card added from the picker works without
  // hand-editing YAML.
  static getStubConfig() { return {}; }
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
  documentationURL: 'https://github.com/mxkissnr/glp-integration/blob/main/DOCS.md#shot-card',
});

console.info(
  `%c GLP-CARD %c v${GLP_CARD_VERSION} `,
  'background:#ff3b30;color:#fff;padding:2px 4px;border-radius:3px 0 0 3px',
  'background:#111113;color:#ff3b30;padding:2px 4px;border-radius:0 3px 3px 0'
);

export { GlpCard, esc, safeUrl, metricLineHtml };
