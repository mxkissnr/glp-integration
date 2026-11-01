"""#336: the default machine's entities are grouped into the child devices
Shots, Maintenance and Preheat instead of all sitting on one device.

Two properties matter and are both checked here:

- Grouping must not move a single entity id. HA derives a fresh entity's
  object id from its device name when `has_entity_name` is set, so without
  pinning it a new install would get `sensor.shots_shot_count` where an
  existing install has `sensor.gaggiuino_local_profiler_shot_count`.
- An existing install keeps its entity ids and unique ids and only sees its
  entities move to the group device.

On HA Core < 2026.9 there is no `ChildDeviceInfo`; the group devices then
fall back to `via_device`-linked devices, like the additional machines (#322).
"""
import re
from unittest import mock

import pytest
from homeassistant.const import EntityCategory, Platform
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler import entity as entity_module
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.sensor import SENSORS, GlpSensor
from tests.common import mock_all_coordinator_endpoints
from tests.test_additional_machine_child_device import _entity_ids_by_unique_id, _main_device

URL = "http://glp.example.com"

HAS_CHILD_DEVICES = hasattr(dr, "ChildDeviceInfo")

MACHINES_ONE = [
    {
        "id": 1,
        "name": "Gaggiuino",
        "type": "gaggiuino",
        "isDefault": True,
        "enabled": True,
        "reachable": True,
        "on": True,
    },
]

GROUPS = ("shots", "maintenance", "preheat")

# Entity ids of every entity this change moves onto a group device. Written
# out instead of derived so a regression shows up as a wrong id, not as a test
# that agrees with the code it is supposed to check.
MOVED_ENTITY_IDS = {
    "sensor.gaggiuino_local_profiler_shot_count",
    "sensor.gaggiuino_local_profiler_shots_today",
    "sensor.gaggiuino_local_profiler_last_shot_profile",
    "sensor.gaggiuino_local_profiler_last_shot_rating",
    "sensor.gaggiuino_local_profiler_last_shot_date",
    "sensor.gaggiuino_local_profiler_last_shot_duration",
    "sensor.gaggiuino_local_profiler_last_shot_pressure",
    "sensor.gaggiuino_local_profiler_last_shot_weight",
    "sensor.gaggiuino_local_profiler_last_shot_ratio",
    "sensor.gaggiuino_local_profiler_last_shot_dose",
    "sensor.gaggiuino_local_profiler_last_shot_coffee",
    "sensor.gaggiuino_local_profiler_last_shot_grinder",
    "sensor.gaggiuino_local_profiler_maint_descaling",
    "sensor.gaggiuino_local_profiler_maint_backflush",
    "sensor.gaggiuino_local_profiler_maint_grouphead",
    "sensor.gaggiuino_local_profiler_maint_gaskets",
    "sensor.gaggiuino_local_profiler_maint_waterfilter",
    "sensor.gaggiuino_local_profiler_maint_grinders",
    "sensor.gaggiuino_local_profiler_preheat_elapsed",
    "sensor.gaggiuino_local_profiler_preheat_remaining",
    "sensor.gaggiuino_local_profiler_preheat_ready_by_target_at",
    "sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at",
    "binary_sensor.gaggiuino_local_profiler_preheat_ready",
}


async def _setup(hass, aioclient_mock):
    mock_all_coordinator_endpoints(aioclient_mock, URL, status={"machines": MACHINES_ONE})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _group_device(hass, entry, group):
    registry = dr.async_get(hass)
    identifier = (DOMAIN, f"{entry.entry_id}_group_{group}")
    if HAS_CHILD_DEVICES:
        return registry.async_get_child_device_by_identifier(identifier, entry.entry_id)
    return registry.async_get_device_by_identifier(identifier, entry.entry_id)


def _registry_entry(hass, entry, key, domain="sensor"):
    registry = er.async_get(hass)
    return registry.async_get_entity_id(domain, DOMAIN, f"{entry.entry_id}_{key}")


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_group_devices_are_children_of_the_glp_device(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    main_device = _main_device(hass, entry)
    names = {}
    for group in GROUPS:
        device = _group_device(hass, entry, group)
        assert isinstance(device, dr.ChildDeviceEntry), group
        assert device.parent_device_id == main_device.id
        names[group] = device.name
    assert names == {"shots": "Shots", "maintenance": "Maintenance", "preheat": "Preheat"}


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_each_entity_lands_on_its_group_device(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    registry = er.async_get(hass)
    expected = {
        "sensor.gaggiuino_local_profiler_last_shot_profile": "shots",
        "sensor.gaggiuino_local_profiler_maint_descaling": "maintenance",
        "sensor.gaggiuino_local_profiler_preheat_remaining": "preheat",
        "binary_sensor.gaggiuino_local_profiler_preheat_ready": "preheat",
    }
    for entity_id, group in expected.items():
        assert registry.async_get(entity_id).device_id == _group_device(hass, entry, group).id, entity_id

    # Everything else stays on the main device.
    machine_status = registry.async_get("sensor.gaggiuino_local_profiler_machine_status")
    assert machine_status.device_id == _main_device(hass, entry).id


async def test_fresh_install_keeps_the_entity_ids_of_an_existing_install(hass, strict_aioclient_mock) -> None:
    """A fresh install must not get `sensor.shots_*` ids: the pinned entity id
    has to win over the device-name-derived one."""
    await _setup(hass, strict_aioclient_mock)

    actual = set(_entity_ids_by_unique_id(hass).values())
    assert MOVED_ENTITY_IDS <= actual
    device_derived = re.compile(r"^(sensor|binary_sensor)\.(shots|maintenance|preheat)_")
    assert not [entity_id for entity_id in actual if device_derived.match(entity_id)], sorted(actual)


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_upgrade_keeps_entity_ids_and_moves_the_entities_to_the_group_device(hass, strict_aioclient_mock) -> None:
    """Existing install: the entities are already registered on the main device
    under their old id. After the upgrade the id and unique id are unchanged
    and only the device moved."""
    mock_all_coordinator_endpoints(strict_aioclient_mock, URL, status={"machines": MACHINES_ONE})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)

    main_device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        name="Gaggiuino Local Profiler",
        manufacturer="Gaggiuino",
        model="Local Profiler",
    )
    registry = er.async_get(hass)
    moved = {
        "preheat_remaining": "gaggiuino_local_profiler_preheat_remaining",
        "maint_descaling": "gaggiuino_local_profiler_maint_descaling",
    }
    for key, object_id in moved.items():
        registry.async_get_or_create(
            "sensor",
            DOMAIN,
            f"{entry.entry_id}_{key}",
            suggested_object_id=object_id,
            config_entry=entry,
            device_id=main_device.id,
        )
    before = {key: _registry_entry(hass, entry, key) for key in moved}
    assert before == {key: f"sensor.{object_id}" for key, object_id in moved.items()}

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    for key, entity_id in before.items():
        item = registry.async_get(entity_id)
        assert item is not None, entity_id
        assert item.unique_id == f"{entry.entry_id}_{key}"
        group = "preheat" if key.startswith("preheat") else "maintenance"
        assert item.device_id == _group_device(hass, entry, group).id


async def test_group_devices_fall_back_to_via_device(hass, strict_aioclient_mock) -> None:
    """HA Core < 2026.9: no ChildDeviceInfo, so the group devices are separate
    devices linked back to the main device -- with the same identifiers."""
    with mock.patch.object(entity_module, "ChildDeviceInfo", None):
        entry = await _setup(hass, strict_aioclient_mock)

    main_device = _main_device(hass, entry)
    for group in GROUPS:
        device = dr.async_get(hass).async_get_device_by_identifier(
            (DOMAIN, f"{entry.entry_id}_group_{group}"), entry.entry_id
        )
        assert isinstance(device, dr.DeviceEntry), group
        assert device.via_device_id == main_device.id

    # The entities are still grouped and keep their ids on that core.
    assert _registry_entry(hass, entry, "preheat_remaining") == "sensor.gaggiuino_local_profiler_preheat_remaining"


def test_grouped_sensor_id_is_pinned_from_the_platform_domain() -> None:
    """The pinned id must not depend on where HA Core defines SensorEntity.

    HA 2026.11 moved the platform base classes into a submodule
    (`homeassistant.components.sensor.entity`), which broke the former
    module-path lookup and crashed the whole platform setup.
    """
    coordinator = mock.MagicMock()
    coordinator.data = {}
    entry = mock.MagicMock()
    entry.entry_id = "test_entry"
    entry.data = {"url": URL}

    description = next(d for d in SENSORS if d.group == "shots")
    sensor = GlpSensor(coordinator, entry, description)
    sensor.pin_grouped_entity_id(Platform.SENSOR.value)

    assert sensor.entity_id == f"sensor.gaggiuino_local_profiler_{description.key}"


async def test_machine_hostname_uptime_and_last_sync_are_diagnostic(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    registry = er.async_get(hass)
    for key in ("last_sync", "machine_url", "machine_uptime"):
        assert registry.async_get(_registry_entry(hass, entry, key)).entity_category is EntityCategory.DIAGNOSTIC
