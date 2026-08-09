<p align="center">
  <img src="logo.svg" alt="Gaggiuino Local Profiler" width="660"/>
</p>

<p align="center">
  <a href="https://github.com/mxkissnr/glp-integration/releases">
    <img src="https://img.shields.io/github/v/tag/mxkissnr/glp-integration?color=%23f59e0b&label=Version&style=flat-square" alt="Version"/>
  </a>
  <a href="https://github.com/mxkissnr/glp-integration/actions/workflows/validate.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/mxkissnr/glp-integration/validate.yml?branch=main&label=Validate&style=flat-square" alt="Validate"/>
  </a>
  <a href="https://github.com/custom-components/hacs">
    <img src="https://img.shields.io/badge/HACS-Custom-orange?style=flat-square" alt="HACS Custom"/>
  </a>
  <img src="https://img.shields.io/badge/Home%20Assistant-2024.1%2B-41bdf5?logo=home-assistant&style=flat-square" alt="HA Version"/>
  <img src="https://img.shields.io/badge/Polling-local-6b7280?style=flat-square" alt="Local Polling"/>
  <img src="https://img.shields.io/badge/Built%20with-Claude%20by%20Anthropic-D97706?style=flat-square" alt="Built with Claude"/>
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License GPL-3.0"/>
</p>

<p align="center">
  Exposes <a href="https://github.com/mxkissnr/gaggiuino-local-profiler">Gaggiuino Local Profiler</a> as native Home Assistant entities —<br/>
  machine status, shot data, live brewing state and machine sensors, all without cloud.<br/>
  Ships with the <strong>GLP Shot Card</strong>, a Lovelace dashboard card, auto-registered on setup — no separate install needed.
</p>

<p align="center">
  Part of the <a href="https://github.com/mxkissnr/gaggiuino-local-profiler">GLP ecosystem</a> — requires a <a href="https://gaggiuino.github.io/">Gaggiuino</a>-modified espresso machine and the GLP App.
</p>

---

## ⚡ Quick Install

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=mxkissnr&repository=glp-integration&category=integration">
  <img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Add Integration via HACS" height="40"/>
</a>

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🃏 | **Bundled Shot Card** | The [GLP Shot Card](https://github.com/mxkissnr/glp-lovelace-card) ships inside this integration and registers itself as a Lovelace resource on setup — just add `type: custom:glp-card` to a dashboard, no separate HACS install or resource config |
| ☕ | **Brewing Sensor** | Binary sensor updated every 2 seconds — perfect as automation trigger |
| 📊 | **Shot Sensors** | Profile, rating, duration, pressure, yield, ratio, dose, coffee, grinder, shots today and more |
| 🌡️ | **Machine Sensors** | Live pressure, temperature, water level, weight, uptime, active profile — updated every 5 s |
| 🔧 | **Maintenance Sensors** | One sensor per task (descaling, backflush, group head, gaskets, water filter) with progress value |
| ⏱️ | **Preheat Sensors** | Preheat ready binary sensor + elapsed / remaining time sensors |
| ⏰ | **Ready-By Timer** | `set_ready_by` service to schedule when the machine should be preheated for, plus target/planned-switch-on timestamp sensors |
| 🎛️ | **Profile Selector** | `select` entity to switch the active brew profile from any HA dashboard or automation |
| 🛠️ | **Machine Controls** | Read/write `light` (LED), `number` (boiler/display/LED setpoints), `switch` (Brew Delta, Dream Steam, LCD options, scales) and `button` (tare, save settings, save active profile) entities, plus Operation Mode and Release Channel `select` entities |
| 🔄 | **Firmware Update** | `update` entity for the espresso machine's own firmware — shows when a newer build is available and installs it with one click |
| 🖥️ | **Multi-Machine Devices** | Each additional configured machine gets its own HA device with status and reachable sensors |
| 🎨 | **Theme Sync** | Machine status sensor exposes a `theme` attribute the bundled cards read to match each machine's configured accent color |
| 💾 | **Backup & Maintenance Services** | `backup` service exports shots/annotations/coffee library/blocklist to `<config>/glp_backups/`; `maintenance_done` marks a maintenance task complete |
| 🔔 | **Shot Event** | Fires `gaggiuino_profiler_shot_completed` with full shot data after every pull |
| ⚙️ | **Configurable** | URL and poll interval adjustable any time via *Settings → Integration → Configure* |
| 🔍 | **Diagnostics** | HA diagnostics export for easy bug reports |

> **Replaces ALERTua/hass-gaggiuino** — as of v1.9.0 this integration provides all machine sensors (temperature, pressure, water level, weight, profile, uptime) natively. You no longer need a second integration.

---

## 🚀 Installation

### HACS (recommended)

1. Click the button above — or: HACS → Integrations → ⋮ → **Custom repositories**
2. Add `https://github.com/mxkissnr/glp-integration` as **Integration**
3. Search for *Gaggiuino Local Profiler* and install
4. Restart Home Assistant

### Manual

1. Copy `custom_components/gaggiuino_profiler/` into your `config/custom_components/` directory
2. Restart Home Assistant

---

## ⚙️ Setup

1. **Settings → Devices & Services → Add Integration**
2. Search for *Gaggiuino Local Profiler*
3. Enter the URL of your GLP app:
   ```
   http://localhost:8099
   ```
   > **Use `localhost`, not `homeassistant.local`.** mDNS resolution of `homeassistant.local` can fail intermittently from within the HA core container on HA OS, causing all sensors to go unavailable. `localhost:8099` is always reachable because HA OS runs the core container in host-network mode.

   The integration validates the connection immediately.

### Options

**Settings → Devices & Services → Gaggiuino Local Profiler → Configure**

| Option | Default | Description |
|---|---|---|
| URL | *(entered URL)* | URL of the GLP app |
| Poll interval | `60` | Update interval in seconds (10–300) |

---

## 📋 Entities

### Shot & Status Sensors *(60 s poll, configurable)*

| Entity | Description | Unit |
|---|---|---|
| Machine Status | `online` / `error` | — |
| Shot Count | Total number of stored shots | shots |
| Shots Today | Number of shots pulled today | shots |
| Last Shot Profile | Extraction profile name | — |
| Last Shot Rating | Star rating (1–5 ★) | — |
| Last Shot Date | Timestamp of the last shot | — |
| Last Shot Duration | Shot duration | s |
| Last Shot Avg Pressure | Average extraction pressure | bar |
| Last Shot Yield | Output weight | g |
| Last Shot Brew Ratio | Yield ÷ dose | — |
| Last Shot Dose | Input dose weight | g |
| Last Shot Coffee | Coffee annotation | — |
| Last Shot Grinder | Grinder annotation | — |
| Last Sync | Timestamp of last sync | — |
| Machine Hostname | Gaggiuino controller hostname | — |
| Machine Temperature | Current boiler temperature | °C |
| Machine Target Temperature | Target boiler temperature | °C |
| Preheat Elapsed | Time elapsed since machine switched on | s |
| Preheat Remaining | Estimated time until machine is ready | s |
| Preheat Ready-By Target | Timestamp the machine should be ready by, set via `set_ready_by` | — |
| Preheat Planned Switch-On | Timestamp the app plans to switch the machine on to hit the ready-by target | — |

### Machine Live Sensors *(5 s poll via machine coordinator)*

| Entity | Description | Unit |
|---|---|---|
| Machine Live Pressure | Current extraction pressure | bar |
| Machine Water Level | Water reservoir fill level | % |
| Machine Live Weight | Current weight on scale | g |
| Machine Uptime | Controller uptime | s |
| Machine Active Profile | Currently active brew profile name | — |
| Pump Flow | Live pump flow rate | L/min |
| Weight Flow | Live flow rate on the scale | g/s |
| Water Temperature | Live water (boiler inlet) temperature | °C |

### Maintenance Sensors *(60 s poll)*

| Entity | Description |
|---|---|
| Maintenance Descaling | Progress toward next descaling |
| Maintenance Backflush | Progress toward next backflush |
| Maintenance Group Head | Progress toward next group head service |
| Maintenance Gaskets | Progress toward next gasket replacement |
| Maintenance Water Filter | Progress toward next filter replacement |

### Binary Sensors

| Entity | Description | Update rate |
|---|---|---|
| Brewing | `on` during an active pull; attributes: `datapoints`, `profile_name`, `seq` | every 2 s |
| Preheat Ready | `on` when machine has reached stable brewing temperature | 60 s |
| Steam Switch | `on` when steam mode is active | 5 s |
| Thermocouple Faulted¹ | `on` when the boiler thermocouple reports a fault; `fault_reason` attribute | 5 s |
| Pressure Sensor Faulted¹ | `on` when the pressure sensor reports a fault; `fault_reason` attribute | 5 s |
| Boiler Relay¹ | Raw boiler heating relay state | 5 s |
| Valve¹ | Raw brew valve state | 5 s |
| Steam Valve¹ | Raw steam valve state | 5 s |
| Valve B¹ | Raw secondary valve state (machines with a second valve) | 5 s |
| Steam Boiler Relay¹ | Raw steam boiler relay state | 5 s |
| Reachable *(per additional machine)* | Reachability of a non-default machine (multi-machine mode) | 60 s |

¹ Diagnostic entity — grouped separately in the device's entity list, mainly useful for troubleshooting.

### Select

| Entity | Description |
|---|---|
| Profile | Active brew profile — read/write; options list updated every 60 s |
| Operation Mode | `BREW_AUTO` / `FLUSH` / `DESCALE` / `STEAM` / `FLUSH_AUTO` / `HOT_WATER` / `HOME` — read/write, from the machine coordinator (5 s) |
| Release Channel² | Firmware update channel — `stable` / `test` / `debug` |

### Light

| Entity | Description |
|---|---|
| LED | Machine status LED — RGB color plus a `Disco`/`None` effect |

### Number²

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

### Switch²

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

² `entity_category: config` — grouped under the device's "Configuration" section, not shown alongside everyday controls by default.

### Button

| Entity | Description |
|---|---|
| Tare Scale | Requests a scale tare |
| Save Settings | Persists whatever's currently applied in RAM to flash — for settings changed on the machine's own touchscreen/web UI that you want GLP to make durable |
| Save Active Profile | Persists the currently active profile (and its ID) to flash |

### Update

| Entity | Description |
|---|---|
| Update | Read-only version display for the GLP app itself — for non-Supervisor (plain Docker) installs, where HA's own Supervisor-backed update entity doesn't exist |
| Firmware | Shows whether newer firmware is available for the espresso machine itself and installs it on demand (Gaggiuino machines only) |

### Multi-Machine Devices

With multi-machine mode enabled (app v2.0.0+), each additional (non-default) configured machine gets its own HA device with a Status sensor and a Reachable binary sensor. The default machine's `machine_status` sensor's `machines` attribute, and each additional machine's Status sensor, also expose a `theme` attribute — the accent color configured for that machine in the app's Settings → Machines, which the bundled cards read to color their header per machine.

---

## 🧾 Services

| Service | Description |
|---|---|
| `gaggiuino_profiler.backup` | Exports a full GLP backup (shots, annotations, coffee library, blocklist, trash) via `/api/backup` and writes it to `<config>/glp_backups/`. Fires `gaggiuino_profiler_backup_created` with the resulting file path afterward |
| `gaggiuino_profiler.maintenance_done` | Marks a maintenance task (`task`: `descaling`, `backflush`, `grouphead`, `gaskets`, `waterfilter`, or `grinder_<id>`) as done and resets its timer |
| `gaggiuino_profiler.set_ready_by` | Schedules the machine to be preheated and ready by a target time (`target_time`) via `/api/preheat/ready-by`. Omit `target_time` to cancel |

All three services optionally accept a `machine` field (a machine id from the multi-machine registry) for future per-machine scoping.

---

## 🔔 Event: `gaggiuino_profiler_shot_completed`

Fired automatically after every completed pull. Contains all relevant shot data:

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
  score: 87
  coffee: "Ethiopia Yirgacheffe"
  grinder: "DF64"
```

### Automation examples

**Notification after each shot:**
```yaml
automation:
  trigger:
    platform: event
    event_type: gaggiuino_profiler_shot_completed
  action:
    service: notify.mobile_app
    data:
      title: "☕ Shot done"
      message: >
        {{ trigger.event.data.profile }} –
        {{ trigger.event.data.duration_s }}s,
        ratio 1:{{ trigger.event.data.ratio }}
```

**Dim lights when brewing ends:**
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

---

## 🏗️ Architecture

```
Home Assistant
├── GlpDataCoordinator  (60 s, configurable)
│   ├── GET /api/status    → machine status, shotCount, lastSync, preheat
│   └── GET /shots.json    → shot data, annotations, datapoints
│
├── GlpLiveCoordinator  (2 s)
│   └── GET /api/live/data → isLive (brewing state + live datapoints)
│
├── GlpMachineCoordinator  (5 s)
│   └── GET /api/machine/status → pressure, temperature, water level,
│                                  weight, uptime, active profile, steam switch
│
└── Event Bus
    └── gaggiuino_profiler_shot_completed  (on new shot_id)
```

---

## 🔍 Diagnostics

**Settings → Devices & Services → Gaggiuino Local Profiler → Device → Download Diagnostics**

The diagnostics file contains current coordinator data (no sensitive information) and makes it easy to file an issue.

---

<p align="center">
  <a href="https://github.com/mxkissnr/gaggiuino-local-profiler/wiki">📖 Documentation (Wiki)</a> ·
  <a href="CHANGELOG.md">📋 Changelog</a> ·
  <a href="https://github.com/mxkissnr/gaggiuino-local-profiler">🔧 GLP App</a> ·
  <a href="https://github.com/mxkissnr/glp-integration/issues">🐛 Issues</a>
</p>

---

## License

GPL-3.0 © 2024–2026 mxkissnr — free to use, fork and modify; any derivative work must remain open source under the same license. Commercial use is not permitted.

## Acknowledgements

Inspired by [BeanConqueror](https://github.com/graphefruit/beanconqueror) by graphefruit — a fantastic open-source coffee tracking app that pioneered many of the ideas around shot logging and coffee library management that influenced this project.

Built on top of the [Gaggiuino](https://gaggiuino.github.io/) project. The machine sensor design was inspired by the original [Gaggiuino Home Assistant Integration](https://github.com/ALERTua/hass-gaggiuino) by ALERTua — thank you for pioneering the HA connectivity concepts that made this possible.

## Disclaimer

GLP Integration is an independent, community-built Home Assistant custom component. It is not officially affiliated with, endorsed by, or supported by the [Gaggiuino](https://gaggiuino.github.io/) firmware project or its maintainers.

---

<p align="center">
  <sub>Built with <a href="https://claude.ai/code">Claude Code</a> by Anthropic — see <a href="https://github.com/mxkissnr/gaggiuino-local-profiler/blob/main/DEVELOPMENT.md">DEVELOPMENT.md</a> for full transparency and model stats.</sub>
</p>
