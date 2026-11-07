"""#341 (point 6): a machine deleted in the GLP app loses its device.

The multi-machine fan-out in sensor.py/binary_sensor.py only ever adds
entities, so before this a machine removed in the app kept its device with
two permanently unavailable entities and no way to delete it. The device is
now removed once the app's `machines` list is complete and no longer names it,
and `async_remove_config_entry_device` gives the device page a Delete button
for a machine the app no longer lists.

A list only counts as complete when it contains the default machine: the app
returns no list at all when its registry read fails, and an older app may not
know the field. On a failed poll the coordinator keeps its last good data, so
a dead endpoint cannot shrink the list either.
"""
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler import async_remove_config_entry_device
from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints
from tests.test_multi_machine_devices import MACHINES_ONE, MACHINES_TWO

URL = "http://glp.example.com"
HAS_CHILD_DEVICES = hasattr(dr, "ChildDeviceInfo")


async def _setup(hass, aioclient_mock, machines, *, before_setup=None):
    mock_all_coordinator_endpoints(aioclient_mock, URL, status={"machines": machines})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    if before_setup is not None:
        before_setup(entry)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, URL


async def _poll(hass, aioclient_mock, entry, url, **mock_kwargs) -> None:
    aioclient_mock.clear_requests()
    mock_all_coordinator_endpoints(aioclient_mock, url, **mock_kwargs)
    await entry.runtime_data.data.async_refresh()
    await hass.async_block_till_done()


def _machine_device(hass, entry, machine_id):
    registry = dr.async_get(hass)
    identifier = (DOMAIN, f"{entry.entry_id}_{machine_id}")
    if HAS_CHILD_DEVICES:
        return registry.async_get_child_device_by_identifier(identifier, entry.entry_id)
    return registry.async_get_device_by_identifier(identifier, entry.entry_id)


def _group_device(hass, entry, group):
    registry = dr.async_get(hass)
    identifier = (DOMAIN, f"{entry.entry_id}_group_{group}")
    if HAS_CHILD_DEVICES:
        return registry.async_get_child_device_by_identifier(identifier, entry.entry_id)
    return registry.async_get_device_by_identifier(identifier, entry.entry_id)


def _entity_registry_entry(hass, unique_id):
    registry = er.async_get(hass)
    return next((e for e in registry.entities.values() if e.unique_id == unique_id), None)


async def test_machine_deleted_in_the_app_loses_its_device_and_entities(
    hass, strict_aioclient_mock
) -> None:
    entry, url = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    status_entry = _entity_registry_entry(hass, f"{entry.entry_id}_2_status")
    reachable_entry = _entity_registry_entry(hass, f"{entry.entry_id}_2_reachable")
    assert status_entry is not None
    assert reachable_entry is not None
    assert hass.states.get(status_entry.entity_id) is not None
    assert hass.states.get(reachable_entry.entity_id) is not None
    assert _machine_device(hass, entry, 2) is not None

    kept_ids = {entry.runtime_data.parent_device_id}
    kept_ids.update(
        device.id
        for device in (
            _group_device(hass, entry, "shots"),
            _group_device(hass, entry, "maintenance"),
            _group_device(hass, entry, "preheat"),
        )
        if device is not None
    )

    await _poll(hass, strict_aioclient_mock, entry, url, status={"machines": MACHINES_ONE})

    assert _machine_device(hass, entry, 2) is None
    assert _entity_registry_entry(hass, f"{entry.entry_id}_2_status") is None
    assert _entity_registry_entry(hass, f"{entry.entry_id}_2_reachable") is None
    assert hass.states.get(status_entry.entity_id) is None
    assert hass.states.get(reachable_entry.entity_id) is None

    registry = dr.async_get(hass)
    for device_id in kept_ids:
        assert registry.async_get(device_id) is not None


async def test_empty_machine_list_removes_nothing(hass, strict_aioclient_mock) -> None:
    entry, url = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    await _poll(hass, strict_aioclient_mock, entry, url, status={"machines": []})

    assert _machine_device(hass, entry, 2) is not None
    assert _entity_registry_entry(hass, f"{entry.entry_id}_2_status") is not None


async def test_list_without_the_default_machine_removes_nothing(
    hass, strict_aioclient_mock
) -> None:
    entry, url = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    await _poll(hass, strict_aioclient_mock, entry, url, status={"machines": [MACHINES_TWO[1]]})

    assert _machine_device(hass, entry, 2) is not None
    assert _entity_registry_entry(hass, f"{entry.entry_id}_2_status") is not None


async def test_failed_poll_removes_nothing(hass, strict_aioclient_mock) -> None:
    entry, url = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    await _poll(hass, strict_aioclient_mock, entry, url, statuses={"status": 500})

    assert _machine_device(hass, entry, 2) is not None
    assert _entity_registry_entry(hass, f"{entry.entry_id}_2_status") is not None


async def test_machine_deleted_while_home_assistant_was_stopped(
    hass, strict_aioclient_mock
) -> None:
    def _create_old_machine_device(entry) -> None:
        dr.async_get(hass).async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={(DOMAIN, f"{entry.entry_id}_7")},
            name="Old machine",
        )

    entry, _ = await _setup(
        hass, strict_aioclient_mock, MACHINES_ONE, before_setup=_create_old_machine_device
    )

    registry = dr.async_get(hass)
    assert registry.async_get_device_by_identifier(
        (DOMAIN, f"{entry.entry_id}_7"), entry.entry_id
    ) is None


async def test_remove_config_entry_device_refuses_the_glp_device(
    hass, strict_aioclient_mock
) -> None:
    entry, _ = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    registry = dr.async_get(hass)
    glp_device = registry.async_get_device_by_identifier((DOMAIN, entry.entry_id), entry.entry_id)
    assert glp_device is not None
    assert not await async_remove_config_entry_device(hass, entry, glp_device)


async def test_remove_config_entry_device_refuses_the_group_devices(
    hass, strict_aioclient_mock
) -> None:
    entry, _ = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    shots_device = _group_device(hass, entry, "shots")
    if shots_device is not None:
        assert not await async_remove_config_entry_device(hass, entry, shots_device)


async def test_remove_config_entry_device_refuses_a_machine_the_app_still_lists(
    hass, strict_aioclient_mock
) -> None:
    entry, _ = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    device = _machine_device(hass, entry, 2)
    assert device is not None
    assert not await async_remove_config_entry_device(hass, entry, device)


async def test_remove_config_entry_device_allows_a_machine_the_app_no_longer_lists(
    hass, strict_aioclient_mock
) -> None:
    entry, _ = await _setup(hass, strict_aioclient_mock, MACHINES_TWO)

    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, f"{entry.entry_id}_9")},
        name="Gone machine",
    )
    assert await async_remove_config_entry_device(hass, entry, device)
