# Changelog

## [Unreleased]

## [1.31.1] – 2026-08-20
### Fixed
- **The bundled Shot Card failed to register at all**, showing "Custom element doesn't exist: glp-card" in the card picker (Order Card registered fine). `glp-card.js` and `glp-order-card.js` are both loaded as classic `<script src>` tags in the same HA frontend document, and both declared identical top-level `const` names — classic scripts share that lexical scope, so whichever card's script loaded second threw `SyntaxError: Identifier already declared` and aborted before `customElements.define()` ran. Fixed at the source in both card repos (each file now wraps its content in an IIFE) and re-synced here: `www/glp-card.js` to glp-lovelace-card v2.20.2, `www/glp-order-card.js` to glp-order-card v1.21.2. Closes #159

## [1.31.0] – 2026-08-19
### Added
- **The GLP Order Card now ships inside this integration too, the same way the Shot Card already does.** `glp-order-card.js` is served from the existing `www/` static path and registered via `add_extra_js_url` alongside `glp-card.js` — add a card with `type: custom:glp-order-card` to your dashboard, no separate HACS install or manual resource config needed. `glp-order-card` gained its own `scripts/sync-to-integration.sh` (mirroring `glp-lovelace-card`'s) to copy the built card here on release. `custom_components/gaggiuino_profiler/__init__.py`, `custom_components/gaggiuino_profiler/www/glp-order-card.js` (new), `README.md`, `DOCS.md`, `DOCS.de.md`. Closes #152

### Changed
- **Synced both bundled cards to their latest releases** — `custom_components/gaggiuino_profiler/www/glp-card.js` to glp-lovelace-card v2.20.1, `custom_components/gaggiuino_profiler/www/glp-order-card.js` to glp-order-card v1.21.1. Syncing the bundled copies and releasing this repo again is an explicit release step for every glp-lovelace-card/glp-order-card release (see each card's own `scripts/sync-to-integration.sh` header comment) — the cache-busting version query param only changes on a real release here. No integration code changed.
- **Switched dependency updates from Dependabot to Renovate** (`renovate.json`), matching the same github-actions grouping as before (codeql-action's version-locked sub-actions, #141), plus automerge for green minor/patch updates (both `requirements_test.txt` — test tooling only, `manifest.json` declares zero runtime pip dependencies — and github-actions), immediate unscheduled security PRs, and semantic commits matching the existing convention. CI/tooling only, no runtime effect on the integration itself. Closes #153

### Fixed
- **GitHub-only CI workflows (CodeQL, dependency review, scorecard) no longer auto-run against the local Gitea mirror.** Gitea Actions picks up `.github/workflows` automatically, so registering the local runner would re-run all of them there too. Each now skips outside `github.com`; the `validate.yml` HACS/Hassfest/Pytest gate is unaffected and runs on both. Closes #146

## [1.30.1] – 2026-08-16
### Changed
- **Synced the bundled Shot Card to glp-lovelace-card v2.20.0** (the "Instrument" redesign: cool graphite tokens, typographic verdict, drawn icons, guided metric row) — `custom_components/gaggiuino_profiler/www/glp-card.js` was still on v2.19.0. Syncing the bundled copy and releasing this repo again is an explicit release step for every glp-lovelace-card release (see `glp-lovelace-card/scripts/sync-to-integration.sh`'s own header comment) — the cache-busting version query param only changes on a real release here. No integration code changed.

## [1.30.0] – 2026-08-11
### Changed
- **`GlpLiveCoordinator` (the `Brewing` binary sensor's data source) now consumes the app's `GET /api/events` SSE stream instead of only polling `GET /api/live/data` every 2s**, taking advantage of the app now pushing a `live-snapshot` event on every fresh sample from the machine (gaggiuino-local-profiler#708) instead of on a fixed 1s tick — HA no longer waits up to 2s behind the app's own UI. The 2s REST poll is kept as a fallback safety net: it's a no-op while a SSE event arrived within the last 5s, and only actually hits `/api/live/data` again once the stream looks stale (never connected, or dropped and hasn't reconnected yet). The SSE connection reconnects with capped exponential backoff on any drop (app restart, HA Ingress restart, network blip) and runs as a background task tied to the config entry's own lifecycle, so it's cancelled automatically on unload — no explicit teardown code needed. The other three coordinators (`GlpDataCoordinator`, `GlpMachineCoordinator`, `GlpSettingsCoordinator`) are unaffected and stay REST-polling. `live_coordinator.py`, `const.py`, `__init__.py`, `tests/test_live_coordinator.py`, `tests/test_live_coordinator_sse.py` (new). Closes #139

## [1.29.2] – 2026-08-10
### Fixed
- **The `machine_status` sensor — whose `online`/`error` state drives the status dot in both the Lovelace and Order cards — never updated on a pure physical-machine reachability change (power off/on), only on a change to the add-on's own sync-link health (`lastSyncError`), so the dashboard dot required a manual page reload to reflect the machine going offline/online.** `coordinator.py` now treats `machineReachable === false` as the strongest signal for `machine_status`, falling back to `lastSyncError` otherwise — mirroring the priority the app repo's own status dot (`public-src/components/status.js`) already uses since gaggiuino-local-profiler#655. That app-side fix was never mirrored here: `machine_status` had been deliberately decoupled from `machine_reachable` two days earlier by #106, a design choice that was correct at the time (`machine_reachable` was brand new, for two unrelated temperature sensors) but drifted stale once #655 changed what the dot itself was supposed to reflect. An add-on predating #106 (no `machineReachable` key in `GET /api/status`) is unaffected, still falls back to the old `lastSyncError`-only behavior. `machine_status`'s entity *availability* is untouched — still governed solely by the separate `requires_machine_reachable` mechanism used by the two live machine-value sensors. `coordinator.py`, `tests/test_machine_status_reachability.py` (new), `tests/test_machine_reachable_availability.py`. Closes gaggiuino-local-profiler#667

## [1.29.1] – 2026-08-09
### Changed
- **Synced the bundled Shot Card to glp-lovelace-card v2.19.0** (theme-sync from the app's Settings → Machines picker, gaggiuino-local-profiler#701) — `custom_components/gaggiuino_profiler/www/glp-card.js` was still on v2.18.0 despite that card release shipping. Syncing the bundled copy and releasing this repo again is an explicit release step for every glp-lovelace-card release (see `glp-lovelace-card/scripts/sync-to-integration.sh`'s own header comment) — the cache-busting version query param only changes on a real release here. No integration code changed. Closes #130

## [1.29.0] – 2026-08-09
### Added
- **A non-default machine's status sensor now exposes its `theme` as an entity attribute**, the same way it already exposes `type`/`enabled`/`reachable` (part of gaggiuino-local-profiler#701: syncing the Lovelace/Order cards' accent color to the app's own Settings → Machines theme picker). The default machine's `machine_status` sensor needed no change — it already forwards the entire `machines[]` array verbatim, which includes `theme` now that the app returns it (gaggiuino-local-profiler#701). Cards don't consume this yet — that's the remaining half of #701. `sensor.py`, `tests/test_additional_machine_theme_attribute.py` (new). Closes #128

## [1.28.0] – 2026-08-06
### Added
- **New `update.<default_machine>_firmware` entity — machine firmware update availability, straight in Home Assistant, with an install button** (#125, Phase 2 of gaggiuino-local-profiler#620). Reads `installed_version`/`latest_version`/`release_url` from the add-on's `GET /api/machine/firmware/version` (Phase 1 — compares the machine's installed commit-hash version against the latest matching GitHub release for its configured release channel). Supports `UpdateEntityFeature.INSTALL`: triggering it proxies to `POST /api/machine/firmware/update`, the same endpoint that already drives the machine's own OTA flow (#597/#599) — unlike the existing app-self-update entity (`GlpUpdateEntity`, deliberately install-less per #54/gaggiuino-local-profiler#516, which would have needed the add-on to hold the Supervisor "manager" role), this is a plain HTTP proxy to the physical machine with no Supervisor-role entanglement, so install is safe to support here. Deliberately does **not** declare `UpdateEntityFeature.PROGRESS`: the machine's own `/api/firmware/progress` response shape has never been exercised by any GLP frontend code, so its real field names are unverified — asserting an unconfirmed payload shape isn't how this repo's regression policy works. `async_install()` fires the OTA and requests a coordinator refresh; `installed_version` catches up once the machine reports its new firmware version on a later poll. On a non-Gaggiuino machine (e.g. GaggiMate, no `settingsProxy` support) the add-on's endpoint returns 501, which the coordinator already treats as "no data" — the entity goes unavailable the same way the other Gaggiuino-only entities do. `coordinator.py`, `update.py`, `tests/test_firmware_update.py` (new). Closes #125

## [1.27.2] – 2026-08-06
### Changed
- **Consolidated the 4 stuck Dependabot bumps to `requirements_test.txt` (#112–#115) into one change, plus bumped CI to Python 3.14.** `pytest-homeassistant-custom-component` (from 0.13.317) and `home-assistant-frontend` (from 20260225.0) now require Python >=3.14, but `.github/workflows/validate.yml` still pinned 3.13 — so every isolated single-package bump either failed to install under 3.13 or hit a resolver conflict against the still-old `pytest-homeassistant-custom-component==0.13.316` pin. Bumped all 4 pins together (`pytest-homeassistant-custom-component==0.13.351`, `pytest-asyncio==1.4.0`, `pytest-cov==7.1.0`, `home-assistant-frontend==20260729.3`) and CI's `python-version` to `"3.14"`. Verified locally: `pip install -r requirements_test.txt` resolves cleanly under Python 3.14, all 207 tests pass. CI/test-toolchain only, no runtime effect on the integration itself. `.github/workflows/validate.yml`, `requirements_test.txt`. Closes #122, #112, #113, #114, #115

## [1.27.1] – 2026-08-04
### Fixed
- **Security: the `maintenance_done` service's `task` parameter was only length-checked before being interpolated straight into `/api/maintenance/{task}/done`**, with no enforcement of the 6 shapes `services.yaml` documents — its `selector: text:` leaves the field free-text in the UI, so nothing upstream constrained it. Mirrors the `_SAFE_ID`/`_ORDERS_POST_ALLOW_RE` fix already applied to `orders_api.py` for #65. Now validated against a fixed allowlist regex (`descaling`/`backflush`/`grouphead`/`gaskets`/`waterfilter`/`grinder_<id>`) before the URL is built, raising `ServiceValidationError` on a non-match. No change in behavior for any documented task value. `custom_components/gaggiuino_profiler/__init__.py`, `tests/test_maintenance_task_allowlist.py` (new). Closes #119
### Changed
- Bumped 3 GitHub Actions dependencies in CI workflows (`home-assistant/actions/hassfest`, `actions/upload-artifact` 4.6.2→7.0.1, `actions/dependency-review-action` 4.9.0→5.0.0). CI infrastructure only, no runtime effect. Closes #118, #117, #116

## [1.27.0] – 2026-08-03
### Changed
- **Bundled `www/glp-card.js` updated to GLP Shot Card v2.18.0.** Adds per-machine colour theme support (the card now picks up each machine's configured colour/icon and reflects it in the card header) — a real capability change for anyone running multi-machine, not just a stale-copy resync (contrast with the pure resync in v1.24.1), so this ships as a minor bump per this repo's versioning rule. No changes to this integration's own Python code. `custom_components/gaggiuino_profiler/www/glp-card.js`.

## [1.26.0] – 2026-08-03
### Added
- **New write-capable control entities: light, number, switch, button and two selects, backed by `gaggiuino-local-profiler`#597's settings/control proxy.** Phase 2b (write-capable half) of hass-gaggiuino parity — see #108 for the read-only sensors/binary sensors shipped alongside this. New `GlpSettingsCoordinator` (`settings_coordinator.py`, 30 s) polls `GET /api/machine/settings?category=<c>` for `boiler`/`display`/`led`/`scales`/`system` in parallel, one dict per category, so every write below can read-modify-write the full category payload rather than clobbering sibling fields the entity itself doesn't own. `GlpMachineCoordinator` (`machine_coordinator.py`) now also fetches `GET /api/machine/live` alongside its existing `GET /api/machine/status` call every 5 s and merges `sysState.operationMode`/`coreVersion`/`timeAlive` into its data — best-effort, a live-fetch failure doesn't affect the other machine-coordinator entities.
  - **`light.py`** (new platform): `LED` — `ColorMode.RGB` + a `Disco`/`None` effect, category `led`.
  - **`number.py`** (new platform): boiler setpoints `Steam Set Point`, `Offset Temperature`, `Heating Power`, `Main Divider`, `Brew Divider`, `Startup Heat Delta`; display `LCD Brightness`, `LCD Sleep Timeout`, `LCD Go Home Timeout`; LED time-of-flight `LED Time-of-Flight Min`/`Max` (nested `tof.min`/`tof.max` within the `led` category payload).
  - **`switch.py`** (new platform): boiler `Brew Delta`, `Dream Steam`; display `LCD Dark Mode`, `LCD Close On Brew Off`, `Simple UI`; scales `Force Predictive Scales`, `Hardware Scales Enabled`, `Bluetooth Scales Enabled`.
  - **`button.py`** (new platform): `Tare Scale` (`POST /api/machine/tare`), `Save Settings` (`POST /api/machine/settings/save` — persists whatever's currently applied in RAM to flash; only needed for changes made on the machine's own touchscreen, since every write above already auto-persists via its REST call), `Save Active Profile` (`POST /api/machine/profile/save`). Component-test buttons (pump/valve/valveB/LED) are deliberately not included — they actuate real hardware and `gaggiuino-local-profiler`#600 flagged those message types as not yet live-verified.
  - **`select.py`**: `Operation Mode` (`BREW_AUTO`/`FLUSH`/`DESCALE`/`STEAM`/`FLUSH_AUTO`/`HOT_WATER`/`HOME` — `BREW_MANUAL` deliberately excluded, the add-on's own `/api/machine/opmode` rejects it with a 400 while idle) and `Release Channel` (`stable`/`test`/`debug`, category `system`).
  - All new number/switch/select(release channel) entries are `entity_category: config` (they configure the machine); the operation-mode select and the three buttons are everyday-use, no category.
  - Multi-machine (#48): default-machine-only for v1, same scope note as the existing machine coordinator — the add-on's settings/control proxy isn't machine-scoped by the same convention as `/api/machine/status`.
  - **Review fix (pre-merge):** the Gaggiuino REST API returns some settings fields as real JSON booleans but several others — `boiler.brewDeltaState`/`dreamSteamState`, `display.lcdDarkMode`, `scales.forcePredictive`/`hwScalesEnabled`/`btScalesEnabled`, `led.state`/`disco` — as the JSON *strings* `"true"`/`"false"` (live-verified against gaggiuino/gaggiuino.github.io's `docs/rest-api/rest-api.md`). `bool("false")` is `True` in Python, so `switch.py`'s `is_on` and `light.py`'s `is_on`/`effect` reported permanently ON for every string-typed field regardless of the machine's actual state. Fixed with a shared `coerce_gaggiuino_bool`/`encode_gaggiuino_bool` helper (new `gaggiuino_bool.py`) that reads either representation and writes each field back in the same representation it arrived in. Also corrected `LCD Sleep Timeout` (`number.py`) from seconds to minutes per the same docs' field notes. `custom_components/gaggiuino_profiler/gaggiuino_bool.py` (new), `light.py`, `switch.py`, `number.py`, `tests/test_gaggiuino_bool_coercion.py` (new), `tests/test_control_entities.py`.
  - `custom_components/gaggiuino_profiler/settings_coordinator.py` (new), `light.py`/`number.py`/`switch.py`/`button.py` (new), `machine_coordinator.py`, `select.py`, `__init__.py`, `tests/test_settings_coordinator.py`, `tests/test_machine_coordinator_live_merge.py`, `tests/test_control_entities.py` (all new), `tests/test_unique_id_collisions.py`. Closes #109

## [1.25.0] – 2026-08-03
### Added
- **New read-only sensors and binary sensors for machine-derived live values** — `pumpFlow`, `weightFlow`, `waterTemperature`, boiler/valve relay states and thermocouple/pressure-sensor fault flags, all merged into the add-on's `GET /api/machine/status` response by `gaggiuino-local-profiler`#597 (PR #599). New sensors (machine coordinator, 5 s): `Pump Flow`, `Weight Flow`, `Water Temperature`. New binary sensors (machine coordinator, 5 s, `entity_category: diagnostic`): `Thermocouple Faulted`/`Pressure Sensor Faulted` (`device_class: problem`, `fault_reason` attribute) and raw relay/valve states `Boiler Relay`, `Valve`, `Steam Valve`, `Valve B`, `Steam Boiler Relay`. Phase 2a (read-only half) of hass-gaggiuino parity — see #109 for the write-capable control entities. `custom_components/gaggiuino_profiler/sensor.py`, `binary_sensor.py`, `tests/test_machine_status_extras.py` (new), `tests/test_unique_id_collisions.py`. Closes #108

## [1.24.2] – 2026-08-03
### Fixed
- **Machine Temperature / Machine Target Temperature sensors now go `unavailable` when the Gaggiuino machine itself is powered off or unreachable**, instead of holding their last known value forever as long as the GLP add-on stayed reachable — making it impossible to build an automation that detects the machine going offline. `GlpDataCoordinator` now reads the add-on's `GET /api/status` top-level `machineReachable` boolean into `coordinator.data["machine_reachable"]`; `GlpSensorDescription` gained an opt-in `requires_machine_reachable` flag (set on the two affected entries), and `GlpSensor.available` checks it. `machine_status` is unaffected — it reflects a distinct signal, the add-on's own sync-link health via `lastSyncError`, not the physical machine's reachability. Reported in https://github.com/mxkissnr/gaggiuino-local-profiler/discussions/596. `custom_components/gaggiuino_profiler/coordinator.py`, `sensor.py`, `tests/test_machine_reachable_availability.py` (new). Closes #106

## [1.24.1] – 2026-08-01
### Fixed
- **The bundled `www/glp-card.js` was stale.** It was copied from glp-lovelace-card before that repo's v2.17.5 release landed (ready-by pending-override fix #70, id-first bean matching #55, token-sync hardening #74) — re-synced. Closes #94

## [1.24.0] – 2026-08-01
### Added
- **GLP Shot Card now ships bundled inside this integration and is auto-registered as a Lovelace resource on setup.** Per HACS policy for a paired card+integration by the same author with a hard dependency (the card calls this integration's `set_ready_by`/`maintenance_done` services and falls back to this integration's entity-id prefix), the card can no longer be listed as a separate HACS plugin — see `hacs/default` PR #8568/#8567. `custom_components/gaggiuino_profiler/www/glp-card.js` is served as a static path and registered via `frontend.add_extra_js_url()`, cache-busted with this integration's own version, so no manual dashboard resource config is needed. Adds `frontend` to `manifest.json` dependencies (required for `add_extra_js_url` to work — it needs `frontend.async_setup` to have already initialized its own `hass.data` key). `custom_components/gaggiuino_profiler/__init__.py`, `tests/test_bundled_lovelace_card.py` (new). Closes #90
### Fixed
- **Raised the declared `hacs.json` `homeassistant` floor from 2024.1.0 to 2024.7.0.** `config_flow.py` already required `ConfigFlowResult` (2024.4+), and this integration now also depends on `async_register_static_paths`/`StaticPathConfig` (2024.7+) for the bundled-card static path above — the declared floor was stale on both counts. Flagged by the HACS reviewer on PR #8567. Closes #91
- **Removed a dead duplicate `custom_components/gaggiuino_profiler/logo.png`** (byte-identical copy of the repo-root `icon.png`, sitting outside `brand/` where HA/HACS actually reads brand assets from) and added a real `logo.png`/`logo@2x.png` (rendered from the existing `logo.svg`) inside `brand/`. Flagged by the HACS reviewer on PR #8567. Closes #92

## [1.23.0] – 2026-07-29
### Added
- **Setup can now auto-discover the add-on over the internal container network, making the host-port mapping optional.** Previously, initial setup's auto-discovery only tried the Supervisor's mapped host port (`localhost:<port>`, resolved via #78). It now first resolves the add-on's internal Supervisor identity and, if the info response exposes a container network port, builds a candidate `http://<internal-hostname>:<port>` URL (from the response's own `hostname` field, or the documented slug-to-hostname convention) and **live-probes `GET /api/status` against it** before ever using it — any failure at any step (no token, add-on not found, no container port, wrong hostname guess, non-Supervisor install) falls straight through to the existing host-port path unchanged, so already-configured installations and manual/non-Supervisor setups see no behavior change. `_is_trusted_host` now also trusts this specific add-on's internal hostname (narrow, exact-suffix match against `ADDON_SLUG`) so the Supervisor auth token is still forwarded over the internal network. `custom_components/gaggiuino_profiler/config_flow.py`, `auth.py`, `const.py`, `tests/test_config_flow_internal_network.py` (new). Closes #75
### Changed
- **Extracted a `GlpAuth` object.** Token fetch/cache logic (plus its SSRF `_is_trusted_host` guard) moved out of `GlpDataCoordinator` into a new `auth.py`, injected into all three coordinators (data/live/machine) instead of each depending on `GlpDataCoordinator._headers` being populated first — removes an implicit timing dependency between coordinators. Also fixes a latent bug hit while adding test coverage for the moved code: the token fetch used `response.ok`, which this suite's aiohttp test-mock double doesn't implement, silently producing empty auth headers whenever a test exercised that path — replaced with an explicit status-code check. `custom_components/gaggiuino_profiler/auth.py` (new), `coordinator.py`, `live_coordinator.py`, `machine_coordinator.py`, `select.py`, `orders_api.py`, `__init__.py`, `tests/test_auth.py` (new). Closes #67
- **Introduced a `GlpEntity`/`GlpAdditionalMachineEntity` base-class pair for the duplicated `DeviceInfo` blocks.** The identical `DeviceInfo(...)` block was copied verbatim across 9 entity classes in `sensor.py`, `binary_sensor.py`, `select.py` and `update.py`, plus 2 structurally different per-machine variants in the multi-machine registry — changing the device name or model meant editing every one of those by hand. All entity classes now derive from one of the two shared bases in the new `entity.py`; behavior is unchanged, including `select.py`'s `configuration_url` resolution from `entry.options`/`entry.data`. `custom_components/gaggiuino_profiler/entity.py` (new), `sensor.py`, `binary_sensor.py`, `select.py`, `update.py`, `tests/test_unique_id_collisions.py`. Closes #68
- **Coordinator test coverage 82% → 86%.** New/expanded tests for `GlpDataCoordinator` and `GlpLiveCoordinator` aggregation paths that had no direct coverage before. `tests/test_coordinator_aggregation.py` (new), `tests/test_live_coordinator.py`. Closes #69
### Fixed
- **`recent_shots` sensor attribute now carries `annotation.beanId`.** Was never forwarded from the GLP API's shot annotation into the `recent_shots` sensor attribute payload, so glp-lovelace-card's shot-card bean enrichment (companion to #55) always fell back to name-based bean matching instead of the more stable ID-based match it prefers. `custom_components/gaggiuino_profiler/coordinator.py`, `tests/test_coordinator_aggregation.py`. Closes #82

## [1.22.3] – 2026-07-28
### Fixed
- **Port auto-discovery in the setup dialog now resolves the add-on's real Supervisor identity instead of assuming a hardcoded slug.** `config_flow.py` looked up the configured port via `GET /addons/gaggiuino_local_profiler/info`, but the Supervisor identifies add-ons installed from a custom repository (which is how GLP is distributed) with a repo-hash-prefixed slug (e.g. `5611d8a7_gaggiuino_local_profiler`), so that lookup silently failed on every install and fell back to the default port (8099) — indistinguishable from a correct discovery because the fallback and default values happened to match. Fixed by first calling `GET /addons` (the full add-on list) and matching on the slug's `_gaggiuino_local_profiler` suffix, then using the resolved slug for the port lookup as before. Confirmed against a real installation (`slug: "5611d8a7_gaggiuino_local_profiler"`). No change for already-configured installations — they use their stored URL and never call this path again; only new setups where the add-on runs on a remapped host port are affected, and those now get the right suggested port instead of always the default. `custom_components/gaggiuino_profiler/config_flow.py`, `tests/test_config_flow_supervisor_port.py` (new). Closes #78
- Hardened the `unique_id` collision regression test to correctly model machine-scoped suffixes (built from a runtime `machine_id`, not a fixed literal) and replaced the hand-maintained list of hardcoded suffixes with an AST scan over the integration's source so new ones are picked up automatically. `tests/test_unique_id_collisions.py`. Closes #74

## [1.22.2] – 2026-07-28
### Fixed — Security
- **Path traversal in the orders/shots HA proxy allowed any authenticated non-admin HA user to reach privileged add-on endpoints, bypassing the Order Card's admin check entirely.** `GlpOrdersSubView` and `GlpShotsSubView` forwarded their wildcard `{rest}` URL segment into the outgoing add-on request unchecked; the HTTP client library normalizes `..` segments away when building the outgoing request, so a crafted sub-path could reach add-on routes never meant to be exposed through this proxy — including the one that returns the GLP API token. `rest` is now validated per view and HTTP method against a fixed allowlist derived from the real call sites in `glp-order-card` and `glp-lovelace-card`; anything outside it is rejected with 400 before a request is ever made to the add-on. Order Card and Lovelace Card users see no behavior change — the allowlist covers every real call path used by both cards, confirmed by dedicated positive tests. Affects all installations exposing the Order Card and/or running HA with more than one user. `custom_components/gaggiuino_profiler/orders_api.py`, `tests/test_orders_api_path_traversal.py` (new). Closes #65
- Added a regression test asserting global uniqueness of the `unique_id` keys built from `SENSORS`/`MAINTENANCE_SENSORS`/`MACHINE_SENSORS` plus the hardcoded entity suffixes in `binary_sensor.py`/`select.py`/`update.py`/`sensor.py` — a guard against the failure class behind the v1.22.1 entity-id collision (#62/#63), not a fix for one. No collision found. `tests/test_unique_id_collisions.py` (new). Closes #66

## [1.22.1] – 2026-07-27
### Fixed
- **New preheat ready-by sensors (`preheat_ready_by_target_at`, `preheat_planned_switch_on_at`, added in v1.22.0) could get a collision-mangled, unpredictable `entity_id` on first creation instead of the expected `sensor.gaggiuino_local_profiler_preheat_ready_by_target_at` / `..._planned_switch_on_at`, silently breaking the lovelace card's hardcoded entity_id lookup.** Root cause: `GlpSensor` and its sibling sensor classes relied on Home Assistant's automatic slugification of the sensor's display name to derive `entity_id`, which is non-deterministic if that slug collides with anything else already registered on the instance (observed in the wild as a stray `v_dev_` prefix and a missing `_at` suffix). Fixed by overriding `suggested_object_id` on all five sensor classes in `sensor.py` to derive it from the stable, collision-free programmatic `key` instead of the display name, matching the upstream `aosmith` `select.py` pattern (`_attr_suggested_object_id` is not honored by current HA core). Verified safe for existing installs: a dedicated regression test (`tests/test_sensor_suggested_object_id.py`) confirms `suggested_object_id` is only ever consulted by `entity_registry.async_get_or_create` at an entity's *first-ever* registration — already-registered entities are never renamed by this change. `custom_components/gaggiuino_profiler/sensor.py`, `tests/test_sensor_suggested_object_id.py` (new, regression tests). Closes #62

  **⚠ This does NOT retroactively fix entities that already got a mangled entity_id on an existing install.** If your ready-by sensors are already showing a mangled entity_id (or the lovelace card shows "not found" for the preheat ready-by tiles), updating to this version alone will not repair them — HA never renames an already-registered entity. You must manually rename the two affected entities yourself: Settings → Devices & Services → Entities → search "ready by" / "planned switch on" → rename each entity_id to `sensor.gaggiuino_local_profiler_preheat_ready_by_target_at` and `sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at`. Anyone who has not yet set up the ready-by feature, or who removes and re-adds the integration's device, gets the correct entity_id automatically from this version on.

## [1.22.0] – 2026-07-27
### Added
- **`gaggiuino_profiler.set_ready_by` service and two new preheat sensors.** The service POSTs `targetAt` (epoch-ms, or `null` to clear) to the app's `/api/preheat/ready-by` endpoint and refreshes the coordinator on success; a 400 from the app (e.g. preheat switch or `HA_TOKEN` not configured) surfaces as a `HomeAssistantError` instead of failing silently. Two new `SensorDeviceClass.TIMESTAMP` sensors, `preheat_ready_by_target_at` and `preheat_planned_switch_on_at`, are sourced from the existing `/api/preheat` poll already fetched by `GlpDataCoordinator` — no new coordinator needed. Part 2/3 of the ready-by preheat timer feature; **requires gaggiuino-local-profiler v2.20.0 or later** for the `/api/preheat/ready-by` endpoint to exist — on an older app version the service call will simply fail with the app's 404, no crash. `custom_components/gaggiuino_profiler/__init__.py`, `coordinator.py`, `sensor.py`, `services.yaml`, `tests/test_ready_by_service.py` (new, tests). Closes #59

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
