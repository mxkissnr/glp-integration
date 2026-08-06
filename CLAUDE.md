# CLAUDE.md — GLP Integration

Working rules for this repo (mirrors the app repo's rules; full rationale lives in
`../gaggiuino-local-profiler/CLAUDE.md`), adapted for this repo being a Python HACS
integration (Home Assistant custom component), not a Node/Vite project — no npm,
no ESLint, no JS i18n files here.

- **Language**: code/comments/commits/issues/PRs in English. `DOCS.md` English
  (primary), `DOCS.de.md` German (supplementary, same heading structure, always in sync).
- **Issue first, then code** — no implementation without a GitHub issue number
  (`gh issue create --repo mxkissnr/glp-integration`, add to GLP Roadmap project 2,
  owner mxkissnr). Only exception: typos. Close via `Closes #N` in the commit message.
- **Version**: `MAJOR.MINOR.PATCH` in `custom_components/gaggiuino_profiler/manifest.json`
  (`"version"` field) — patch for fixes, minor for features (no size carve-out).
- **Commits**: `CHANGELOG.md` entry in the same commit as the code; `DOCS.md` **and**
  `DOCS.de.md` update in the same commit if user-facing. Trailer required, model
  spelled out: `Co-Authored-By: Claude <model name> <noreply@anthropic.com>`.
- **Releases** end at the GitHub release; no HA deploy (Max installs HACS updates himself).
  `git tag v<version> && git push origin main && git push origin v<version> && gh release create v<version> ...`

## Regression policy

**A fix or feature must never break already-working functionality.** Verify against
real ground truth (an actual HA instance, existing passing tests, or the add-on's
documented API) before "fixing" something that looks wrong. When changing a
coordinator, sensor description or service handler used by multiple entities, check
every consumer's assumptions before changing its contract.

**Precedent:** the v1.22.1 entity-id collision (#62/#63). `GlpSensor` and its
sibling sensor classes relied on Home Assistant's automatic slugification of the
display name to derive `entity_id`, which is non-deterministic on a slug
collision. Two new preheat sensors added in v1.22.0 got a mangled `entity_id` on
some installs as a result. Fixed by overriding `suggested_object_id` on every
sensor class to derive it from the stable, collision-free programmatic `key`
instead of the display name — the pattern to follow for any new sensor/binary
sensor/select going forward. `entity_id` mistakes here are silent (HA never
renames an already-registered entity), so get this right the first time rather
than patching it after installs are already affected.

## Testing and lint

- **Tests:** `pytest tests/ -q` (config in `pytest.ini`, `asyncio_mode = auto`).
  Must be green after every change; a newly-failing test is a stop condition.
- **Lint:** `ruff check .` (config in `pyproject.toml`: `target-version = "py313"`,
  `line-length = 120`, rule sets `E, F, I, UP, B`). Both are enforced in CI
  (`.github/workflows/validate.yml`), alongside HACS and Hassfest validation.
- Add a regression test for every bug fix, following the existing pattern in
  `tests/` (one `test_*.py` per feature/fix area, e.g.
  `test_sensor_suggested_object_id.py`, `test_orders_api_path_traversal.py`).

## Architecture: three coordinators, three intervals

| File | Interval | Purpose |
|---|---|---|
| `coordinator.py` (`GlpDataCoordinator`) | 60 s (`SCAN_INTERVAL_SECONDS` in `const.py`, user-configurable 10–300 s via the options flow) | Shot history, machine status, maintenance, multi-machine registry — most sensors |
| `live_coordinator.py` (`GlpLiveCoordinator`) | 2 s (`LIVE_INTERVAL_SECONDS` in `const.py`) | Live brewing state (`Brewing` binary sensor) |
| `machine_coordinator.py` (`GlpMachineCoordinator`) | 5 s (`MACHINE_INTERVAL_SECONDS`, defined locally in the file) | Live machine values straight from the Gaggiuino controller (pressure, weight, water level, uptime, active profile, steam switch) |

`orders_api.py` is a separate concern: it's not a coordinator, it's a set of HA
`HomeAssistantView`s that proxy `/api/glp/orders/*`, `/api/glp/shots/*` and
`/api/glp/library/beans-info` to the add-on for the Order Card and Lovelace Card
(zero-config mode). Sub-paths are checked against a fixed allowlist per HTTP
method — see the module docstring and #65 before touching it.

## Gaggiuino project boundaries

GLP is purely a client of the Gaggiuino machine's own WebSocket/REST API (via the
add-on) — never a firmware fork. No active firmware changes, no
embedding/redistributing Gaggiuino's own code or assets in this repo. Gaggiuino's
firmware is CC-BY-NC 4.0; GLP itself stays GPLv3 and non-commercial. Use
"Gaggiuino" as a name/mark only descriptively ("for Gaggiuino machines"), never
implying official affiliation.
