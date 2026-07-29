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

Follow-up from #74: the hardcoded (non-tuple-sourced) unique_id suffixes
used to be a hand-maintained list (`MANUAL_LITERAL_KEYS`) — the exact
diligence dependency this test exists to guard against. They are now found
by an AST scan (see `_scan_unique_id_suffixes` below), so the set grows on
its own when a new hardcoded suffix is added.

Follow-up from #68: `GlpEntity`/`GlpAdditionalMachineEntity` (entity.py) now
own the actual `self._attr_unique_id = f"..."` assignment, so the per-entity
literal suffix is no longer visible as an assignment in sensor.py/
binary_sensor.py/select.py/update.py — it's the last positional argument of
that entity's `super().__init__(...)` call instead (e.g.
`super().__init__(coordinator, entry, "profile")`). The scanner looks for
that shape instead, gated to classes that actually derive from `GlpEntity`
or `GlpAdditionalMachineEntity` (by base-class name) so it can't pick up an
unrelated `super().__init__(...)` call elsewhere (e.g. a coordinator's).

Two of those suffixes — `GlpAdditionalMachineReachableSensor` ("reachable",
binary_sensor.py) and `GlpAdditionalMachineSensor` ("status", sensor.py) —
are not fixed literals: the real unique_id also interpolates the
runtime-assigned `machine_id` (`f"{entry.entry_id}_{machine_id}_reachable"`,
built inside `GlpAdditionalMachineEntity.__init__`). Treating them as plain
literals would both false-positive against an unrelated key named
"reachable"/"status" and miss the actual collision surface, which depends
on user-supplied machine names/ids a static test cannot see (the risk the
2026-07-28 audit flagged for `GlpAdditionalMachineSensor`). The scanner
classifies these as "machine_scoped" (by their class deriving from
`GlpAdditionalMachineEntity` rather than `GlpEntity`) and — deliberately —
keeps them out of the global uniqueness check below; that machine-scoped
portion of the namespace stays outside this test's reach by design.
"""
from __future__ import annotations

import ast
from pathlib import Path

from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    MAINTENANCE_SENSORS,
    SENSORS,
)

COMPONENT_DIR = (
    Path(__file__).resolve().parents[1] / "custom_components" / "gaggiuino_profiler"
)

_DESCRIPTION_KEY_EXPR = "description.key"

_GLOBAL_BASE = "GlpEntity"
_MACHINE_SCOPED_BASE = "GlpAdditionalMachineEntity"


class _UnrecognisedUniqueIdShape(RuntimeError):
    """Raised when a `super().__init__(...)` call on a GlpEntity/
    GlpAdditionalMachineEntity subclass doesn't match any shape this
    scanner understands, so the test fails loudly instead of silently
    under-counting keys."""


def _base_category(class_def: ast.ClassDef) -> str | None:
    """Classify a class by which entity base it derives from directly,
    or None if it derives from neither (out of scope for this scanner)."""
    for base in class_def.bases:
        root = base.value if isinstance(base, ast.Subscript) else base
        if isinstance(root, ast.Name):
            if root.id == _MACHINE_SCOPED_BASE:
                return "machine_scoped"
            if root.id == _GLOBAL_BASE:
                return "literal"
    return None


def _is_super_init_call(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "__init__"
        and isinstance(node.func.value, ast.Call)
        and isinstance(node.func.value.func, ast.Name)
        and node.func.value.func.id == "super"
    )


def _find_super_init_key(class_def: ast.ClassDef, source: str) -> str | None:
    """Find this class's `__init__` and return the key/suffix passed as the
    last positional argument of its `super().__init__(...)` call, or None
    if the key comes from `description.key` (already covered via the
    SENSORS/... tuple imports, not a hardcoded literal)."""
    init = next(
        (n for n in class_def.body if isinstance(n, ast.FunctionDef) and n.name == "__init__"),
        None,
    )
    if init is None:
        raise _UnrecognisedUniqueIdShape(f"no __init__ found on {source}")

    for node in ast.walk(init):
        if not _is_super_init_call(node):
            continue
        if not node.args:
            raise _UnrecognisedUniqueIdShape(f"super().__init__() with no positional args in {source}")
        last = node.args[-1]
        if isinstance(last, ast.Constant) and isinstance(last.value, str):
            return last.value
        if ast.unparse(last) == _DESCRIPTION_KEY_EXPR:
            return None  # tuple-sourced -- already covered via SENSORS/... imports
        raise _UnrecognisedUniqueIdShape(
            f"unhandled super().__init__() key argument {ast.dump(last)!r} in {source}"
        )
    raise _UnrecognisedUniqueIdShape(f"no super().__init__() call found in {source}")


def _scan_file(path: Path) -> tuple[list[str], list[str]]:
    tree = ast.parse(path.read_text(), filename=str(path))
    literal: list[str] = []
    machine_scoped: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        category = _base_category(node)
        if category is None:
            continue
        key = _find_super_init_key(node, f"{path.name}:{node.lineno}")
        if key is None:
            continue
        (literal if category == "literal" else machine_scoped).append(key)
    return literal, machine_scoped


def _scan_unique_id_suffixes() -> tuple[list[str], list[str]]:
    """Scan every `custom_components/gaggiuino_profiler/*.py` file for
    GlpEntity/GlpAdditionalMachineEntity subclasses and split their
    hardcoded unique_id suffixes into statically-checkable literals and
    machine-scoped patterns (see module docstring).
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
    """Pins the scanner's output as of #74/#68 so a scanner regression (e.g.
    a misconfigured COMPONENT_DIR silently returning nothing) doesn't turn
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
