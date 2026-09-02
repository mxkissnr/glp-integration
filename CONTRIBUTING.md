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
- **Pass CI** — ruff, pytest and HACS/Hassfest validation green before requesting review
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
| Style | Follows [Home Assistant integration development](https://developers.home-assistant.io/docs/creating_integration_file_structure) conventions |
| Tests | Test against a real GLP app instance; no mock-based test suite yet |

## Dev setup

1. Clone into your HA `custom_components/` directory
2. Restart HA or reload the integration after changes
3. Check `Settings → System → Logs` for errors

## Versioning

`MAJOR.MINOR.PATCH` in `manifest.json`. Patch for fixes, minor for new features.
