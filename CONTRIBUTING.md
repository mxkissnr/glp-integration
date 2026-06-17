# Contributing

Bug reports, feature ideas and pull requests are welcome!

## Workflow

1. **Open an issue first** — describe the bug or feature before writing any code
2. **Fork & branch** — `feature/short-description` or `fix/short-description`
3. **Implement** — commit with `Closes #N` in the message
4. **Pull request** — reference the issue; keep PRs focused on one thing

## Reporting a bug

Include:
- Integration version (visible in `custom_components/gaggiuino_profiler/manifest.json`)
- GLP app version
- Expected vs. actual behaviour
- Relevant Home Assistant log output (`Settings → System → Logs`)

## Code notes

| Area | Details |
|---|---|
| Coordinators | `coordinator.py` (60 s), `live_coordinator.py` (2 s), `machine_coordinator.py` (5 s) |
| Platforms | `sensor.py`, `binary_sensor.py`, `select.py` — one file per HA platform |
| Style | Follows [Home Assistant integration development](https://developers.home-assistant.io/docs/creating_integration_file_structure) conventions |
| Tests | Test against a real GLP app instance; no mock-based test suite yet |

## Dev setup

1. Clone into your HA `custom_components/` directory
2. Restart HA or reload the integration after changes
3. Check `Settings → System → Logs` for errors

## Versioning

`MAJOR.MINOR.PATCH` in `manifest.json`. Patch for fixes, minor for new features.
