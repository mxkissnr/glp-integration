# Gaggiuino Local Profiler — Home Assistant Integration

Bindet den [Gaggiuino Local Profiler](https://github.com/mxkissnr/gaggiuino-local-profiler) als native HA-Entities ein — Maschinenstatus, Shotdaten und Live-Brühstatus direkt in Home Assistant, ohne Cloud.

## Voraussetzungen

- [Gaggiuino Local Profiler App](https://github.com/mxkissnr/gaggiuino-local-profiler) installiert und gestartet
- Home Assistant 2024.7.0 oder neuer

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
3. Bei Supervisor-Installationen versucht die Einrichtung zuerst, das Add-on automatisch zu erkennen — auch über das interne Container-Netzwerk, ein gemapter Host-Port ist dafür also nicht mehr erforderlich. Gelingt die automatische Erkennung, wird die Integration ohne weitere Eingabe hinzugefügt.
4. Findet die automatische Erkennung nichts, die URL des GLP-Apps manuell eingeben: `http://localhost:8099`
   > **`localhost` verwenden, nicht `homeassistant.local`** — mDNS-Auflösung schlägt innerhalb von HA OS intermittierend fehl und macht alle Sensoren unavailable. `localhost:8099` funktioniert immer zuverlässig.

Die Integration testet die Verbindung direkt beim Einrichten.

## Mitgelieferte GLP Shot Card

Die [GLP Shot Card](https://github.com/mxkissnr/glp-lovelace-card) (Lovelace-Karte) ist Teil dieser Integration und wird beim Einrichten automatisch als Dashboard-Ressource registriert — keine separate HACS-Installation oder manuelle Ressourcenkonfiguration nötig. Einfach eine Karte mit `type: custom:glp-card` zum Dashboard hinzufügen, nachdem diese Integration installiert ist. (Die [GLP Order Card](https://github.com/mxkissnr/glp-order-card) hat keine Abhängigkeit zu dieser Integration und bleibt eine separate HACS-Installation.)

Ab dem mitgelieferten Build v2.18.0 übernimmt die Karte bei Multi-Machine-Setups außerdem das konfigurierte Farbthema und Icon der jeweiligen Maschine, sodass der Kartenkopf zur angezeigten Maschine passt.

## Optionen nach der Einrichtung

**Einstellungen → Geräte & Dienste → Gaggiuino Local Profiler → Konfigurieren**

| Option | Standard | Beschreibung |
|---|---|---|
| URL | *(eingegebene URL)* | URL des GLP-Apps |
| Poll-Interval | `60` | Aktualisierungsintervall in Sekunden (10–300) |

## Entities

Alle Sensoren/Entities aktualisieren sich mit dem Poll-Intervall des jeweiligen Coordinators: der Haupt-Coordinator (`coordinator.py`) alle 60 Sekunden (konfigurierbar, s.o.), der Live-Coordinator (`live_coordinator.py`) alle 2 Sekunden während eines Bezugs, der Machine-Coordinator (`machine_coordinator.py`) alle 5 Sekunden für Live-Maschinenwerte.

### Verhältnis zu Gaggiuinos eigenen MQTT-Entities

Neuere Gaggiuino-Firmware (ab Build 7889b7d) kann eigene MQTT/Home-Assistant-Autodiscovery-Entities direkt veröffentlichen — Boiler-Temperatur/-Druck/-Flow/-Gewicht, Brüh-/Dampf-/Heißwasser-Status, ein Betriebsmodus-Select, aktives Profil, ein Tara-Button sowie Live-Sensoren während eines laufenden Shots. Diese Integration spricht nie direkt mit der Maschine — sie fragt ausschließlich die REST-API des Add-ons ab —, daher hat das Aktivieren von Firmware-MQTT keinerlei Auswirkung auf diese Integration.

Wer beides aktiviert, sieht scheinbar doppelte Entities (`Machine Live Pressure`/`Machine Live Weight`/`Machine Water Level`/`Machine Temperature`/`Machine Active Profile`/`Operation Mode`/`Tare Scale` überschneiden sich mit den nativen Firmware-Pendants) — das ist erwartet, kein Bug, und beide Sätze können nach Belieben ignoriert/deaktiviert werden. Diese Integration liefert zusätzlich Dinge, die natives Firmware-MQTT nicht bietet: persistente Shot-Historie samt Scoring, Preheat-Scheduling, ein breiteres (5-Aufgaben-) Wartungs-Tracking mit konfigurierbaren Schwellenwerten sowie (seit v1.26.0) die Steuerung von Kessel-/Display-/Waagen-/LED-Einstellungen (Number/Switch/Light) und eine Release-Channel-Auswahl.

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
| Machine Temperature¹ | Aktuelle Kesseltemperatur | °C |
| Machine Target Temperature¹ | Ziel-Kesseltemperatur | °C |
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
| Pump Flow | Live-Durchflussrate der Pumpe | L/min |
| Weight Flow | Live-Durchflussrate an der Waage | g/s |
| Water Temperature | Live-Wassertemperatur (Kessel-Zulauf) | °C |

Bei aktiviertem Multi-Machine-Modus (App v2.0.0+) kommt pro zusätzlicher (nicht-Standard-)Maschine automatisch ein `Reachable`-Binary-Sensor auf einem eigenen Gerät hinzu — reachable/on sind aktuell die einzigen Felder, die die App-API (`machines[]`-Registry) pro Zusatzmaschine liefert.

Das `machines`-Attribut des `Machine Status`-Sensors der Standardmaschine sowie der `Status`-Sensor jeder Zusatzmaschine (seit v1.29.0) liefern zusätzlich ein `theme`-Attribut — das für die jeweilige Maschine in den App-Einstellungen → Maschinen konfigurierte Farbthema, das die mitgelieferten Lovelace-/Order-Karten lesen, um ihren Kartenkopf passend zur Maschine einzufärben.

¹ Wird `unavailable`, sobald die Gaggiuino-Maschine selbst ausgeschaltet oder nicht erreichbar ist — nicht erst, wenn das GLP-Add-on selbst nicht erreichbar ist. Damit lässt sich in Automatisierungen erkennen, ob die Maschine tatsächlich eingeschaltet ist. `Machine Status` ist davon nicht betroffen: er spiegelt den Sync-Link-Zustand des Add-ons, ein eigenständiges Signal.

### Binary Sensor

| Entity | Beschreibung | Coordinator |
|---|---|---|
| Brewing | `true` während eines aktiven Bezugs | Live (2 s) |
| Preheat Ready | `true` sobald die Aufwärmzeit abgelaufen ist | Haupt (60 s) |
| Steam Switch | Physischer Dampf-Schalterzustand der Maschine | Machine (5 s) |
| Thermocouple Faulted² | `true`, wenn der Kessel-Thermofühler einen Fehler meldet (`fault_reason`-Attribut) | Machine (5 s) |
| Pressure Sensor Faulted² | `true`, wenn der Drucksensor einen Fehler meldet (`fault_reason`-Attribut) | Machine (5 s) |
| Boiler Relay² | Rohzustand des Kessel-Heizrelais | Machine (5 s) |
| Valve² | Rohzustand des Brühventils | Machine (5 s) |
| Steam Valve² | Rohzustand des Dampfventils | Machine (5 s) |
| Valve B² | Rohzustand des zweiten Ventils (bei Maschinen mit zweitem Ventil) | Machine (5 s) |
| Steam Boiler Relay² | Rohzustand des Dampfkessel-Relais | Machine (5 s) |
| Reachable *(pro Zusatzmaschine)* | Erreichbarkeit einer nicht-Standard-Maschine (Multi-Machine-Modus) | Haupt (60 s) |

² Diagnose-Entity (Kategorie `diagnostic`, separat gruppiert in der Entity-Liste des Geräts) — Low-Level-Rohzustand, hauptsächlich für die Fehlersuche relevant.

### Select

| Entity | Beschreibung |
|---|---|
| Profile | Profilauswahl. Optionsliste kommt vom Haupt-Coordinator (60 s, Profile ändern sich selten), der aktuell gewählte Wert wird vom Machine-Coordinator (5 s) gelesen, damit ein direkt an der Maschine gewechseltes Profil zügig in HA ankommt. Eine Auswahl in HA ruft `/api/machine/profile/set` am Add-on auf. |
| Operation Mode | `BREW_AUTO` / `FLUSH` / `DESCALE` / `STEAM` / `FLUSH_AUTO` / `HOT_WATER` / `HOME`. `BREW_MANUAL` wird bewusst nicht angeboten — das Add-on lehnt es über `/api/machine/opmode` im Leerlauf ab. Aktueller Wert kommt vom Machine-Coordinator (5 s, via `GET /api/machine/live`). |
| Release Channel³ | Firmware-Update-Kanal `stable` / `test` / `debug`. |

### Light

| Entity | Beschreibung |
|---|---|
| LED | Status-LED der Maschine. RGB-Farbe plus Effekt `Disco`/`None`. |

### Number³

| Entity | Beschreibung | Einheit | Bereich |
|---|---|---|---|
| Steam Set Point | Ziel-Dampftemperatur des Kessels | °C | 100–160 |
| Offset Temperature | Kalibrierungs-Offset der Kesseltemperatur | °C | -10–10 |
| Heating Power | Heizleistung des Kessels | — | 100–1500 |
| Main Divider | PID-Divider des Hauptkessels | — | 1–5 |
| Brew Divider | PID-Divider des Brühkessels | — | 1–5 |
| Startup Heat Delta | Zusätzliche Aufheizreserve beim Start | °C | 0–10 |
| LCD Brightness | Helligkeit des Touchscreens | % | 0–100 |
| LCD Sleep Timeout | Leerlaufzeit bis der Screen schläft | min | 0–120 |
| LCD Go Home Timeout | Leerlaufzeit bis zur Rückkehr zum Startbildschirm | s | 0–60 |
| LED Time-of-Flight Min/Max | Abstandssensor-Schwellenwerte für den Näherungstrigger der LED | — | 0–200 |

### Switch³

| Entity | Beschreibung |
|---|---|
| Brew Delta | Brüh-Temperatur-Delta-Kompensation des Kessels |
| Dream Steam | Dream-Steam-Kesselmodus |
| LCD Dark Mode | Dunkles Touchscreen-Theme |
| LCD Close On Brew Off | Schließt den Brüh-Bildschirm automatisch nach Bezugsende |
| Simple UI | Vereinfachte Touchscreen-Oberfläche |
| Force Predictive Scales | Erzwingt prädiktive Gewichtswerte |
| Hardware Scales Enabled | Fest verbaute (kabelgebundene) Waage |
| Bluetooth Scales Enabled | Bluetooth-Waage |

³ `entity_category: config` — in der UI unter "Konfiguration" des Geräts gruppiert, nicht standardmäßig neben den Alltagssteuerungen sichtbar.

### Button

| Entity | Beschreibung |
|---|---|
| Tare Scale | Fordert eine Waagen-Tarierung an |
| Save Settings | Persistiert alles, was aktuell im RAM angewendet ist, auf den Flash-Speicher. Über die Number-/Switch-/Light-Entities oben geänderte Einstellungen werden bereits über den jeweiligen REST-Aufruf automatisch persistiert — dieser Button ist speziell für Änderungen am Touchscreen/Web-UI der Maschine selbst gedacht, die GLP dauerhaft speichern soll. |
| Save Active Profile | Persistiert das aktuell aktive Profil (samt ID) auf den Flash-Speicher |

Komponenten-Testbuttons (Pumpe/Ventil/Ventil B/LED) sind bewusst nicht enthalten — sie steuern kurzzeitig echte Hardware an und sind gegen den Proxy des Add-ons noch nicht live-verifiziert (`gaggiuino-local-profiler`#600).

Alle Light-/Number-/Switch-/Button-/Select-Entities (Operation Mode, Release Channel) stammen vom `GlpSettingsCoordinator` (30 s) bzw. vom Machine-Coordinator (5 s, nur Operation Mode) und sind vorerst nur für die Standardmaschine verfügbar — gleicher Multi-Machine-Hinweis wie bei den Sensoren oben.

### Update

| Entity | Beschreibung |
|---|---|
| Update (Gaggiuino Local Profiler) | Reine Versionsanzeige für das Add-on selbst. HAs eigene Supervisor-gestützte `update.<slug>_glp_update`-Entity ist diejenige, die Add-on-Updates tatsächlich installiert — diese hier existiert für Installationen ohne Supervisor (reines Docker), wo es diese native Entity nicht gibt. |
| Firmware (Machine Firmware) | Zeigt, ob eine neuere Firmware-Version für die Espressomaschine selbst verfügbar ist — Vergleich der installierten Version gegen das neueste passende Release im eigenen GitHub-Projekt der Firmware. Unterstützt Installation: Auslösen startet den eigenen OTA-Update-Ablauf der Maschine. Es gibt keine Live-Fortschrittsanzeige während des OTA — `installed_version` zieht nach, sobald die Maschine ihre neue Version beim nächsten Poll meldet. Nur für Gaggiuino-Maschinen; bei GaggiMate nicht verfügbar (dort existiert keine entsprechende Prüfung). |

### Umstieg von ALERTua/hass-gaggiuino

Diese Integration deckt inzwischen die Steuerfläche ab, die die Community-Integration bietet: Profilauswahl, Operation Mode, Kessel-/Display-/Waagen-Einstellungen (Number/Switch), die Status-LED (Light), Tare/Save-Settings/Save-Profile (Button), sowie Live-Sensoren/Binary-Sensoren für Durchfluss, Wassertemperatur, Relaiszustände und Sensorfehler (seit v1.25.0). Bei einem Umstieg kann `hass-gaggiuino` entfernt werden, sobald Automatisierungen auf die entsprechenden Entities dieser Integration umgestellt sind — keine Datenmigration nötig, alles hier wird frisch von Maschine/Add-on gelesen.

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
