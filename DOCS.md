# Gaggiuino Local Profiler — Home Assistant Integration

Integrates the [Gaggiuino Local Profiler](https://github.com/mxkissnr/gaggiuino-local-profiler) as native HA entities — machine status, shot data and live brew status directly in Home Assistant, no cloud.

## Requirements

- [Gaggiuino Local Profiler App](https://github.com/mxkissnr/gaggiuino-local-profiler) installed and running
- Home Assistant 2024.7.0 or newer

## Installation

### HACS (recommended)

1. HACS → Integrations → ⋮ → **Custom repositories**
2. Add `https://github.com/mxkissnr/glp-integration` as an **Integration**
3. Search for *Gaggiuino Local Profiler* and install it
4. Restart Home Assistant

### Manual

1. Copy the `custom_components/gaggiuino_profiler/` folder into `config/custom_components/`
2. Restart Home Assistant

## Setup

1. **Settings → Devices & Services → Add Integration**
2. Search for *Gaggiuino Local Profiler*
3. On Supervisor installs, setup first tries to auto-discover the add-on — including over the internal container network, so a host-port mapping is no longer required for this to work. If auto-discovery succeeds, the integration is added automatically with no further input.
4. If auto-discovery doesn't find it, enter the GLP app's URL manually: `http://localhost:8099`
   > **Use `localhost`, not `homeassistant.local`** — mDNS resolution fails intermittently inside HA OS and makes all sensors unavailable. `localhost:8099` always works reliably.

The integration tests the connection right away during setup.

## Bundled GLP Shot Card

The [GLP Shot Card](https://github.com/mxkissnr/glp-lovelace-card) lovelace card ships inside this integration and is registered automatically as a dashboard resource on setup — no separate HACS install or manual resource config needed. Just add a card with `type: custom:glp-card` to your dashboard after installing this integration. (The [GLP Order Card](https://github.com/mxkissnr/glp-order-card) has no dependency on this integration and remains a separate HACS install.)

As of the bundled v2.18.0 build, the card also picks up each machine's configured colour theme and icon on multi-machine setups, so the card header matches whichever machine it's showing.

## Options after setup

**Settings → Devices & Services → Gaggiuino Local Profiler → Configure**

| Option | Default | Description |
|---|---|---|
| URL | *(URL entered above)* | URL of the GLP app |
| Poll interval | `60` | Update interval in seconds (10–300) |

## Entities

All sensors/entities update at the poll interval of their respective coordinator: the main coordinator (`coordinator.py`) every 60 seconds (configurable, see above), the live coordinator (`live_coordinator.py`) every 2 seconds during a brew, and the machine coordinator (`machine_coordinator.py`) every 5 seconds for live machine values.

### Relationship to Gaggiuino firmware's own MQTT entities

Newer Gaggiuino firmware (build 7889b7d+) can publish its own MQTT/Home Assistant auto-discovery entities directly — boiler temperature/pressure/flow/weight, brew/steam/hot-water status, an operation-mode select, active profile, a tare button, and live shot-in-progress sensors. This integration never talks to the machine directly — it only polls the add-on's own REST API — so nothing here is affected by enabling firmware MQTT.

If you enable both, some entities will look duplicated (this integration's `Machine Live Pressure`/`Machine Live Weight`/`Machine Water Level`/`Machine Temperature`/`Machine Active Profile`/`Operation Mode`/`Tare Scale` overlap with the firmware's native equivalents) — that's expected, not a bug, and either set can be safely ignored/disabled per your preference. This integration additionally provides things firmware-native MQTT does not: persisted shot history and scoring, preheat scheduling, broader (5-task) maintenance tracking with configurable thresholds, and (since v1.26.0) boiler/display/scales/LED settings control (number/switch/light) and a release-channel select.

### Sensors

| Entity | Description | Unit |
|---|---|---|
| Machine Status | `online` / `error` | — |
| Shot Count | Total number of shots stored | shots |
| Shots Today | Number of shots pulled today | shots |
| Last Shot Profile | Name of the extraction profile | — |
| Last Shot Rating | Manual star rating of the last shot (annotation, not an automatic score) | ★ |
| Last Shot Date | Timestamp of the last shot | — |
| Last Shot Duration | Brew duration | s |
| Last Shot Avg Pressure | Average extraction pressure | bar |
| Last Shot Yield | Yield (output weight) | g |
| Last Shot Brew Ratio | Yield ÷ Dose | — |
| Last Shot Dose | Dose (input weight) | g |
| Last Shot Coffee | Coffee annotation | — |
| Last Shot Grinder | Grinder annotation | — |
| Last Sync | Timestamp of the last sync | — |
| Machine Hostname | Hostname of the Gaggiuino controller | — |
| Machine Temperature¹ | Current boiler temperature | °C |
| Machine Target Temperature¹ | Target boiler temperature | °C |
| Preheat Elapsed | Elapsed preheat time | s |
| Preheat Remaining | Time remaining until preheat is ready | s |
| Preheat Ready By | Scheduled target time for preheat readiness (`set_ready_by` service) | — |
| Preheat Planned Switch On | Scheduled switch-on time to hit the ready-by target | — |
| Maintenance Descaling / Backflush / Group Head / Gaskets / Water Filter | Status (`status` attribute) of each maintenance task, plus `days_since`, `shots_since`, `last_date`, `pct` attributes | — |
| Maintenance Grinders | Maintenance status per configured grinder (`grinder_maintenance_details` attribute) | — |
| Machine Live Pressure | Live pressure straight from the machine (machine coordinator) | bar |
| Machine Water Level | Live water level | % |
| Machine Live Weight | Live weight on the scale | g |
| Machine Uptime | Controller uptime since its last restart | s |
| Machine Active Profile | Profile currently active on the machine | — |
| Pump Flow | Live pump flow rate | L/min |
| Weight Flow | Live flow rate on the scale | g/s |
| Water Temperature | Live water (boiler inlet) temperature | °C |

With multi-machine mode enabled (app v2.0.0+), a `Reachable` binary sensor is added automatically on its own device for every additional (non-default) machine — reachable/on are currently the only fields the app API (`machines[]` registry) provides per additional machine.

¹ Goes `unavailable` when the Gaggiuino machine itself is powered off or unreachable, not just when the GLP add-on is unreachable — use this to detect "is the machine actually on" in automations. `Machine Status` is unaffected: it reflects the add-on's own sync-link health, a separate signal.

### Binary Sensor

| Entity | Description | Coordinator |
|---|---|---|
| Brewing | `true` during an active brew | Live (2 s) |
| Preheat Ready | `true` once preheat time has elapsed | Main (60 s) |
| Steam Switch | Physical steam switch state of the machine | Machine (5 s) |
| Thermocouple Faulted² | `true` when the boiler thermocouple reports a fault (`fault_reason` attribute) | Machine (5 s) |
| Pressure Sensor Faulted² | `true` when the pressure sensor reports a fault (`fault_reason` attribute) | Machine (5 s) |
| Boiler Relay² | Raw boiler heating relay state | Machine (5 s) |
| Valve² | Raw brew valve state | Machine (5 s) |
| Steam Valve² | Raw steam valve state | Machine (5 s) |
| Valve B² | Raw secondary valve state (machines with a second valve) | Machine (5 s) |
| Steam Boiler Relay² | Raw steam boiler relay state | Machine (5 s) |
| Reachable *(per additional machine)* | Reachability of a non-default machine (multi-machine mode) | Main (60 s) |

² Diagnostic entity (category `diagnostic`, grouped separately in the device's entity list) — raw low-level state, mainly useful for troubleshooting.

### Select

| Entity | Description |
|---|---|
| Profile | Profile selector. The option list comes from the main coordinator (60 s — profiles rarely change), while the currently selected value is read from the machine coordinator (5 s) so a profile switch made directly on the machine reaches HA quickly. Selecting a profile in HA calls `/api/machine/profile/set` on the add-on. |
| Operation Mode | `BREW_AUTO` / `FLUSH` / `DESCALE` / `STEAM` / `FLUSH_AUTO` / `HOT_WATER` / `HOME`. `BREW_MANUAL` is intentionally not offered — the add-on's own `/api/machine/opmode` rejects it while idle. Current value comes from the machine coordinator (5 s, via `GET /api/machine/live`). |
| Release Channel³ | `stable` / `test` / `debug` firmware update channel. |

### Light

| Entity | Description |
|---|---|
| LED | Machine status LED. RGB color plus a `Disco`/`None` effect. |

### Number³

| Entity | Description | Unit | Range |
|---|---|---|---|
| Steam Set Point | Boiler steam target temperature | °C | 100–160 |
| Offset Temperature | Boiler temperature calibration offset | °C | -10–10 |
| Heating Power | Boiler heating power | — | 100–1500 |
| Main Divider | Main boiler PID divider | — | 1–5 |
| Brew Divider | Brew boiler PID divider | — | 1–5 |
| Startup Heat Delta | Extra heat added during startup | °C | 0–10 |
| LCD Brightness | Touchscreen brightness | % | 0–100 |
| LCD Sleep Timeout | Idle time before the screen sleeps | min | 0–120 |
| LCD Go Home Timeout | Idle time before returning to the home screen | s | 0–60 |
| LED Time-of-Flight Min/Max | Distance sensor thresholds for the LED's proximity trigger | — | 0–200 |

### Switch³

| Entity | Description |
|---|---|
| Brew Delta | Boiler brew-temperature delta compensation |
| Dream Steam | Dream-steam boiler mode |
| LCD Dark Mode | Touchscreen dark theme |
| LCD Close On Brew Off | Close the active-brew screen automatically when the brew ends |
| Simple UI | Simplified touchscreen UI |
| Force Predictive Scales | Force predictive weight readings |
| Hardware Scales Enabled | Onboard (wired) scale |
| Bluetooth Scales Enabled | Bluetooth scale |

³ `entity_category: config` — grouped under the device's "Configuration" section in the UI, not shown alongside everyday controls by default.

### Button

| Entity | Description |
|---|---|
| Tare Scale | Requests a scale tare |
| Save Settings | Persists whatever's currently applied in RAM to flash. Settings changed through the Number/Switch/Light entities above already auto-persist via their own REST call — this button is specifically for settings changed on the machine's own touchscreen/web UI that you want GLP to make durable. |
| Save Active Profile | Persists the currently active profile (and its ID) to flash |

Component-test buttons (pump/valve/valve B/LED) are intentionally not included — they briefly actuate real hardware and aren't yet live-verified against the add-on's proxy (`gaggiuino-local-profiler`#600).

All light/number/switch/button/select (Operation Mode, Release Channel) entities are sourced from `GlpSettingsCoordinator` (30 s) or the machine coordinator (5 s, Operation Mode only) and are default-machine-only for now — same multi-machine scope note as the sensors above.

### Update

| Entity | Description |
|---|---|
| Update (Gaggiuino Local Profiler) | Read-only version display for the add-on itself. HA's own Supervisor-backed `update.<slug>_glp_update` entity is the one that actually installs add-on updates — this one exists for non-Supervisor (plain Docker) installs, where that native entity doesn't exist. |
| Firmware (Machine Firmware) | Shows whether a newer firmware build is available for the espresso machine itself, comparing the machine's installed version against the latest matching release on the firmware's own GitHub project. Supports installing: triggering it starts the machine's own OTA update flow. There is no live progress reporting during the OTA — `installed_version` catches up once the machine reports its new version on the next poll. Gaggiuino machines only; unavailable on GaggiMate (no such check exists on that adapter). |

### Migrating from ALERTua/hass-gaggiuino

This integration now covers the control surface that community integration exposes: profile selection, operation mode, boiler/display/scales settings (number/switch), the status LED (light), tare/save-settings/save-profile (button), plus live sensors/binary sensors for flow, water temperature, relay states and sensor faults (added in v1.25.0). If you're switching over, you can remove `hass-gaggiuino` once you've re-pointed any automations at this integration's equivalent entities — no data migration needed, everything here is read fresh from the machine/add-on.

## Services

Alongside the entities, the integration registers three HA services (`gaggiuino_profiler.<name>`):

| Service | Description |
|---|---|
| `backup` | Exports a full GLP backup (shots, annotations, coffee library, blocklist, trash) via `/api/backup` and writes it to `<config>/glp_backups/`. Fires `gaggiuino_profiler_backup_created` with the resulting file path afterward. |
| `maintenance_done` | Marks a maintenance task (`task`: `descaling`, `backflush`, `grouphead`, `gaskets`, `waterfilter`, or `grinder_<id>`) as done and resets its timer. Used by the GLP Lovelace card. |
| `set_ready_by` | Schedules the machine to be preheated and ready by a target time (`target_time`) via `/api/preheat/ready-by`. Omit `target_time` to cancel a scheduled ready-by. Fails if the app's preheat switch entity or HA token isn't configured. |

All three services optionally accept a `machine` field (a machine id from the multi-machine registry) — it is already sent as a `?machine=<id>` query parameter, but has no effect yet, since the corresponding app endpoints don't read this parameter as of app v2.0.0. Without `machine`, all three services act on the default machine (the only supported behavior today).

## HA event: `gaggiuino_profiler_shot_completed`

Fired after every completed brew. Contains all relevant shot data:

```yaml
event_type: gaggiuino_profiler_shot_completed
data:
  shot_id: 54
  profile: "Adaptive"
  duration_s: 28.4
  yield_g: 42.1
  dose_g: 18.0
  ratio: 2.34
  avg_pressure: 8.72
  rating: 4
  coffee: "Ethiopia Yirgacheffe"
  grinder: "DF64"
```

`rating` is the manual star rating from the shot annotation (`null` if not set (yet)) — not an automatically calculated score.

### Automation examples

**Notification after every shot:**
```yaml
automation:
  trigger:
    platform: event
    event_type: gaggiuino_profiler_shot_completed
  action:
    service: notify.mobile_app
    data:
      title: "☕ Shot complete"
      message: >
        {{ trigger.event.data.profile }} –
        {{ trigger.event.data.duration_s }}s,
        Ratio 1:{{ trigger.event.data.ratio }}
```

**Dim the lights after a brew:**
```yaml
automation:
  trigger:
    platform: state
    entity_id: binary_sensor.gaggiuino_local_profiler_brewing
    from: "on"
    to: "off"
  action:
    service: light.turn_on
    target:
      entity_id: light.kitchen
    data:
      brightness_pct: 30
```

## Diagnostics

**Settings → Devices & Services → Gaggiuino Local Profiler → Device → Download diagnostics**

The diagnostics file contains the current coordinator data (with no sensitive information) and makes it easier to report issues.
