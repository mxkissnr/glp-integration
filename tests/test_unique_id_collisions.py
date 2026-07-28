"""Regression test for #66: every entity's unique_id is built as
`f"{entry.entry_id}_{key}"` (or an equivalent hardcoded suffix) — a single
namespace shared across sensor.py, binary_sensor.py, select.py and update.py.
Two entities landing on the same key silently collide into one entity_id.
This is the exact failure class that went undetected for seven releases and
was ultimately the root cause of the ready-by timer round (#62/#63, see
tests/test_sensor_suggested_object_id.py for the id-mapping regression test
that came out of it) — this test instead asserts the key *set* itself is
collision-free, independent of any single mapping.

SENSORS/MAINTENANCE_SENSORS/MACHINE_SENSORS are imported directly so this
test grows automatically when an entry is added to one of those tuples.

Follow-up from #74: the hardcoded (non-tuple-sourced) `_attr_unique_id`
suffixes used to be a hand-maintained list (`MANUAL_LITERAL_KEYS`) — the
exact diligence dependency this test exists to guard against. They are now
found by scanning `custom_components/gaggiuino_profiler/*.py` for
`self._attr_unique_id = f"..."` assignments (AST-based; see
`_scan_unique_id_suffixes` below), so the set grows on its own when a new
hardcoded suffix is added.

Two of those suffixes — `GlpAdditionalMachineReachableSensor` ("reachable",
binary_sensor.py) and `GlpAdditionalMachineSensor` ("status", sensor.py) —
are not fixed literals: the real unique_id also interpolates the
runtime-assigned `machine_id` (`f"{entry.entry_id}_{machine_id}_reachable"`).
Treating them as plain literals would both false-positive against an
unrelated key named "reachable"/"status" and miss the actual collision
surface, which depends on user-supplied machine names/ids a static test
cannot see (the risk the 2026-07-28 audit flagged for
`GlpAdditionalMachineSensor`). The scanner classifies these as
"machine_scoped" and — deliberately — keeps them out of the global
uniqueness check below; that machine-scoped portion of the namespace stays
outside this test's reach by design.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    MAINTENANCE_SENSORS,
    SENSORS,
)

COMPONENT_DIR = (
    Path(__file__).resolve().parents[1] / "custom_components" / "gaggiuino_profiler"
)

_ENTRY_ID_EXPR = "entry.entry_id"
_DESCRIPTION_KEY_EXPR = "description.key"


class _UnrecognisedUniqueIdShape(RuntimeError):
    """Raised when a `_attr_unique_id` assignment doesn't match any shape
    this scanner understands, so the test fails loudly instead of silently
    under-counting keys."""


def _classify_joined_str(node: ast.JoinedStr, source: str) -> tuple[str, str | None]:
    """Classify one f-string RHS of a `_attr_unique_id` assignment.

    Returns ("literal", suffix) for a fixed suffix that belongs in the
    global collision set, ("tuple_sourced", None) when the suffix comes
    from `description.key` (already covered via the SENSORS/... imports),
    or ("machine_scoped", suffix) when a runtime id (e.g. `machine_id`) is
    interpolated ahead of/around a literal tail.
    """
    literal_parts: list[str] = []
    seen_entry_id = False
    machine_scoped = False

    for value in node.values:
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            literal_parts.append(value.value)
        elif isinstance(value, ast.FormattedValue):
            expr = ast.unparse(value.value)
            if expr == _ENTRY_ID_EXPR and not seen_entry_id:
                seen_entry_id = True
                continue
            if expr == _DESCRIPTION_KEY_EXPR:
                return "tuple_sourced", None
            machine_scoped = True
        else:
            raise _UnrecognisedUniqueIdShape(
                f"unhandled f-string component {ast.dump(value)!r} in {source}"
            )

    if not seen_entry_id:
        raise _UnrecognisedUniqueIdShape(
            f"_attr_unique_id f-string without an {_ENTRY_ID_EXPR} prefix in {source}"
        )

    suffix = "".join(literal_parts).strip("_")
    return ("machine_scoped" if machine_scoped else "literal"), suffix


_ASSIGN_LINE_RE = re.compile(
    r'_attr_unique_id\s*=\s*f(?P<quote>["\'])\{entry\.entry_id\}(?P<rest>[^"\']*)(?P=quote)'
)
_BRACE_RE = re.compile(r"\{([^}]+)\}")


def _scan_file_regex_fallback(path: Path) -> tuple[list[str], list[str]]:
    """Regex fallback used only when `ast.parse` cannot parse the file.

    Kept deliberately simple: a source file that fails to parse already
    fails ruff and HA's own import of the integration, so this path exists
    for defense-in-depth rather than as the primary mechanism.
    """
    literal: list[str] = []
    machine_scoped: list[str] = []
    for match in _ASSIGN_LINE_RE.finditer(path.read_text()):
        rest = match.group("rest")
        exprs = _BRACE_RE.findall(rest)
        if _DESCRIPTION_KEY_EXPR in exprs:
            continue
        suffix = _BRACE_RE.sub("", rest).strip("_")
        (machine_scoped if exprs else literal).append(suffix)
    return literal, machine_scoped


def _scan_file(path: Path) -> tuple[list[str], list[str]]:
    try:
        tree = ast.parse(path.read_text(), filename=str(path))
    except SyntaxError:
        return _scan_file_regex_fallback(path)

    literal: list[str] = []
    machine_scoped: list[str] = []
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Attribute)
            and node.targets[0].attr == "_attr_unique_id"
        ):
            continue
        value = node.value
        if not isinstance(value, ast.JoinedStr):
            raise _UnrecognisedUniqueIdShape(
                f"_attr_unique_id assigned a non-f-string at {path.name}:{node.lineno}"
            )
        kind, suffix = _classify_joined_str(value, f"{path.name}:{node.lineno}")
        if kind == "literal":
            literal.append(suffix)
        elif kind == "machine_scoped":
            machine_scoped.append(suffix)
        # "tuple_sourced" -> already covered by the SENSORS/... imports, skip

    return literal, machine_scoped


def _scan_unique_id_suffixes() -> tuple[list[str], list[str]]:
    """Scan every `custom_components/gaggiuino_profiler/*.py` file for
    `self._attr_unique_id = f"..."` assignments and split their suffixes
    into statically-checkable literals and machine-scoped patterns (see
    module docstring).
    """
    literal: list[str] = []
    machine_scoped: list[str] = []
    for path in sorted(COMPONENT_DIR.glob("*.py")):
        file_literal, file_machine_scoped = _scan_file(path)
        literal.extend(file_literal)
        machine_scoped.extend(file_machine_scoped)
    return literal, machine_scoped


def test_unique_id_keys_are_globally_unique() -> None:
    literal_suffixes, _machine_scoped = _scan_unique_id_suffixes()
    keys = (
        [d.key for d in SENSORS]
        + [d.key for d in MAINTENANCE_SENSORS]
        + [d.key for d in MACHINE_SENSORS]
        + literal_suffixes
    )
    duplicates = sorted({k for k in keys if keys.count(k) > 1})
    assert len(keys) == len(set(keys)), f"Duplicate unique_id keys found: {duplicates}"


def test_scanner_finds_expected_suffixes() -> None:
    """Pins the scanner's output as of #74 so a scanner regression (e.g. a
    misconfigured COMPONENT_DIR silently returning nothing) doesn't turn
    into a silent false negative in the uniqueness test above."""
    literal_suffixes, machine_scoped = _scan_unique_id_suffixes()
    assert set(literal_suffixes) == {
        "is_brewing",
        "preheat_ready",
        "steam_switch",
        "profile",
        "update",
        "maint_grinders",
    }
    assert set(machine_scoped) == {"reachable", "status"}
