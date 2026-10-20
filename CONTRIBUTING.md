# Contributing

Bug reports, feature ideas and pull requests are welcome!

## Workflow

1. **Open an issue first** — describe the bug or feature before writing any code
2. **Fork & branch** — `feature/short-description` or `fix/short-description`
3. **Implement** — commit with `Closes #N` in the message
4. **Pull request** — see [Pull requests](#pull-requests) below

## Pull requests

Every PR must:

- **Link an issue** — `Closes #N` in the description (no PRs without a linked issue)
- **Do one thing** — keep the diff focused; split unrelated changes
- **Use a Conventional Commits title in English** — `feat:` `fix:` `docs:` `chore:` `refactor:` `test:` `build:`
- **Explain what and why** in the description, not just what
- **Pass CI** — ruff, pytest, HACS/Hassfest validation and the card checks (lint, typecheck, tests and bundle diff under `cards/`) green before requesting review
- **Update `CHANGELOG.md`** for any user-facing change
- **Update `DOCS.md` and `DOCS.de.md`** together when behaviour or entities change
- **Disclose AI assistance** — see below
- **No real names** in commit messages, PR text, code comments or docs

### AI assistance

Be transparent about AI tool use so reviewers know what they are reviewing.

- **Per commit (machine-readable, required):** every commit an AI tool helped write carries a
  trailer, e.g. `Co-Authored-By: Claude <noreply@anthropic.com>` or
  `Co-Authored-By: Copilot <198982749+Copilot@users.noreply.github.com>`. Claude Code also
  adds a `Claude-Session:` trailer. For this repo the Claude trailer names the specific model,
  e.g. `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (see [CLAUDE.md](CLAUDE.md)).
- **Per PR (summary, required):** the "AI assistance disclosure" section of the PR template —
  one of `none` / `assisted` / `substantial` / `generated`, plus the tool and model names.

CI blocks the PR until the disclosure section is filled in, and fails on a contradiction
(commits carry an AI trailer while the PR claims `none`).

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
| Cards | TypeScript sources in `cards/shot/src` and `cards/order/src`, shared modules (CSS tokens, helpers, icons, contrast, machine lookups) in `cards/shared`. `npm run build` bundles them into `custom_components/gaggiuino_profiler/www/`, and those bundles are committed — never edit them by hand. See [cards/CLAUDE.md](cards/CLAUDE.md) |
| Style | Follows [Home Assistant integration development](https://developers.home-assistant.io/docs/creating_integration_file_structure) conventions |
| Tests | Run `pytest tests/ -q` (pytest-homeassistant-custom-component, with the GLP app API mocked); add a regression test for every bug fix. Testing against a real app instance is still welcome. Card changes also need the checks below in `cards/` |

## Card checks

Both cards live in one Node project, `cards/`. From that directory:

```
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

`lint` runs ESLint over `shot/`, `shared/` and `order/`; `typecheck` runs `tsc --noEmit` for both
cards; `test:coverage` runs the `node --test` suites and enforces 90 % line coverage on `src/`;
`build` regenerates the two bundles in `custom_components/gaggiuino_profiler/www/`. After a build the
working tree must stay clean — if a bundle changed, commit it with the source change.

The e2e smoke tests need a Playwright browser (`npx playwright install chromium`) and run with the
rest of the suite. The README screenshots are regenerated on demand with `npm run screenshot:shot`
and `npm run screenshot:order`; they are not part of CI.

## Dev setup

1. Clone into your HA `custom_components/` directory
2. Restart HA or reload the integration after changes
3. Check `Settings → System → Logs` for errors

## Versioning

`MAJOR.MINOR.PATCH` in `manifest.json`. Patch for fixes, minor for new features.
