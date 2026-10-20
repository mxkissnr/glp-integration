"""Guard against hand-written JavaScript/TypeScript in this Python-only integration.

The integration code is Python. The two JavaScript bundles under
``custom_components/gaggiuino_profiler/www/`` are build output of the card
sources in ``cards/`` and never edited here. See the "Language rule" section in
``CLAUDE.md``.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
JS_SUFFIXES = (".js", ".mjs", ".cjs", ".ts")
GENERATED_BUNDLES = {
    "custom_components/gaggiuino_profiler/www/glp-card.js",
    "custom_components/gaggiuino_profiler/www/glp-order-card.js",
}


def _tracked_js_files() -> set[str]:
    git = shutil.which("git")
    if git is None or not (REPO_ROOT / ".git").exists():
        pytest.skip("not a git checkout or git is unavailable")
    result = subprocess.run(
        [git, "ls-files"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return {
        line
        for line in result.stdout.splitlines()
        if line.endswith(JS_SUFFIXES) and not line.startswith("cards/")
    }


def test_no_handwritten_js() -> None:
    tracked = _tracked_js_files()
    unexpected = tracked - GENERATED_BUNDLES
    missing = GENERATED_BUNDLES - tracked
    assert tracked == GENERATED_BUNDLES, (
        "The integration is Python only: hand-written JavaScript or TypeScript belongs in cards/ only. "
        f"The only tracked JS/TS files may be the generated card bundles {sorted(GENERATED_BUNDLES)}. "
        f"Unexpected tracked JS/TS file(s): {sorted(unexpected)}. "
        f"Expected bundle(s) no longer tracked: {sorted(missing)}. "
        "Card code lives in cards/ and the bundles are built from it; see the 'Language rule' section in CLAUDE.md."
    )
