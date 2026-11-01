"""#322: additional (non-default) machines from the multi-machine registry are
child devices of the GLP device on HA Core 2026.9+, instead of separate devices
linked back with the `via_device` relationship that HA deprecates in 2026.11.

The child shape must be a drop-in replacement: the extra machine keeps its
device id and its entity ids, so device- and entity-targeted automations keep
working. On older cores (`ChildDeviceInfo` missing) the previous `via_device`
device is still used, so `hacs.json`'s 2024.7.0 minimum keeps working.
"""
import logging
from unittest import mock

from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler import entity as entity_module
from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"

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


async def _setup(hass, strict_aioclient_mock):
    mock_all_coordinator_endpoints(strict_aioclient_mock, URL, status={"machines": MACHINES_TWO})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _main_device(hass, entry):
    return dr.async_get(hass).async_get_device_by_identifier((DOMAIN, entry.entry_id), entry.entry_id)


def _child_device(hass, entry):
    return dr.async_get(hass).async_get_child_device_by_identifier(
        (DOMAIN, f"{entry.entry_id}_2"), entry.entry_id
    )


def _entity_ids_by_unique_id(hass) -> dict[str, str]:
    return {registered.unique_id: registered.entity_id for registered in er.async_get(hass).entities.values()}


async def test_additional_machine_is_a_child_device_of_the_glp_device(hass, strict_aioclient_mock, caplog) -> None:
    caplog.set_level(logging.WARNING)
    entry = await _setup(hass, strict_aioclient_mock)

    main_device = _main_device(hass, entry)
    child = _child_device(hass, entry)
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
    assert not [record for record in caplog.records if "via_device" in record.getMessage()]


async def test_every_entity_of_the_additional_machine_shares_its_child_device(hass, strict_aioclient_mock) -> None:
    """Mixing a ChildDeviceInfo with a main-device DeviceInfo for the same
    identifiers raises DeviceInfoError, so both entities landing on the same
    child device is what proves none of them builds its own DeviceInfo."""
    entry = await _setup(hass, strict_aioclient_mock)

    child = _child_device(hass, entry)
    registered = {item.unique_id: item for item in er.async_get(hass).entities.values()}
    for unique_id in (f"{entry.entry_id}_2_status", f"{entry.entry_id}_2_reachable"):
        assert registered[unique_id].device_id == child.id


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

    child = _child_device(hass, entry)
    assert isinstance(child, dr.ChildDeviceEntry)
    assert child.id == old_device.id
    assert child.parent_device_id == _main_device(hass, entry).id
    entity_ids_after = _entity_ids_by_unique_id(hass)
    assert entity_ids_after[f"{entry.entry_id}_2_status"] == entity_ids_before[f"{entry.entry_id}_2_status"]
    assert entity_ids_after[f"{entry.entry_id}_2_reachable"] == entity_ids_before[f"{entry.entry_id}_2_reachable"]


async def test_falls_back_to_via_device_without_child_device_support(hass, strict_aioclient_mock) -> None:
    """HA Core < 2026.9 has no ChildDeviceInfo: the previous device shape must
    still be produced (hacs.json keeps a 2024.7.0 minimum)."""
    with mock.patch.object(entity_module, "ChildDeviceInfo", None):
        entry = await _setup(hass, strict_aioclient_mock)

    registry = dr.async_get(hass)
    device = registry.async_get_device_by_identifier((DOMAIN, f"{entry.entry_id}_2"), entry.entry_id)
    assert isinstance(device, dr.DeviceEntry)
    assert device.via_device_id == _main_device(hass, entry).id
    assert _child_device(hass, entry) is None
