// Built as an IIFE by esbuild (see `npm run build`), so top-level declarations
// never leak into the page scope this card shares with glp-card.js as a second
// classic <script src> — a same-named top-level const in both files would throw
// on the second load (glp-integration#157, #114).
//
// Rendering uses Lit templates (render() patches the existing DOM in place).
// The Lit runtime is bundled into this IIFE by esbuild — never loaded as a
// shared module — so the two GLP cards keep fully separate scopes
// (glp-lovelace-card#141).

import { render, html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { STYLES } from './styles.ts';
import { _esc, _originHtml, _safeUrl, THEME_PRESETS, _validHex } from './helpers.ts';
import { MACHINE_ICON_MINI, ICONS, _menuIconHtml } from './icons.ts';
import { applySemanticColorContrast } from '../../shared/contrast.ts';
import { appMachineEntry, appMachineTheme, appMachineType, matchMachineStatusEntity } from '../../shared/machine.ts';
import { STRINGS, _s } from './i18n.ts';
import type { TemplateResult } from 'lit';
import type {
  Hass, CardConfig, MenuItem, Bean, Order, Shot, QueueEta,
  ThemeStops, GroupedVariants, ShotSeries,
} from './types.ts';

const GLP_ORDER_CARD_VERSION = '1.22.0';

// Menu items younger than this show the NEW badge (config: new_badge_days)
const NEW_BADGE_DAYS_DEFAULT = 7;

// Per-instance-unique suffix for this card's machine-icon gradient ids — a
// dashboard can render more than one glp-order-card, and SVG gradient ids
// are global to the document once in the DOM, so a fixed id would let one
// instance's gradient silently apply to another's icon.
let _glpOrderCardInstanceSeq = 0;

class GlpOrderCard extends HTMLElement {
  // Instance state. `declare` keeps these type-only, so a field initializer
  // can never change the emitted ES2022 output (#143).
  declare _config: CardConfig | null;
  declare _token: string | null;
  declare _menu: MenuItem[] | null;
  declare _enabled: boolean;
  declare _selected: string | null;
  declare _selectedVariant: string | null;
  declare _selectedBeanId: number | null;
  declare _activeBeans: Bean[] | null;
  declare _activeOrder: Order | null;
  declare _dismissedOrderId: string | null;
  declare _lastShot: Shot | null;
  declare _pollTimer: ReturnType<typeof setTimeout> | null;
  declare _submitting: boolean;
  declare _orderError: string | null;
  declare _queueEta: QueueEta | null;
  declare _hassRenderTimer: ReturnType<typeof setTimeout> | null;
  declare _lang: string;
  declare _instanceId: number;
  declare _hass: Hass | null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._token     = null;
    this._menu      = null;
    this._enabled   = true;
    this._selected  = null;
    this._selectedVariant = null;
    this._selectedBeanId  = null;
    this._activeBeans = null;
    this._activeOrder = null;
    this._dismissedOrderId = null;
    this._lastShot  = null;
    this._pollTimer = null;
    this._submitting = false;
    this._orderError = null;
    this._queueEta        = null;
    this._hassRenderTimer = null;
    this._lang = this._normalizeLang(navigator.language);
    this._instanceId = ++_glpOrderCardInstanceSeq;
  }

  // First two letters, lower case, falling back to English for a language this
  // card has no strings for.
  _normalizeLang(code: string | null | undefined): string {
    const lang = String(code || '').slice(0, 2).toLowerCase();
    return STRINGS[lang] ? lang : 'en';
  }

  setConfig(config: CardConfig): void {
    this._config = {
      title: null, switch_entity: null, glp_token: null, machine: null,
      theme: null, accent_color: null, accent_gradient: null, ...config,
    };
    // Allow explicit token override in YAML for direct-URL mode
    if (config.glp_token) this._token = String(config.glp_token);
  }

  // The app's own stored per-machine theme (#701), read from hass state by
  // the shared machine lookup; null when nothing valid is synced.
  _appMachineTheme(): ThemeStops | null {
    return appMachineTheme(appMachineEntry(this._hass, this._config?.machine));
  }

  // Machine colour theme (#62): resolves this card's effective accent theme
  // to concrete {a,b} hex stops, or null if nothing valid is
  // configured/synced. The app's own stored theme (#701, _appMachineTheme())
  // takes precedence over this card's YAML config, matching the precedence
  // already promised above. YAML precedence among itself: accent_gradient >
  // accent_color > theme preset, mirroring gaggiuino-local-profiler's
  // resolveTheme() (a custom override wins over a preset). Hex values are
  // strictly validated (#rrggbb only) since they reach a style attribute/SVG
  // gradient stop.
  _resolveTheme(): ThemeStops | null {
    const fromApp = this._appMachineTheme();
    if (fromApp) return fromApp;
    const cfg = this._config;
    if (!cfg) return null;
    if (Array.isArray(cfg.accent_gradient) && cfg.accent_gradient.length === 2) {
      const [a, b] = cfg.accent_gradient as [string, string];
      if (_validHex(a) && _validHex(b)) return { a, b };
    }
    if (_validHex(cfg.accent_color)) return { a: cfg.accent_color as string, b: cfg.accent_color as string };
    if (typeof cfg.theme === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, cfg.theme)) {
      return THEME_PRESETS[cfg.theme as keyof typeof THEME_PRESETS];
    }
    return null;
  }

  // Applies the resolved theme (or the unthemed default) as inline
  // --glp-accent-start/--glp-accent-end host styles. Always sets both
  // explicitly (never a no-op) so a config change from themed back to
  // unthemed can't leave a stale inline value — the unthemed branch just
  // re-states the same var(--primary-color, #f59e0b) expression the
  // GLP-TOKENS stylesheet default already uses, so behavior is identical to
  // never having set it. Called every _render(); cheap and idempotent.
  _applyThemeVars() {
    const theme = this._resolveTheme();
    this.style.setProperty('--glp-accent-start', theme ? theme.a : 'var(--primary-color, #f59e0b)');
    this.style.setProperty('--glp-accent-end', theme ? theme.b : 'var(--primary-color, #f59e0b)');
  }

  // Small colour-themed machine icon badge (#62) — sizeClass is 'header' or
  // 'status' (see the .machine-glyph CSS rules), idSuffix keeps this
  // instance's two usages (header + status line, which can render
  // simultaneously) from sharing one SVG gradient id.
  _machineGlyphHtml(sizeClass: string, idSuffix: string): string {
    const id = `glp-oc-icon-${this._instanceId}-${idSuffix}`;
    return `<div class="machine-glyph ${sizeClass}">${MACHINE_ICON_MINI(id, appMachineType(appMachineEntry(this._hass, this._config?.machine)))}</div>`;
  }

  _getBase(): string | null {
    const url = this._config?.glp_url;
    if (url) {
      // _safeUrl() returns the re-serialized u.href, which for a bare origin
      // (no path) always carries a trailing slash — strip it back off so
      // callers appending `/${path}` don't end up with a double slash.
      const safe = _safeUrl(url);
      return safe ? safe.replace(/\/$/, '') : null;
    }
    // Auto-detect: card runs inside HA browser, use ingress path (no token needed)
    return window.location.origin + '/api/hassio_ingress/gaggiuino_local_profiler';
  }

  // machine (#29): optional config option for setups with more than one GLP
  // machine (the app's multi-machine mode, GLP #317). Ingress stays bound to
  // the one app instance regardless (see README — a documented limitation,
  // not a bug: there's still only one add-on), but `_getSwitchEntity()`
  // resolution and the order payload's `machine` field use it to target the
  // right machine's switch/queue display. Falls back to the previous "first
  // *_machine_status entity" behavior when unset, so existing single-machine
  // cards are unaffected.
  _findMachineStatusEntity(): string | null {
    if (!this._hass) return null;
    const candidates = Object.keys(this._hass.states).filter(id => id.endsWith('_machine_status'));
    if (this._config?.machine) {
      const matched = matchMachineStatusEntity(this._hass, candidates, this._config.machine);
      if (matched) return matched;
    }
    const found = candidates.find(id =>
      (this._hass!.states[id]?.attributes?.friendly_name as string)?.toLowerCase().includes('gaggiuino'));
    return found || candidates[0] || null;
  }

  _getSwitchEntity(): string | null {
    if (this._config?.switch_entity) return this._config.switch_entity;
    const found = this._findMachineStatusEntity();
    return found ? ((this._hass!.states[found]?.attributes?.switch_entity as string | undefined) || null) : null;
  }

  set hass(hass: Hass) {
    const firstHass = !this._hass;
    this._hass = hass;
    this._lang = this._normalizeLang(hass?.language);
    if (firstHass && this._menu === null) {
      this._load();
    } else {
      // Debounce hass-triggered renders: HA pushes updates very frequently
      // (entity state ticks, etc.) — 1 s is fast enough for machine on/off changes.
      // render() patches the existing DOM, so a deferred update can no longer
      // wipe an in-progress interaction; this only limits work.
      clearTimeout(this._hassRenderTimer as ReturnType<typeof setTimeout>);
      this._hassRenderTimer = setTimeout(() => this._render(), 1000);
    }
  }

  connectedCallback() { this._startPoll(); }
  disconnectedCallback() { this._stopPoll(); }

  _startPoll() {
    this._stopPoll();
    this._load();
    this._schedulePoll();
  }
  _schedulePoll() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    const hasActive = this._activeOrder?.status === 'pending' || this._activeOrder?.status === 'accepted';
    const timer = setTimeout(async () => {
      await this._loadStatus();
      // _stopPoll() nulls the timer while _loadStatus() is in flight (the card
      // was disconnected mid-poll); don't re-arm a timer for a detached card.
      if (this.isConnected && this._pollTimer === timer) this._schedulePoll();
    }, hasActive ? 3000 : 10000);
    this._pollTimer = timer;
  }
  _stopPoll() {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
  }

  _useIngress() { return !this._config?.glp_url; }

  async _ensureToken(): Promise<string | null> {
    if (this._useIngress()) return null; // ingress bypasses token check
    if (this._token) return this._token;
    // /api/token is only served to Supervisor-originating requests or already-
    // authenticated callers. In direct-URL mode the card is browser-originated
    // (LAN IP) so this call will return 401. Users must set glp_token in YAML.
    try {
      const d = await fetch(`${this._getBase()}/api/token`).then(r => r.ok ? r.json() : {}) as { apiToken?: string };
      this._token = d.apiToken || null;
    } catch { /* 401 in direct-URL mode is expected; falls back to configured glp_token */ }
    return this._token;
  }

  async _fetch(path: string, opts: RequestInit = {}): Promise<Response> {
    // In zero-config mode route through the HA integration REST proxy (/api/glp/*)
    // which the integration registers as a standard HA HTTP view, authenticated via
    // Bearer token — no Supervisor ingress session cookie required.
    if (this._useIngress() && this._hass?.fetchWithAuth) {
      const proxyPath = '/api/glp/' + path.replace(/^api\//, '');
      return this._hass!.fetchWithAuth!(proxyPath, opts);
    }
    const url = `${this._getBase()}/${path}`;
    const token = await this._ensureToken();
    if (token) opts = { ...opts, headers: { ...(opts.headers as Record<string, string>), 'X-GLP-Token': token } };
    return fetch(url, opts);
  }

  async _load(): Promise<void> {
    try {
      const [menuRes, settingsRes, queueRes] = await Promise.all([
        this._fetch('api/orders/menu'),
        this._fetch('api/orders/settings'),
        this._fetch('api/orders/queue-eta').catch(() => null),
      ]);
      if (queueRes?.ok) this._queueEta = await queueRes.json().catch(() => null) as QueueEta | null;
      if (menuRes.status === 404 && settingsRes.status === 404) {
        // Feature disabled at add-on level
        this._menu    = [];
        this._enabled = false;
      } else if (menuRes.ok && settingsRes.ok) {
        const menu     = await menuRes.json() as MenuItem[];
        const settings = await settingsRes.json() as { enabled?: boolean };
        this._menu    = Array.isArray(menu) ? menu : [];
        this._enabled = settings?.enabled !== false;
        // Fetch active beans if any menu item uses the bean library as variants
        if (this._menu!.some(m => m.useBeans)) {
          try {
            const br = await this._fetch('api/orders/active-beans');
            this._activeBeans = br.ok ? await br.json() as Bean[] : [];
          } catch { this._activeBeans = []; }
        }
      }
      // else: other non-ok (401, 500 …) — leave _menu = null so _loadStatus retries
    } catch { /* network error — keep this._menu = null so _loadStatus retries */ }
    await this._loadStatus(true);
    this._render();
  }

  async _loadStatus(fromLoad = false): Promise<void> {
    // If initial _load() failed (menu still null), retry the full load instead of just status
    if (!fromLoad && this._menu === null) {
      await this._load();
      return;
    }
    if (!this._hass) return;
    const haUser = this._hass.user;
    if (!haUser) return;
    // Re-check enabled/paused state on every periodic poll so barista toggle changes
    // are picked up within 10 s without requiring a page reload
    if (!fromLoad) {
      try {
        const sr = await this._fetch('api/orders/settings');
        if (sr.ok) this._enabled = (await sr.json() as { enabled?: boolean } | null)?.enabled !== false;
      } catch { /* transient poll failure, keep last known enabled state */ }
    }
    try {
      const res = await this._fetch(`api/orders/mine?haUserId=${encodeURIComponent(haUser.id)}`);
      if (!res.ok) throw new Error('orders/mine failed');
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error('orders/mine returned a non-array body');
      const orders = body as Order[];
      const active = orders.find(o => ['pending','accepted'].includes(o.status));
      const recent = !active ? orders.find(o => ['done','declined'].includes(o.status) && o.id !== this._dismissedOrderId && (Date.now() - (o.completedAt||0)) < 120000) : null;
      this._activeOrder = active || recent || null;
      if (this._activeOrder?.status === 'done') {
        // Without a shotId there is nothing this customer's order can point
        // at; api/shots/last would show whoever pulled the last shot.
        const shotId = this._activeOrder.shotId;
        if (!shotId) {
          this._lastShot = null;
        } else if (!this._lastShot) {
          try {
            const shotRes = await this._fetch(`api/shots/${encodeURIComponent(shotId)}`);
            this._lastShot = shotRes.ok ? await shotRes.json() as Shot : null;
          } catch { this._lastShot = null; }
        }
      } else {
        this._lastShot = null;
      }
    } catch {
      // Transient failure: keep the order and shot already on screen instead
      // of falling back to the menu and inviting a duplicate order.
    }
    this._render();
  }

  // Companion entity convention from the GaggiMate setup: the machine-status
  // sensor `sensor.<prefix>machine_status` comes with a
  // `binary_sensor.<prefix>machine_standby` that glp-lovelace-card's
  // _isMachineOff() treats as off. A missing entity keeps the old behaviour.
  _standbyEntity(): string | null {
    const status = this._findMachineStatusEntity();
    if (!status) return null;
    return status
      .replace(/^sensor\./, 'binary_sensor.')
      .replace(/_machine_status$/, '_machine_standby');
  }

  _machineOff(): boolean {
    if (!this._hass) return false;
    const standby = this._standbyEntity();
    if (standby && this._hass.states[standby]?.state === 'on') return true;
    const entity = this._getSwitchEntity();
    if (!entity) return false;
    const s = this._hass.states[entity];
    return s?.state === 'off' || s?.state === 'unavailable';
  }

  // Picks the contrast-safe semantic colour variants and --glp-aline at
  // runtime from the host's resolved colours; see cards/shared/contrast.ts.
  _applySemanticColorContrast(): void {
    applySemanticColorContrast(this);
  }

  _render(): void {
    if (!this._config) return;
    const lang  = this._lang;
    const title = this._config.title || _s('title', lang);
    const off   = this._machineOff();

    let body: TemplateResult | typeof nothing;
    if (off) {
      body = html`<div class="machine-off">${_s('off', lang)}</div>`;
    } else if (!this._enabled) {
      body = html`<div class="machine-off">${_s('paused', lang)}</div>`;
    } else if (this._activeOrder) {
      body = this._renderStatus(this._activeOrder, lang);
    } else if (this._menu === null) {
      body = html`<div class="loading">${_s('loading', lang)}</div>`;
    } else {
      body = this._renderOrderForm(lang);
    }

    this._applyThemeVars();
    render(html`
      <style>${STYLES}</style>
      <ha-card>
        <div class="card">
          <div class="header">
            ${/* _machineGlyphHtml() returns fixed SVG markup, no user input */ unsafeHTML(this._machineGlyphHtml('header', 'hdr'))}
            ${title}
          </div>
          ${body}
        </div>
      </ha-card>`, this.shadowRoot!);

    this._applySemanticColorContrast();
  }

  _renderOrderForm(lang: string): TemplateResult {
    if (!this._menu || this._menu.length === 0) {
      return html`<div class="loading">${_s('no_menu', lang)}</div>`;
    }

    // Hide useBeans items when no active beans are in stock
    const visibleMenu = this._menu.filter(m =>
      !m.useBeans || (Array.isArray(this._activeBeans) && this._activeBeans.length > 0)
    );
    if (visibleMenu.length === 0) {
      return html`<div class="loading">${_s('no_menu', lang)}</div>`;
    }

    const newThreshold = (parseFloat(this._config?.new_badge_days as string) || NEW_BADGE_DAYS_DEFAULT) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const renderItem = (m: MenuItem) => {
      const isNew      = m.createdAt && (now - m.createdAt) < newThreshold;
      const newBadge   = isNew ? html`<span class="menu-badge menu-badge-new">NEW</span>` : nothing;
      const trendBadge = m.trending
        ? html`<span class="menu-badge menu-badge-trend">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('heat'))}</span>`
        : nothing;
      return html`<button type="button" class="menu-item${this._selected === m.name ? ' selected' : ''}" data-item=${m.name} @click=${() => this._selectItem(m.name)}>
        <div class="menu-item-icon">${/* _menuIconHtml() returns a fixed icon or an escaped emoji */ unsafeHTML(_menuIconHtml(m))}</div>
        <div class="menu-item-name">${m.name}${trendBadge}${newBadge}</div>
      </button>`;
    };

    const trending = visibleMenu.filter(m => m.trending);
    const regular  = visibleMenu.filter(m => !m.trending);

    const trendSection = trending.length ? html`
      <p class="menu-section-title">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('heat'))} ${_s('trending_title', lang)}</p>
      <div class="menu-grid">${trending.map(renderItem)}</div>` : nothing;
    const regularSection = regular.length ? html`
      ${trending.length ? html`<p class="menu-section-title" style="margin-top:var(--glp-sp-3)">${_s('menu_all', lang)}</p>` : nothing}
      <div class="menu-grid">${regular.map(renderItem)}</div>` : nothing;

    const selectedItem = visibleMenu.find(m => m.name === this._selected);
    const variants = this._getVariants(selectedItem);
    const needsVariant = variants.length > 0 && !this._selectedVariant;
    const groupedVariants = this._getVariantsGrouped(selectedItem);
    const variantSection = (this._selected && variants.length > 0) ? html`
      <p class="variant-label">${_s('variant_label', lang)}</p>
      <div id="oc-variants" class=${groupedVariants.flat ? 'variant-grid' : ''}>
        ${this._variantInnerHtml(groupedVariants, lang)}
      </div>` : nothing;
    const beanInfoSection = this._beanInfoHtml(this._getSelectedBean()!, lang);
    const itemLabel = (this._selected && this._selectedVariant)
      ? `${this._selected} · ${this._selectedVariant}`
      : this._selected || null;
    const btnLabel = itemLabel ? _s('order_btn', lang, itemLabel)
      : needsVariant ? _s('variant_select', lang)
      : _s('order_btn_select', lang);
    return html`
      <div class="order-form">
        ${trendSection}${regularSection}
        ${variantSection}${beanInfoSection}
        <input class="note-input" id="oc-note" placeholder=${_s('note_ph', lang)} maxlength="200">
        <button class="order-btn" id="oc-submit" ?disabled=${!this._selected || this._submitting || needsVariant} @click=${() => this._placeOrder()}>
          ${itemLabel ? html`${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ` : nothing}${btnLabel}
        </button>
        ${this._orderError ? html`<div class="order-error" role="alert">${this._orderError}</div>` : nothing}
      </div>`;
  }

  _shotChart(shot: Shot, lang: string = 'en'): string {
    const dp = shot?.datapoints;
    if (!dp) return '';

    // Series colors: the GLP-series palette (glp-card.js's buildShotChart(),
    // kept in sync via GLP-TOKENS' --glp-series-* fallback values).
    const series: ShotSeries[] = [
      { key: 'pressure',    scale: 10, axis: 'left',  color: 'var(--glp-series-pres, #0072b2)',   label: _s('chart_pressure', lang) },
      { key: 'temperature', scale: 10, axis: 'right', color: 'var(--glp-series-temp, #c0392b)',   label: 'Temp' },
      { key: 'weightFlow',  scale: 10, axis: 'left',  color: 'var(--glp-series-flow, #c77000)',   label: 'Flow' },
      { key: 'shotWeight',  scale: 10, axis: 'right', color: 'var(--glp-series-weight, #009e73)', label: _s('chart_weight', lang) },
    ].map(s => ({ ...s, vals: Array.isArray(dp[s.key]) ? (dp[s.key] as number[]).map(v => v / s.scale) : [] }))
     .filter(s => s.vals.length >= 4);

    if (!series.length) return '';

    const W = 300, H = 72, pad = 2;
    const len = Math.max(...series.map(s => s.vals.length));

    // Shared axis scales, not each series independently normalized to its own
    // min/max (that made the curves' relative shapes meaningless — a nearly
    // flat temperature line looked as dramatic as a swinging pressure line).
    // Mirrors glp-card.js's buildShotChart(): pressure+flow share a fixed
    // 0–12 bar "left" axis, temperature+weight share a dynamic "right" axis
    // (floor 110) — same two-axis grouping, just without the drawn axis
    // labels this compact summary chart doesn't have room for.
    const PMAX = 12;
    const tempVals = series.find(s => s.key === 'temperature')?.vals || [];
    const rMax = Math.max(110, Math.ceil(((tempVals.length ? Math.max(...tempVals) : 0) + 5) / 10) * 10);
    const maxFor = (axis: string) => axis === 'left' ? PMAX : rMax;

    const polyline = (s: ShotSeries) => {
      const max = maxFor(s.axis);
      const pts = s.vals.map((v, i) => {
        const x = pad + (i / (len - 1)) * (W - pad * 2);
        const y = H - pad - (Math.max(0, Math.min(max, v)) / max) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
    };

    const svg = `<svg class="shot-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${series.map(s => polyline(s)).join('')}
    </svg>`;

    const legend = `<div class="shot-chart-legend">
      ${series.map(s => `<div class="shot-chart-legend-item">
        <div class="shot-chart-legend-dot" style="background:${s.color}"></div>${s.label}
      </div>`).join('')}
    </div>`;

    return svg + legend;
  }

  _renderShotSummary(shot: Shot | null | undefined, lang: string): TemplateResult | typeof nothing {
    if (!shot) return nothing;
    const profile  = shot.profile?.name || shot.profileName || '–';
    const dur      = shot.duration ? `${(shot.duration / 10).toFixed(0)} s` : null;
    const wtArr    = shot.datapoints?.shotWeight || shot.datapoints?.weight;
    const yield_g  = Array.isArray(wtArr) && wtArr.length ? `${(wtArr[wtArr.length - 1]! / 10).toFixed(1)} g` : null;
    const meta     = [dur, yield_g].filter(Boolean).join(' · ');
    const chart    = this._shotChart(shot, lang);
    return html`<div class="shot-summary">
      <div class="shot-summary-profile">${profile}</div>
      ${meta ? html`<div class="shot-summary-meta">${meta}</div>` : nothing}
      ${/* _shotChart() builds SVG from numeric datapoints and fixed labels only */ chart ? unsafeHTML(chart) : nothing}
    </div>`;
  }

  _renderStatus(order: Order, lang: string): TemplateResult {
    const itemLabel = order.variant ? `${order.item} · ${order.variant}` : order.item;
    // Multi-machine (#29): only shown when the order actually carries a
    // machine name — orders placed before this feature, or on a
    // single-machine setup that never sets `machine` in config, render
    // exactly as before.
    const machineLine = order.machine
      ? html`<div class="status-line status-machine">${/* _machineGlyphHtml() returns fixed SVG markup, no user input */ unsafeHTML(this._machineGlyphHtml('status', 'stat'))}${order.machine}</div>`
      : nothing;

    let content: TemplateResult | typeof nothing = nothing;
    if (order.status === 'pending') {
      const qp = this._queueEta?.positions?.[order.id];
      const queueLine = qp
        ? html`<div class="status-line">${_s('queue_pos', lang, qp.position as unknown as string, qp.suggestedEta as unknown as string)}</div>`
        : nothing;
      content = html`<div class="status-card pending">
        <div class="status-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('hourglass'))} ${_s('pending', lang, itemLabel)}</div>
        ${machineLine}
        ${queueLine}
      </div>`;
    } else if (order.status === 'accepted') {
      const etaDone   = order.acceptedAt + order.eta * 60000;
      const minsLeft  = Math.max(0, Math.ceil((etaDone - Date.now()) / 60000));
      content = html`<div class="status-card accepted">
        <div class="status-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('coffee'))} ${_s('accepted', lang, itemLabel, minsLeft as unknown as string)}</div>
        ${machineLine}
        <div class="status-eta">${minsLeft === 0 ? html`${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('celebrate'))} ${_s('almost_ready', this._lang)}` : `~${minsLeft} min`}</div>
      </div>`;
    } else if (order.status === 'done') {
      const shotHtml = this._renderShotSummary(this._lastShot, lang);
      content = html`<div class="status-card done">
        <div class="status-done-msg">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('check'))} ${_s('done', lang, itemLabel)}</div>
      </div>${shotHtml}`;
    } else if (order.status === 'declined') {
      content = html`<div class="status-card declined">
        <div class="status-item">${/* ICONS.of() emits fixed SVG markup */ unsafeHTML(ICONS.of('close'))} ${_s('declined', lang, itemLabel)}</div>
        ${order.declineReason ? html`<div class="status-decline">${_s('decline_reason', lang, order.declineReason)}</div>` : nothing}
      </div>`;
    }

    return html`${content}<button class="new-order-btn" id="oc-new-order" @click=${() => this._newOrder()}>${_s('new_order', lang)}</button>`;
  }

  // Menu item selection: toggles this._selected, resets the variant, and
  // re-renders. With Lit the DOM is patched in place, so no click-guard is
  // needed to survive a concurrent hass update.
  _selectItem(name: string): void {
    const prev = this._selected;
    this._selected = this._selected === name ? null : name;
    if (this._selected !== prev) { this._selectedVariant = null; this._selectedBeanId = null; }
    this._orderError = null;
    this._render();
  }

  _selectVariant(variant: string, beanId: number | null): void {
    const wasSelected = this._selectedVariant === variant;
    this._selectedVariant = wasSelected ? null : variant;
    this._selectedBeanId  = wasSelected ? null : (beanId != null ? Number(beanId) : null);
    this._orderError = null;
    this._render();
  }

  _newOrder(): void {
    this._dismissedOrderId = this._activeOrder?.id ?? null;
    this._activeOrder     = null;
    this._selected        = null;
    this._selectedVariant = null;
    this._selectedBeanId  = null;
    this._orderError      = null;
    this._render();
  }

  _getVariants(item: MenuItem | undefined): string[] {
    if (!item) return [];
    if (item.useBeans) return (this._activeBeans || []).map(b => b.decaf ? `${b.name} · Decaf` : b.name);
    return Array.isArray(item.variants)
      ? item.variants.filter((v): v is string => typeof v === 'string')
      : [];
  }

  // Second, orthogonal grouping axis on top of _getVariants() (#36): non-bean
  // items (plain item.variants string arrays) have no category concept, so
  // they stay flat/ungrouped exactly as before. Bean-backed items split into
  // speciality/normal sections using the app's `category` field (added in
  // gaggiuino-local-profiler#505) — untagged/missing beans default to 'normal'.
  _getVariantsGrouped(item: MenuItem | undefined): GroupedVariants {
    if (!item?.useBeans) return { flat: this._getVariants(item) };
    const label = (b: Bean): string => b.decaf ? `${b.name} · Decaf` : b.name;
    const beans = this._activeBeans || [];
    return {
      speciality: beans.filter(b => b.category === 'speciality').map(label),
      normal:     beans.filter(b => b.category !== 'speciality').map(label),
    };
  }

  // Bean-backed variant chips carry the bean's stable id (#35) alongside the
  // display label, so selection can be tracked and submitted by id — the
  // label alone is ambiguous whenever a bean gets deleted and reimported
  // under the same name (same bug class as gaggiuino-local-profiler#456).
  _beanIdForLabel(v: string): number | null {
    const bean = (this._activeBeans || []).find(b => (b.decaf ? `${b.name} · Decaf` : b.name) === v);
    return bean?.id ?? null;
  }

  _variantChipHtml(v: string): TemplateResult {
    const beanId = this._beanIdForLabel(v);
    return html`<button type="button" class="variant-chip${this._selectedVariant === v ? ' selected' : ''}" data-variant=${v} data-bean-id=${ifDefined(beanId ?? undefined)} @click=${() => this._selectVariant(v, beanId)}>${v}</button>`;
  }

  // Mirrors the trending/regular section pattern (~line 650): headings shown
  // only when both groups are non-empty — a single-group list (e.g. all beans
  // untagged) renders as one plain grid, no noisy "Normal" label.
  _variantInnerHtml(grouped: GroupedVariants, lang: string): TemplateResult {
    if (grouped.flat) return html`${grouped.flat.map(v => this._variantChipHtml(v))}`;
    const { speciality, normal } = grouped as { speciality: string[]; normal: string[] };
    const showHeadings = speciality.length > 0 && normal.length > 0;
    const specialitySection = speciality.length ? html`
      ${showHeadings ? html`<p class="menu-section-title">${_s('variant_speciality', lang)}</p>` : nothing}
      <div class="variant-grid">${speciality.map(v => this._variantChipHtml(v))}</div>` : nothing;
    const normalSection = normal.length ? html`
      ${showHeadings ? html`<p class="menu-section-title" style="margin-top:var(--glp-sp-3)">${_s('variant_normal', lang)}</p>` : nothing}
      <div class="variant-grid">${normal.map(v => this._variantChipHtml(v))}</div>` : nothing;
    return html`${specialitySection}${normalSection}`;
  }

  // Id-first with a name fallback (#35), mirroring resolveBeanForAnnotation()
  // in gaggiuino-local-profiler (lib/services/LibraryService.js, #456): the
  // id is trusted exclusively when it resolves; the label match only covers
  // the case where it doesn't (bean removed from _activeBeans mid-session).
  _getSelectedBean(): Bean | null {
    const selectedItem = this._menu?.find(m => m.name === this._selected);
    if (!selectedItem?.useBeans || !this._selectedVariant) return null;
    const beans = this._activeBeans || [];
    if (this._selectedBeanId != null) {
      const byId = beans.find(b => b.id === this._selectedBeanId);
      if (byId) return byId;
    }
    return beans.find(b => (b.decaf ? `${b.name} · Decaf` : b.name) === this._selectedVariant) || null;
  }

  _beanInfoHtml(bean: Bean, lang: string): TemplateResult | typeof nothing {
    const origins = Array.isArray(bean?.origins) && bean.origins.length
      ? bean.origins
      : (bean?.origin ? [{ code: bean.origin }] : []);
    if (!bean || (!bean.notes && !origins.length && !bean.variety && !bean.process)) return nothing;
    const rows: TemplateResult[] = [];
    if (bean.notes)      rows.push(html`<div class="bean-info-notes">${bean.notes}</div>`);
    if (origins.length)  rows.push(html`<div class="bean-info-row"><span class="bean-info-label">${_s('bean_origin', lang)}</span><span>${/* _originHtml() escapes its own input */ unsafeHTML(_originHtml(origins, lang))}</span></div>`);
    if (bean.variety) rows.push(html`<div class="bean-info-row"><span class="bean-info-label">${_s('bean_variety', lang)}</span><span>${bean.variety}</span></div>`);
    if (bean.process) rows.push(html`<div class="bean-info-row"><span class="bean-info-label">${_s('bean_process', lang)}</span><span>${bean.process}</span></div>`);
    return html`<div class="bean-info" id="oc-bean-info">${rows}</div>`;
  }

  async _placeOrder(): Promise<void> {
    if (!this._selected || this._submitting) return;
    const noteEl = this.shadowRoot!.getElementById('oc-note') as HTMLInputElement | null;
    const note   = noteEl?.value?.trim() || '';
    const haUser = this._hass?.user;
    if (!haUser) return;

    this._submitting = true;
    this._render();

    try {
      const res = await this._fetch('api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item:     this._selected,
          variant:  this._selectedVariant || undefined,
          // Stable id alongside the name (#35): lets the app resolve
          // order->bean attribution id-first, surviving a bean delete +
          // reimport under the same name — see _getSelectedBean() above.
          beanId:   this._getSelectedBean()?.id ?? undefined,
          note,
          customer: haUser.name,
          haUserId: haUser.id,
          machine:  this._config?.machine || undefined,
        }),
      });
      const order = res.ok ? await res.json() as Order : null;

      if (order?.id) {
        this._activeOrder = order;
        this._orderError  = null;
        this._selected    = null;
        this._selectedVariant = null;
        this._selectedBeanId  = null;
      } else {
        // Keep the selection so the customer can retry without re-picking.
        this._orderError = _s('order_failed', this._lang);
      }
    } catch {
      this._orderError = _s('order_failed', this._lang);
    }
    this._submitting = false;
    this._render();
  }

  getCardSize(): number { return 3; }

  static getStubConfig()    { return {}; }
}

// Deferred until HA's scoped-registry polyfill has replaced customElements. #145
const define = () => customElements.get('glp-order-card') || customElements.define('glp-order-card', GlpOrderCard);
if (customElements.get('home-assistant')) define();
else customElements.whenDefined('home-assistant').then(define);

window.customCards = window.customCards || [];
window.customCards!.push({
  type:        'glp-order-card',
  name:        'GLP Order Card',
  description: 'Customer-facing order card for Gaggiuino Local Profiler',
  preview:     false,
  documentationURL: 'https://github.com/mxkissnr/glp-order-card',
});

console.info(`%c GLP-ORDER-CARD %c v${GLP_ORDER_CARD_VERSION} `, 'background:#ff9f0a;color:#000;padding:2px 4px;border-radius:3px 0 0 3px', 'background:#111113;color:#ff9f0a;padding:2px 4px;border-radius:0 3px 3px 0');

export { GlpOrderCard, _esc, _safeUrl, _originHtml, _menuIconHtml };
