# Changelog

## [1.21.0] – 2026-07-26
### Removed
- **Removed one-click install (`update.install`) from the `update.gaggiuino_profiler_update` entity — it now shows installed/latest version only, no "Install" button.** This entity's `async_install()` called the app's `POST /api/update`, which (as of gaggiuino-local-profiler#514/#515/#516) required the add-on to hold the Supervisor `manager` role — a substantial permission grant (covers `/backups*`, `/core/*`, `/host/*`, `/os/*`, `/supervisor/*`, not just `/addons/*`) for functionality that duplicated something Home Assistant already provides natively: every Supervisor add-on gets its own update entity (`update.<slug>_glp_update`) that installs through the Supervisor's own path and needs no elevated role at all — that entity is unaffected by this change and keeps working exactly as before (including `auto_update: true`, if configured). Plain-Docker installs (no Supervisor) lose nothing functionally either — `async_install` there always hit the app's `/api/update`, which always returned 503 outside HA, so it never actually worked for them. `custom_components/gaggiuino_profiler/update.py`, `tests/test_update.py` (new, 6 tests). Closes #54, see gaggiuino-local-profiler#516.

## [1.20.0] – 2026-07-13
### Added
- **One HA device per additional machine (#48)** — completes the multi-machine follow-up from #47 (coordinator-level `machines[]` exposure, v1.19.0). Each non-default machine from `coordinator.data["machines"]` now gets its own HA device (`identifiers={(DOMAIN, f"{entry_id}_{machine_id}")}`, linked via `via_device` to the default machine's device) with `{entry_id}_{machine_id}_{key}` unique_ids — a "Status" sensor and a "Reachable" binary_sensor. **The default machine is completely unchanged**: same `{entry_id}_{key}` unique_ids, same device, zero dashboard breakage — verified by a dedicated regression test. New machines added later via the app's Settings UI (#319) get their entity added at runtime on the next coordinator refresh, no HA restart or config-entry reload needed. Services `maintenance_done`/`backup` gained an optional `machine` field (registry id), forwarded as a `?machine=<id>` query parameter.
  **Scope note (a real constraint, not a shortcut):** additional-machine entities are intentionally *not* a full mirror of the default machine's sensor set (shot count, last-shot fields, maintenance status, live temperature/pressure/flow). Those all come from app endpoints (`/shots.json`, `/api/maintenance`, `/api/machine/status`) that aren't machine-scoped as of app v2.0.0 — they only ever describe the default machine. Mirroring them onto a second device would silently show one machine's data labeled as another's, which is actively misleading, not just incomplete, so this round only surfaces what's genuinely available per machine today (name/type/enabled/reachable/on, from the `machines[]` registry array itself). Same reasoning applies to the two service fields: the app doesn't read `?machine=` on `/api/maintenance/*/done` or `/api/backup` yet, so they're accepted here (forward-compatible, harmless no-op) but have no effect until the app adds that support. `custom_components/gaggiuino_profiler/sensor.py`, `binary_sensor.py`, `__init__.py`, `machine_coordinator.py`, `services.yaml`, `tests/test_multi_machine_devices.py` (new, 8 tests). Closes #48

## [1.19.0] – 2026-07-13
### Added
- **Multi-machine registry awareness (first step of #47).** GLP app v2.0.0 added an additive `machines[]` array to `GET /api/status` (the multi-machine registry — see the app's own changelog). `GlpDataCoordinator` now parses and exposes it as `coordinator.data["machines"]`, and the existing `machine_status` sensor surfaces it as a `machines` attribute (list of `{id, name, type, isDefault, enabled, reachable, on}`), giving automations/dashboards visibility into configured machines without waiting for a full per-machine device rollout. Defaults to `[]` against an app instance running an older version with no `machines` key at all — fully backward compatible. **Scope note:** this round is coordinator-level exposure only; one HA device per machine (separate entities/devices for additional machines, with the default machine keeping its existing unique_ids) is a follow-up round, not built yet. `custom_components/gaggiuino_profiler/coordinator.py`, `custom_components/gaggiuino_profiler/sensor.py`, `tests/test_multi_machine.py` (new, 4 tests). Closes #47

## [1.18.0] – 2026-07-12
### Added
- **`gaggiuino_profiler.backup` service.** Calls the add-on's existing `GET /api/backup` endpoint (full JSON bundle: shots, annotations, coffee library, blocklist, trash) and writes the result to `<config>/glp_backups/glp-backup-<timestamp>.json`, so a scheduled automation (or one run before an add-on update) can create a backup without manual intervention. File I/O runs via `hass.async_add_executor_job` to keep it off the event loop. Fires `gaggiuino_profiler_backup_created` with `{path, shots}` on success so other automations (e.g. mobile notify) can react. No `restore` service in this round — restore is destructive and not currently needed; noted as a backlog item on the issue. `custom_components/gaggiuino_profiler/__init__.py`, `services.yaml`, `tests/test_backup_service.py` (new). Closes #46

## [1.17.1] – 2026-07-12
### Fixed
- **Profile select entity didn't update when the profile was changed directly on the machine.** `GlpProfileSelect` (`select.py`) extends `CoordinatorEntity[GlpDataCoordinator]` (the slow 60s data coordinator), but its `current_option` reads live data from the machine coordinator (5s) — `CoordinatorEntity` only pushes a state update in reaction to the coordinator it's *subscribed* to, so the underlying value was fresh but nothing told Home Assistant to re-read it except the 60s cycle. Other machine-derived sensors (e.g. the preheat countdown) update in real time because `GlpMachineSensor` correctly subscribes to the machine coordinator directly — the select entity didn't. Fixed by also subscribing to the machine coordinator's update signal in `async_added_to_hass`. `custom_components/gaggiuino_profiler/select.py`, `tests/test_select.py` (new). Closes #44

## [1.17.0] – 2026-07-10
### Added
- Test suite (`tests/`, `pytest-homeassistant-custom-component`) covering `config_flow.py` URL/host validation, `coordinator.py`'s `_is_trusted_host()` Supervisor-token guard, and the orders proxy admin-check (`GlpOrdersSubView` POST/DELETE reject non-admins, GET stays open) — the integration had zero automated tests before. Wired as a `pytest` job in `.github/workflows/validate.yml` alongside the existing HACS/hassfest validation. Closes #40
- **DE/IT/FR/ES/NL translations for the config flow.** The integration's setup/options dialogs were English-only (`translations/en.json`); added the 5 missing translation files matching its structure, so the config flow now follows Home Assistant's configured language like the rest of the GLP ecosystem. `custom_components/gaggiuino_profiler/translations/{de,it,fr,es,nl}.json` (new). Closes #43

## [1.16.2] – 2026-07-06
### Fixed
- **Update entity always showed "Unknown"** — the coordinator's `/api/version` fetch never sent the `X-GLP-Token` header (unlike every other authenticated call), so the app rejected it with 401 and `installed_version`/`latest_version` stayed empty. Pre-existing since the Update entity was introduced (v1.15.0, #38), not a recent regression. Fixed by passing `headers=self._headers` like the other calls.

## [1.16.1] – 2026-07-06
### Fixed — Security audit
- `GlpOrdersSubView` (orders proxy) now requires HA admin for POST/DELETE (menu management, accept/decline, history cleanup) — previously any authenticated HA user, including the customer-facing Order Card, could trigger destructive actions like `DELETE /api/glp/orders/history`. GET stays open for everyone.
- The Supervisor token is no longer sent to an arbitrary configured GLP URL — `coordinator.py` now only attaches it when the host is recognized as local/LAN (`_is_trusted_host`), since `config_flow` only validates the URL scheme, not the host.

## [1.16.0] – 2026-07-05
### Added
- `GET /api/glp/library/beans-info` proxy — read-only bean metadata (origin, variety, process, roast date, decaf) for the shot card's bean enrichment. Deliberately a fixed path with GET only, no wildcard, to keep the library surface exposed through HA minimal; closes #39

## [1.15.0] – 2026-06-24
- feat: native HA `UpdateEntity` — GLP now appears in HA Settings → Updates alongside HACS and Supervisor updates; shows installed vs. latest version and supports one-click install via `update.install` service; triggers GLP's `/api/update` endpoint which uses the HA Supervisor to restart the add-on; closes #38

## [1.14.1] – 2026-06-17
### Added
- `GET /api/glp/orders` proxy (list orders) — the root orders proxy previously only accepted POST; GET is required so the GLP Lovelace card can list/manage orders (barista actions). Query string is forwarded; closes #38

## [1.14.0] – 2026-06-17
### Added
- `recent_shots[]` now include the **grinder** and **grind** (grind setting) from the shot annotation, so the GLP Lovelace card can show the last grind setting + grinder at a glance

## [1.13.1] – 2026-06-17
### Changed
- The shot **score** is now read from the app (single source of truth, served per shot by GLP App v1.83.0+) instead of being re-implemented in Python — removes the duplicated scoring logic; `recent_shots[].score` now mirrors the app exactly. Requires GLP App v1.83.0+ for the score (gracefully `null` on older versions)

## [1.13.0] – 2026-06-17
### Added
- Each `recent_shots` entry now includes a **`score`** (0–100) — a port of the GLP app's shot score (weighted pressure, temperature stability, duration, brew ratio and channeling) computed from the full shot data; lets the Lovelace card show the shot score; closes #36

## [1.12.0] – 2026-06-17
### Added
- `recent_shots[].dp` now includes a downsampled **flow** curve (`f`, from `pumpFlow`) alongside pressure/temp/weight, so the Lovelace card can render a richer app-style shot chart with a flow line; closes #35

## [1.11.0] – 2026-06-17
### Added
- New service **`gaggiuino_profiler.maintenance_done`** (field `task`) — marks a maintenance task as completed by POSTing to the app's `/api/maintenance/{task}/done` and refreshing; lets the GLP Lovelace card mark maintenance done from the dashboard; closes #34
- `grinder_maintenance_details` entries now include the `task` id (`grinder_<id>`) so the card can mark per-grinder cleaning done

## [1.10.7] – 2026-06-17
### Changed
- Use Home Assistant "app" terminology instead of "add-on" in the config-flow UI strings (`strings.json` / `translations/en.json`) and user-facing docs; closes #33

## [1.10.6] – 2026-06-17
### Added
- In-repo brand assets (`custom_components/gaggiuino_profiler/brand/icon.png` + `icon@2x.png`) so the HACS validation brands check passes (8/8) before the integration is listed in the `home-assistant/brands` repository; closes #32

## [1.10.5] – 2026-06-17
### Fixed
- hassfest validation errors that block HACS default submission: `http` was added to `manifest.json` `dependencies` (the integration registers `HomeAssistantView` proxy endpoints), and the example URL was removed from the config-flow user-step description in `strings.json` and `translations/en.json` (hassfest forbids URLs in translation strings); closes #31

## [1.10.4] – 2026-06-17
### Added
- HACS validation workflow (`.github/workflows/validate.yml`) running the official `hacs/action` (`category: integration`) and Home Assistant `hassfest` on push, PR, daily schedule and manual dispatch — required for submission to the HACS default repository; closes #30
- Validation status badge in README
### Changed
- `manifest.json` keys reordered to hassfest convention (`domain`/`name` first, rest alphabetical) and `integration_type: "hub"` added
### Fixed
- `select/select_option` (profile switching from Lovelace card) failed with the old URL (e.g. `homeassistant.local:8099`) even after reconfiguring via Options — `GlpProfileSelect.__init__` read `entry.data["url"]` directly instead of checking `entry.options` first; fixed to use `entry.options.get("url") or entry.data["url"]`; closes #29

## [1.10.2] – 2026-06-16
### Fixed
- `drink_type` in `recent_shots` contained the raw internal drink ID (e.g. `m_1779888566035`) — the coordinator now fetches `GET /api/menu` on each update cycle and resolves the ID to a human-readable display name (emoji + name, e.g. `☕ Espresso`); gracefully falls back to `null` when the menu is unavailable or the ID is not found; closes #28

## [1.10.1] – 2026-06-16
### Added
- `drink_type` field added to each entry in the `recent_shots` attribute on `sensor.*_machine_status` — sourced from `annotation.drinkType`; `null` when not annotated; allows the GLP Lovelace Card to display the prepared drink type alongside profile and coffee name; closes #27

## [1.10.0] – 2026-06-16
### Fixed
- Coordinator now sends `Authorization: Bearer {SUPERVISOR_TOKEN}` when fetching the GLP API token from `/api/token` — the add-on verifies this via `http://supervisor/info`, granting access to HA-internal callers regardless of source IP. This fixes persistent 401 errors on `/shots.json` when the HA core's aiohttp session arrives at the add-on from a non-private IP due to Docker NAT. A warning is now logged when `/api/token` returns a non-200 status, making debugging easier.

## [1.9.9] – 2026-06-16
### Added
- Supervisor API port discovery: when adding the integration on HA OS / Supervised, the setup flow queries `GET http://supervisor/addons/gaggiuino_local_profiler/info` with the `SUPERVISOR_TOKEN` to read the actual host port from the app's network mapping — so if the user changed the port in the app config, the correct port is used automatically; falls back to `localhost:8099` if Supervisor is unavailable (HA Core / Docker); closes #26

## [1.9.8] – 2026-06-16
### Fixed
- Options flow saved URL to `entry.options` but `__init__.py` always read from `entry.data["url"]` — URL changes via *Configure* were silently ignored and the old URL kept being used after reload; fixed by reading `entry.options.get("url") or entry.data["url"]` in setup and showing the correct current URL in the options form
### Added
- Auto-discovery on setup: the integration now silently probes `http://localhost:8099/api/status` when first adding it — if the GLP app is running on the same HA instance the entry is created immediately with no URL input needed; falls back to the manual URL form if auto-discovery fails; closes #26

## [1.9.7] – 2026-06-16
### Fixed
- Default setup URL changed from `http://homeassistant.local:8099` to `http://localhost:8099` — mDNS resolution of `homeassistant.local` fails intermittently from within the HA core container on HA OS, causing the coordinator to report `UpdateFailed` and all sensors to go unavailable; `localhost:8099` is always reachable because HA OS runs the core container in host-network mode; existing installs must be reconfigured manually (Settings → Integrations → GLP Integration → Configure); closes #25

## [1.9.6] – 2026-05-29
### Fixed
- Coordinator no longer reads `apiToken` from `/api/status` (removed in GLP add-on v1.72.0 security fix); now fetches the token once via `/api/token` on first poll — reachable from the HA Supervisor network without prior authentication; closes #23

## [1.9.5] – 2026-05-27
### Fixed
- Each `recent_shots` entry now includes a `dp` field with downsampled pressure (`p`), temperature (`t`) and weight (`w`) curves (max 40 points per series, ×10 integers) so the Lovelace card can render a shot chart for every historical shot without additional API calls; closes #22

## [1.9.4] – 2026-05-27
### Added
- `sensor.*_machine_status` now exposes a `recent_shots` attribute — a compact list of the last 10 shots (id, ts, profile, coffee, duration, yield_g, ratio, pressure, rating) for use by the Lovelace card's shot-navigation feature
- `binary_sensor.*_brewing` now exposes `profile_name`, `seq`, and `datapoints` attributes during an active shot; `datapoints` contains the live pressure / temperature / weight / flow arrays (same ×10 integer format as stored shots) so the card can render an inline SVG chart updating every 2 s; closes #20

## [1.9.3] – 2026-05-27
### Fixed
- Maintenance sensor `extra_state_attributes` used snake_case keys (`days_since`, `shots_since`, `last_date`) but the add-on returns camelCase (`daysSince`, `shotsSince`, `lastDate`); all three attributes were always `None` in HA; fixed to match the actual JSON keys; closes #19
- `last_shot_score` sensor always returned `None` — score is calculated client-side only; renamed to `last_shot_rating` (reads `annotation.rating`, 1–5 stars); `sensor.*_last_shot_rating` replaces `sensor.*_last_shot_score`; closes #19
- Shot-completed event: field renamed from `score` to `rating` to match the sensor rename

## [1.9.2] – 2026-05-27
### Fixed
- Removed duplicate temperature sensors: `machine_live_temperature` and `machine_target_temperature_live` duplicated the existing `machine_temperature` / `machine_target_temperature` from the main coordinator; closes #18
- Removed `brew_switch` binary sensor — identical in practice to the existing `brewing` sensor; `steam_switch` kept as it has no equivalent; closes #18

## [1.9.1] – 2026-05-27
### Fixed
- Profile select `current_option` now reads from the machine coordinator (5 s refresh) instead of the main coordinator (60 s); profile changes made on the machine itself are reflected in HA within 5 s instead of up to 60 s; closes #17

## [1.9.0] – 2026-05-27
### Added
- **Profile selector** (`select.gaggiuino_profiler_profile`) — reads available profiles and current selection from the Gaggiuino machine via the GLP add-on proxy (`GET /api/machine/profiles`); writing a new profile calls `POST /api/machine/profile/set`; no dependency on ALERTua/hass-gaggiuino required; closes #16
- **Machine live coordinator** (`GlpMachineCoordinator`) — polls `/api/machine/status` every 5 s for real-time machine data
- **Machine live sensors**: `Machine Live Temperature`, `Machine Target Temperature Live`, `Machine Live Pressure`, `Machine Water Level`, `Machine Live Weight`, `Machine Uptime`, `Machine Active Profile`
- **Machine binary sensors**: `Brew Switch` (physical brew switch state), `Steam Switch` (physical steam switch state)
- `select` platform added to `PLATFORMS`

## [1.8.2] – 2026-05-26
### Security
- Proxy functions now forward the authenticated HA user ID as `X-GLP-HA-User-ID` header — the add-on (v1.54.0+) prefers this header over the client-supplied body field to prevent customer impersonation in the orders system; closes #15

## [1.8.1] – 2026-05-26
### Fixed
- `GlpOrdersSubView` now proxies `DELETE` requests — required for per-entry history deletion and "clear all history" from the GLP Order Card; closes #14

## [1.8.0] – 2026-05-26
### Added
- `machine_temperature` and `machine_target_temperature` sensors — read from `/api/preheat` (`temp` and `targetTemp` fields); device class `temperature`, unit °C, state class `measurement`; requires GLP add-on v1.51.0+; closes #12

## [1.7.0] – 2026-05-26
### Added
- REST API proxy views at `/api/glp/orders/*` and `/api/glp/shots/*` — the integration now registers three `HomeAssistantView` endpoints that forward requests to the GLP add-on using the coordinator's URL and API token; allows the GLP Order Card to access the orders API via `hass.fetchWithAuth` without requiring a Supervisor ingress session; closes #13

## [1.6.0] – 2026-05-25
### Added
- New `Maintenance Grinders` sensor — aggregates all grinder cleaning entries from GLP v1.40.0 into a single worst-status sensor; per-grinder status, days_since, shots_since, last_date, and pct are exposed as state attributes keyed by grinder name; closes #10

## [1.5.1] – 2026-05-25
### Changed
- API token is now fully automatic — fetched from GLP `/api/status` on every coordinator update, no user input required; `api_token` config field removed; closes #9

## [1.5.0] – 2026-05-25
### Added
- Optional API token support: new `api_token` field in setup and options flow; if set, all requests to GLP include the `X-GLP-Token` header; closes #8

## [1.4.2] – 2026-05-24
### Fixed
- Security: config flow now rejects non-http/https URLs before attempting a connection, preventing SSRF via schemes like `file://` or custom internal addresses; applies to both initial setup and options reconfigure

## [1.4.1] – 2026-05-24
### Added
- `machine_status` sensor now exposes `switch_entity` as a state attribute (sourced from GLP `/api/status`), allowing the Lovelace card to auto-detect the smart plug without manual config; closes #6

## [1.4.0] – 2026-05-24
### Added
- Preheat sensors: `binary_sensor.…preheat_ready`, `sensor.…preheat_elapsed` (s), `sensor.…preheat_remaining` (s) — sourced from GLP `/api/preheat`; gracefully unavailable on older GLP versions; closes #5

## [1.3.0] – 2026-05-23
### Added
- 5 maintenance sensors (Descaling, Backflush, Group Head, Gaskets, Water Filter) — state is `ok / soon / due / never`, attributes: `days_since`, `shots_since`, `last_date`, `pct`; data sourced from GLP `/api/maintenance`; gracefully unavailable on older GLP versions; closes #4

## [1.2.1] – 2026-05-23
### Fixed
- Default URL changed from `http://localhost:8099` to `http://homeassistant.local:8099` — localhost doesn't resolve from HA core to the add-on container; closes #3
- Shot timestamps now parsed correctly — GLP uses Unix seconds; previous code divided by 1000 (assumed ms), causing all shot dates to appear as 1970; closes #3

## [1.2.0] – 2026-05-23
### Added
- `shots_today` sensor — counts how many shots were pulled today (HA-configured timezone); closes #2

## [1.1.0] – 2026-05-22
### Added
- `is_brewing` binary sensor via fast (2 s) polling of `/api/live/data`
- `gaggiuino_profiler_shot_completed` HA event fired on every new shot with full shot data
- Options flow: URL and poll interval configurable after setup (Settings → Integration → Configure)
- Diagnostics support for HA bug reports

### Fixed
- `last_shot_date` and `last_sync` now parsed as proper `datetime` objects (previously strings caused TIMESTAMP device class to show "unknown")

## [1.0.0] – 2026-05-22
### Added
- Initial release
- 14 sensor entities from GLP `/api/status` and `/shots.json`
- Config flow with connection validation
- HACS manifest and logo
