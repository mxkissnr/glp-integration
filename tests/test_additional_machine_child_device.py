"""#322: additional (non-default) machines from the multi-machine registry are
child devices of the GLP device on HA Core 2026.9+, instead of separate devices
linked back with the `via_device` relationship that HA deprecates in 2026.11.

The child shape must be a drop-in replacement: the extra machine keeps its
device id and its entity ids, so device- and entity-targeted automations keep
working. On cores without `ChildDeviceInfo` (< 2026.9) the previous `via_device`
device is still used, so `hacs.json`'s 2024.7.0 minimum keeps working.

The device-info shape is checked on every core by standing in for
`ChildDeviceInfo`; the registry-level assertions only run where the installed
`DeviceRegistry` has the child-device API.
"""
import logging
from unittest import mock

import pytest
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler import entity as entity_module
from custom_components.gaggiuino_profiler.binary_sensor import GlpAdditionalMachineReachableSensor
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.sensor import GlpAdditionalMachineSensor
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"

HAS_CHILD_DEVICES = hasattr(dr, "ChildDeviceInfo")

MACHINES_TWO = [
    {
        "id": 1,
        "name": "Gaggiuino",
        "type": "gaggiuino",
        "isDefault": True,
        "enabled": True,
        "reachable": True,
        "on": True,
    },
    {
        "id": 2,
        "name": "Kitchen GaggiMate",
        "type": "gaggimate",
        "isDefault": False,
        "enabled": True,
        "reachable": True,
        "on": False,
    },
]


class _RecordingChildDeviceInfo(dict):
    """Stands in for HA Core < 2026.9's missing ChildDeviceInfo, keeping the
    keyword arguments so the test can assert the branch that built it."""

    def __init__(self, **kwargs) -> None:
        super().__init__(kwargs)


async def _setup(hass, strict_aioclient_mock):
    mock_all_coordinator_endpoints(strict_aioclient_mock, URL, status={"machines": MACHINES_TWO})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _main_device(hass, entry):
    return dr.async_get(hass).async_get_device_by_identifier((DOMAIN, entry.entry_id), entry.entry_id)


def _additional_device(hass, entry):
    registry = dr.async_get(hass)
    if HAS_CHILD_DEVICES:
        return registry.async_get_child_device_by_identifier((DOMAIN, f"{entry.entry_id}_2"), entry.entry_id)
    return registry.async_get_device_by_identifier((DOMAIN, f"{entry.entry_id}_2"), entry.entry_id)


def _entity_ids_by_unique_id(hass) -> dict[str, str]:
    return {item.unique_id: item.entity_id for item in er.async_get(hass).entities.values()}


@pytest.mark.parametrize("entity_class", [GlpAdditionalMachineSensor, GlpAdditionalMachineReachableSensor])
def test_additional_machine_device_info_is_a_child_of_the_glp_device(entity_class) -> None:
    """Both entity kinds must build the child shape themselves: the registry
    raises DeviceInfoError when one of them registers a main device for the
    same identifiers."""
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL}, entry_id="entry123")
    with mock.patch.object(entity_module, "ChildDeviceInfo", _RecordingChildDeviceInfo):
        device_info = entity_class(mock.MagicMock(), entry, 2, "Kitchen GaggiMate", "parent-device-id").device_info

    assert device_info["parent_device_id"] == "parent-device-id"
    assert device_info["identifiers"] == {(DOMAIN, "entry123_2")}
    assert device_info["name"] == "Kitchen GaggiMate"
    assert "via_device" not in device_info


def test_additional_machine_device_info_falls_back_to_via_device() -> None:
    """Core < 2026.9 has no ChildDeviceInfo: the previous device shape must be
    produced, with byte-identical identifiers so the device is the same one."""
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL}, entry_id="entry123")
    with mock.patch.object(entity_module, "ChildDeviceInfo", None):
        device_info = GlpAdditionalMachineSensor(
            mock.MagicMock(), entry, 2, "Kitchen GaggiMate", "parent-device-id"
        ).device_info

    assert device_info["identifiers"] == {(DOMAIN, "entry123_2")}
    assert device_info["via_device"] == (DOMAIN, "entry123")
    assert "parent_device_id" not in device_info


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_additional_machine_is_a_child_device_of_the_glp_device(hass, strict_aioclient_mock, caplog) -> None:
    caplog.set_level(logging.WARNING)
    entry = await _setup(hass, strict_aioclient_mock)

    main_device = _main_device(hass, entry)
    child = _additional_device(hass, entry)
    assert isinstance(child, dr.ChildDeviceEntry)
    assert child.id != main_device.id
    assert child.parent_device_id == main_device.id
    assert child.name == "Kitchen GaggiMate"

    # No via_device link left behind for the extra machine (#322).
    assert not [
        device
        for device in dr.async_get(hass).devices
        if device.config_entry_id == entry.entry_id and device.via_device_id
    ]
    # The child path must not reach the registry's deprecated `via_device`
    # parameter either, which HA logs as a deprecation warning from 2026.11.
    assert not [record for record in caplog.records if "via_device" in record.getMessage()]


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_every_entity_of_the_additional_machine_shares_its_child_device(hass, strict_aioclient_mock) -> None:
    """Mixing a ChildDeviceInfo with a main-device DeviceInfo for the same
    identifiers raises DeviceInfoError, so both entities landing on the same
    child device is what proves none of them builds its own DeviceInfo."""
    entry = await _setup(hass, strict_aioclient_mock)

    child = _additional_device(hass, entry)
    registered = {item.unique_id: item for item in er.async_get(hass).entities.values()}
    for unique_id in (f"{entry.entry_id}_2_status", f"{entry.entry_id}_2_reachable"):
        assert registered[unique_id].device_id == child.id


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_existing_via_device_is_converted_to_a_child_device_in_place(hass, strict_aioclient_mock) -> None:
    """Migration: an install that already has the extra machine as its own
    via_device-linked device keeps the device id and both entity ids."""
    with mock.patch.object(entity_module, "ChildDeviceInfo", None):
        entry = await _setup(hass, strict_aioclient_mock)

    registry = dr.async_get(hass)
    old_device = registry.async_get_device_by_identifier((DOMAIN, f"{entry.entry_id}_2"), entry.entry_id)
    assert old_device is not None
    assert old_device.via_device_id == _main_device(hass, entry).id
    entity_ids_before = _entity_ids_by_unique_id(hass)
    assert entity_ids_before[f"{entry.entry_id}_2_status"]
    assert entity_ids_before[f"{entry.entry_id}_2_reachable"]

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    child = _additional_device(hass, entry)
    assert isinstance(child, dr.ChildDeviceEntry)
    assert child.id == old_device.id
    assert child.parent_device_id == _main_device(hass, entry).id
    entity_ids_after = _entity_ids_by_unique_id(hass)
    assert entity_ids_after[f"{entry.entry_id}_2_status"] == entity_ids_before[f"{entry.entry_id}_2_status"]
    assert entity_ids_after[f"{entry.entry_id}_2_reachable"] == entity_ids_before[f"{entry.entry_id}_2_reachable"]


async def test_falls_back_to_via_device_without_child_device_support(hass, strict_aioclient_mock) -> None:
    """No ChildDeviceInfo (HA Core < 2026.9, `hacs.json` keeps a 2024.7.0
    minimum): the extra machine is its own device linked to the main one."""
    with mock.patch.object(entity_module, "ChildDeviceInfo", None):
        entry = await _setup(hass, strict_aioclient_mock)

    device = dr.async_get(hass).async_get_device_by_identifier((DOMAIN, f"{entry.entry_id}_2"), entry.entry_id)
    assert isinstance(device, dr.DeviceEntry)
    assert device.via_device_id == _main_device(hass, entry).id


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_group_devices_and_the_additional_machine_share_one_parent(hass, strict_aioclient_mock) -> None:
    """#336 adds three more child devices next to the extra machine's. They all
    hang off the default-machine device and none of them overlaps another's
    identifiers, which the registry rejects with DeviceInfoError."""
    entry = await _setup(hass, strict_aioclient_mock)

    main_device = _main_device(hass, entry)
    registry = dr.async_get(hass)
    group_device_ids = set()
    for group in ("shots", "maintenance", "preheat"):
        device = registry.async_get_child_device_by_identifier(
            (DOMAIN, f"{entry.entry_id}_group_{group}"), entry.entry_id
        )
        assert isinstance(device, dr.ChildDeviceEntry), group
        assert device.parent_device_id == main_device.id
        group_device_ids.add(device.id)

    machine = _additional_device(hass, entry)
    assert machine.parent_device_id == main_device.id
    assert machine.id not in group_device_ids
    assert len(group_device_ids) == 3

    # Every entity still lands on the device of its own kind.
    registered = {item.unique_id: item for item in er.async_get(hass).entities.values()}
    assert registered[f"{entry.entry_id}_last_shot_profile"].device_id in group_device_ids
    assert registered[f"{entry.entry_id}_2_status"].device_id == machine.id
    assert registered[f"{entry.entry_id}_machine_status"].device_id == main_device.id
