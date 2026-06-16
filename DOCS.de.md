# Gaggiuino Local Profiler — Home Assistant Integration

Bindet den [Gaggiuino Local Profiler](https://github.com/mxkissnr/gaggiuino-local-profiler) als native HA-Entities ein — Maschinenstatus, Shotdaten und Live-Brühstatus direkt in Home Assistant, ohne Cloud.

## Voraussetzungen

- [Gaggiuino Local Profiler Add-on](https://github.com/mxkissnr/gaggiuino-local-profiler) installiert und gestartet
- Home Assistant 2024.1.0 oder neuer

## Installation

### HACS (empfohlen)

1. HACS → Integrationen → ⋮ → **Benutzerdefinierte Repositories**
2. URL `https://github.com/mxkissnr/glp-integration` als **Integration** hinzufügen
3. Nach *Gaggiuino Local Profiler* suchen und installieren
4. Home Assistant neu starten

### Manuell

1. Den Ordner `custom_components/gaggiuino_profiler/` in `config/custom_components/` kopieren
2. Home Assistant neu starten

## Einrichtung

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**
2. Nach *Gaggiuino Local Profiler* suchen
3. URL des GLP-Add-ons eingeben: `http://localhost:8099`
   > **`localhost` verwenden, nicht `homeassistant.local`** — mDNS-Auflösung schlägt innerhalb von HA OS intermittierend fehl und macht alle Sensoren unavailable. `localhost:8099` funktioniert immer zuverlässig.

Die Integration testet die Verbindung direkt beim Einrichten.

## Optionen nach der Einrichtung

**Einstellungen → Geräte & Dienste → Gaggiuino Local Profiler → Konfigurieren**

| Option | Standard | Beschreibung |
|---|---|---|
| URL | *(eingegebene URL)* | URL des GLP-Add-ons |
| Poll-Interval | `60` | Aktualisierungsintervall in Sekunden (10–300) |

## Entities

### Sensoren

| Entity | Beschreibung | Einheit |
|---|---|---|
| Machine Status | `online` / `error` | — |
| Shot Count | Gesamtzahl der gespeicherten Shots | shots |
| Shots Today | Anzahl der heutigen Bezüge | shots |
| Last Shot Profile | Name des Extraktionsprofils | — |
| Last Shot Score | Automatischer 0–100-Score | — |
| Last Shot Date | Zeitstempel des letzten Shots | — |
| Last Shot Duration | Bezugsdauer | s |
| Last Shot Avg Pressure | Durchschnittlicher Extraktionsdruck | bar |
| Last Shot Yield | Ausbeute (Output-Gewicht) | g |
| Last Shot Brew Ratio | Yield ÷ Dose | — |
| Last Shot Dose | Einwaage (Input-Gewicht) | g |
| Last Shot Coffee | Kaffee-Annotation | — |
| Last Shot Grinder | Grinder-Annotation | — |
| Last Sync | Zeitstempel der letzten Synchronisation | — |
| Machine Hostname | Hostname des Gaggiuino-Controllers | — |

### Binary Sensor

| Entity | Beschreibung | Aktualisierung |
|---|---|---|
| Brewing | `true` während eines aktiven Bezugs | alle 2 Sekunden |

## HA-Event: `gaggiuino_profiler_shot_completed`

Nach jedem abgeschlossenen Bezug wird dieses Event gefeuert. Es enthält alle relevanten Shotdaten:

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

### Automationsbeispiele

**Benachrichtigung nach jedem Shot:**
```yaml
automation:
  trigger:
    platform: event
    event_type: gaggiuino_profiler_shot_completed
  action:
    service: notify.mobile_app
    data:
      title: "☕ Shot abgeschlossen"
      message: >
        {{ trigger.event.data.profile }} –
        {{ trigger.event.data.duration_s }}s,
        Ratio 1:{{ trigger.event.data.ratio }}
```

**Licht nach Bezug dimmen:**
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
      entity_id: light.kueche
    data:
      brightness_pct: 30
```

## Diagnose

**Einstellungen → Geräte & Dienste → Gaggiuino Local Profiler → Gerät → Diagnose herunterladen**

Die Diagnosedatei enthält die aktuellen Coordinator-Daten (ohne sensible Informationen) und erleichtert das Melden von Issues.
