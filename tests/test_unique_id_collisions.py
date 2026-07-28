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
"""
from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    MAINTENANCE_SENSORS,
    SENSORS,
)

# Unique_id suffixes hardcoded inline (`_attr_unique_id = f"...{literal}"`)
# rather than sourced from a SensorEntityDescription tuple — #66 is a
# test-only issue (no production refactor), so these can't be imported and
# must be kept in sync by hand. Source of each, as of #66:
#   binary_sensor.py  IsBrewingSensor                     "is_brewing"
#   binary_sensor.py  PreheatReadySensor                  "preheat_ready"
#   binary_sensor.py  SteamSwitchSensor                   "steam_switch"
#   binary_sensor.py  GlpAdditionalMachineReachableSensor "reachable"
#   select.py         GlpProfileSelect                    "profile"
#   update.py         GlpUpdateEntity                     "update"
#   sensor.py         GlpGrinderMaintenanceSensor          "maint_grinders"
#   sensor.py         GlpAdditionalMachineSensor           "status"
#
# When adding a new entity with a hardcoded (non-tuple-sourced) unique_id
# suffix anywhere in this integration, add its literal here too.
MANUAL_LITERAL_KEYS = [
    "is_brewing",
    "preheat_ready",
    "steam_switch",
    "reachable",
    "profile",
    "update",
    "maint_grinders",
    "status",
]


def test_unique_id_keys_are_globally_unique() -> None:
    keys = (
        [d.key for d in SENSORS]
        + [d.key for d in MAINTENANCE_SENSORS]
        + [d.key for d in MACHINE_SENSORS]
        + MANUAL_LITERAL_KEYS
    )
    duplicates = sorted({k for k in keys if keys.count(k) > 1})
    assert len(keys) == len(set(keys)), f"Duplicate unique_id keys found: {duplicates}"
