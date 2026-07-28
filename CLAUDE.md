# CLAUDE.md — GLP Integration

Working rules for this repo. Mirrors the ecosystem-wide rules the other three GLP
repos already document (full rationale lives in
`gaggiuino-local-profiler/CLAUDE.md`), adapted for this repo being a Python HACS
integration (Home Assistant custom component), not a Node/Vite project — no npm,
no ESLint, no JS i18n files here.

## Language rules

- **Code, comments, commit messages, GitHub issues, PR descriptions** → always English
- **DOCS.md** → English (primary)
- **DOCS.de.md** → German (supplementary, always kept in sync with DOCS.md — same
  heading structure, same section order)

## Workflow

**Issue first, then code.** No implementation without a GitHub issue number in hand.
Only exception: a typo or single-word change.

```
gh issue create --repo mxkissnr/glp-integration --title "..." --label "bug|enhancement" --body "..."
gh project item-add 2 --owner mxkissnr --url <issue-url>
```

Project `2` ("GLP Roadmap", owner `mxkissnr`) is the shared roadmap board for all
four GLP repos — add every new issue to it. Close the issue in the commit message
(`Closes #N`).

## Regression policy

**A fix or feature must never break already-working functionality.** Concretely:

- Before "fixing" something that looks wrong, verify against real ground truth
  (an actual HA instance, existing passing tests, or the add-on's documented API) —
  not just plausible general reasoning.
- When changing a coordinator, sensor description or service handler used by
  multiple entities, check every consumer's assumptions before changing its
  contract.
- Run the full test suite after every change, not just tests related to the
  change; a newly-failing test is a stop condition, not noise to explain away.

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

## Versioning

`MAJOR.MINOR.PATCH` in `custom_components/gaggiuino_profiler/manifest.json`
(`"version"` field) — same disambiguation as the add-on:

- Patch fix → bump third number
- New feature → bump second number
- Breaking change → bump first number (rare)
- **No size carve-out:** any net-new user-facing capability, however small, is a
  feature and gets a minor bump. A round stays patch only if every change in it is
  a pure bugfix/regression-restore with zero new capability.

## Commits

- `CHANGELOG.md` entry in the same commit as the code — never delivered separately
  afterward.
- `DOCS.md` **and** `DOCS.de.md` update in the same commit if the change is
  user-facing (new entity, new service, new option, changed behavior) — both
  languages always in sync.
- **Every commit involving Claude/an AI agent must carry a `Co-Authored-By:`
  trailer naming the specific model, not a bare "Claude".** Format:
  `Co-Authored-By: Claude <model name> <noreply@anthropic.com>`, e.g.
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Release rules

- **A release ends at the GitHub release.** Do NOT deploy to Home Assistant —
  Max installs HACS updates himself.
- Tag and release after the commit:
  ```
  git tag v<version>
  git push origin main
  git push origin v<version>
  gh release create v<version> --title "v<version>" --notes "..."
  ```

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
