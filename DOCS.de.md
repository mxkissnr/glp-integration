# Gaggiuino Local Profiler — Home Assistant Integration

Bindet den [Gaggiuino Local Profiler](https://github.com/mxkissnr/gaggiuino-local-profiler) als native HA-Entities ein — Maschinenstatus, Shotdaten und Live-Brühstatus direkt in Home Assistant, ohne Cloud.

## Voraussetzungen

- [Gaggiuino Local Profiler App](https://github.com/mxkissnr/gaggiuino-local-profiler) installiert und gestartet
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
3. URL des GLP-Apps eingeben: `http://localhost:8099`
   > **`localhost` verwenden, nicht `homeassistant.local`** — mDNS-Auflösung schlägt innerhalb von HA OS intermittierend fehl und macht alle Sensoren unavailable. `localhost:8099` funktioniert immer zuverlässig.

Die Integration testet die Verbindung direkt beim Einrichten.

## Optionen nach der Einrichtung

**Einstellungen → Geräte & Dienste → Gaggiuino Local Profiler → Konfigurieren**

| Option | Standard | Beschreibung |
|---|---|---|
| URL | *(eingegebene URL)* | URL des GLP-Apps |
| Poll-Interval | `60` | Aktualisierungsintervall in Sekunden (10–300) |

## Entities

Alle Sensoren/Entities aktualisieren sich mit dem Poll-Intervall des jeweiligen Coordinators: der Haupt-Coordinator (`coordinator.py`) alle 60 Sekunden (konfigurierbar, s.o.), der Live-Coordinator (`live_coordinator.py`) alle 2 Sekunden während eines Bezugs, der Machine-Coordinator (`machine_coordinator.py`) alle 5 Sekunden für Live-Maschinenwerte.

### Sensoren

| Entity | Beschreibung | Einheit |
|---|---|---|
| Machine Status | `online` / `error` | — |
| Shot Count | Gesamtzahl der gespeicherten Shots | shots |
| Shots Today | Anzahl der heutigen Bezüge | shots |
| Last Shot Profile | Name des Extraktionsprofils | — |
| Last Shot Rating | Manuelle Sterne-Bewertung des letzten Shots (Annotation, kein automatischer Score) | ★ |
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
| Machine Temperature | Aktuelle Kesseltemperatur | °C |
| Machine Target Temperature | Ziel-Kesseltemperatur | °C |
| Preheat Elapsed | Verstrichene Aufwärmzeit | s |
| Preheat Remaining | Verbleibende Zeit bis Aufwärmbereitschaft | s |
| Preheat Ready By | Geplanter Zielzeitpunkt für Aufwärmbereitschaft (`set_ready_by`-Dienst) | — |
| Preheat Planned Switch On | Geplanter Einschaltzeitpunkt, um das Ready-By-Ziel zu erreichen | — |
| Maintenance Descaling / Backflush / Group Head / Gaskets / Water Filter | Status (`status`-Attribut) der jeweiligen Wartungsaufgabe, inkl. Attributen `days_since`, `shots_since`, `last_date`, `pct` | — |
| Maintenance Grinders | Wartungsstatus je konfigurierte Mühle (`grinder_maintenance_details`-Attribut) | — |
| Machine Live Pressure | Live-Druck direkt von der Maschine (Machine-Coordinator) | bar |
| Machine Water Level | Live-Wasserstand | % |
| Machine Live Weight | Live-Gewicht auf der Waage | g |
| Machine Uptime | Betriebszeit des Controllers seit letztem Neustart | s |
| Machine Active Profile | Aktuell auf der Maschine aktives Profil | — |

Bei aktiviertem Multi-Machine-Modus (App v2.0.0+) kommt pro zusätzlicher (nicht-Standard-)Maschine automatisch ein `Reachable`-Binary-Sensor auf einem eigenen Gerät hinzu — reachable/on sind aktuell die einzigen Felder, die die App-API (`machines[]`-Registry) pro Zusatzmaschine liefert.

### Binary Sensor

| Entity | Beschreibung | Coordinator |
|---|---|---|
| Brewing | `true` während eines aktiven Bezugs | Live (2 s) |
| Preheat Ready | `true` sobald die Aufwärmzeit abgelaufen ist | Haupt (60 s) |
| Steam Switch | Physischer Dampf-Schalterzustand der Maschine | Machine (5 s) |
| Reachable *(pro Zusatzmaschine)* | Erreichbarkeit einer nicht-Standard-Maschine (Multi-Machine-Modus) | Haupt (60 s) |

### Select

| Entity | Beschreibung |
|---|---|
| Profile | Profilauswahl. Optionsliste kommt vom Haupt-Coordinator (60 s, Profile ändern sich selten), der aktuell gewählte Wert wird vom Machine-Coordinator (5 s) gelesen, damit ein direkt an der Maschine gewechseltes Profil zügig in HA ankommt. Eine Auswahl in HA ruft `/api/machine/profile/set` am Add-on auf. |

## Dienste

Neben den Entities registriert die Integration drei HA-Dienste (`gaggiuino_profiler.<name>`):

| Dienst | Beschreibung |
|---|---|
| `backup` | Exportiert ein vollständiges GLP-Backup (Shots, Annotationen, Kaffeebibliothek, Blockliste, Papierkorb) über `/api/backup` und schreibt es nach `<config>/glp_backups/`. Feuert danach `gaggiuino_profiler_backup_created` mit dem Dateipfad. |
| `maintenance_done` | Markiert eine Wartungsaufgabe (`task`: `descaling`, `backflush`, `grouphead`, `gaskets`, `waterfilter` oder `grinder_<id>`) als erledigt und setzt ihren Timer zurück. Wird von der GLP Lovelace-Karte genutzt. |
| `set_ready_by` | Plant, dass die Maschine bis zu einer Zielzeit (`target_time`) vorgeheizt und bereit ist, über `/api/preheat/ready-by`. Ohne `target_time` wird eine geplante Aufwärmung storniert. Schlägt fehl, wenn das Preheat-Switch-Entity oder der App-Token der App nicht konfiguriert ist. |

Alle drei Dienste akzeptieren optional ein `machine`-Feld (Maschinen-ID aus der Multi-Machine-Registry) — dieses wird zwar bereits als `?machine=<id>`-Query-Parameter mitgeschickt, hat aber noch keine Wirkung, da die entsprechenden App-Endpunkte den Parameter Stand App v2.0.0 noch nicht auswerten. Ohne `machine` wirken alle drei Dienste auf die Standardmaschine (aktuell einziges unterstütztes Verhalten).

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
  rating: 4
  coffee: "Ethiopia Yirgacheffe"
  grinder: "DF64"
```

`rating` ist die manuelle Sterne-Bewertung aus der Shot-Annotation (`null`, falls (noch) nicht gesetzt) — kein automatisch berechneter Score.

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
