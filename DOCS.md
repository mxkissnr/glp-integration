# Gaggiuino Local Profiler — Home Assistant Integration

Integrates the [Gaggiuino Local Profiler](https://github.com/mxkissnr/gaggiuino-local-profiler) as native HA entities — machine status, shot data and live brew status directly in Home Assistant, no cloud.

## Requirements

- [Gaggiuino Local Profiler App](https://github.com/mxkissnr/gaggiuino-local-profiler) installed and running
- Home Assistant 2024.1.0 or newer

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

## Options after setup

**Settings → Devices & Services → Gaggiuino Local Profiler → Configure**

| Option | Default | Description |
|---|---|---|
| URL | *(URL entered above)* | URL of the GLP app |
| Poll interval | `60` | Update interval in seconds (10–300) |

## Entities

All sensors/entities update at the poll interval of their respective coordinator: the main coordinator (`coordinator.py`) every 60 seconds (configurable, see above), the live coordinator (`live_coordinator.py`) every 2 seconds during a brew, and the machine coordinator (`machine_coordinator.py`) every 5 seconds for live machine values.

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
| Machine Temperature | Current boiler temperature | °C |
| Machine Target Temperature | Target boiler temperature | °C |
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

With multi-machine mode enabled (app v2.0.0+), a `Reachable` binary sensor is added automatically on its own device for every additional (non-default) machine — reachable/on are currently the only fields the app API (`machines[]` registry) provides per additional machine.

### Binary Sensor

| Entity | Description | Coordinator |
|---|---|---|
| Brewing | `true` during an active brew | Live (2 s) |
| Preheat Ready | `true` once preheat time has elapsed | Main (60 s) |
| Steam Switch | Physical steam switch state of the machine | Machine (5 s) |
| Reachable *(per additional machine)* | Reachability of a non-default machine (multi-machine mode) | Main (60 s) |

### Select

| Entity | Description |
|---|---|
| Profile | Profile selector. The option list comes from the main coordinator (60 s — profiles rarely change), while the currently selected value is read from the machine coordinator (5 s) so a profile switch made directly on the machine reaches HA quickly. Selecting a profile in HA calls `/api/machine/profile/set` on the add-on. |

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
