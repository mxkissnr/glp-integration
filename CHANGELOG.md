# Changelog

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
