"""Tests for the multi-machine device fan-out (#48): one HA device per
additional (non-default) machine, dynamically added when a coordinator
refresh surfaces a new entry in coordinator.data["machines"] (the app's
GET /api/status array, added in GLP #317 / surfaced by the coordinator
since #47). Also covers the maintenance_done/backup services' new optional
`machine` field.

Scope note (see the comment in sensor.py's async_setup_entry): additional
machines only get a "Status" sensor + "Reachable" binary_sensor sourced
from machines[] itself -- not a full mirror of the default machine's
shot/maintenance/live sensors, since those app endpoints aren't
machine-scoped yet. These tests only cover what was actually built.
"""
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

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
MACHINES_TWO = MACHINES_ONE + [
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


def _mock_all_coordinator_endpoints(aioclient_mock, url: str, status_json: dict) -> None:
    aioclient_mock.get(f"{url}/api/status", json=status_json)
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json={})
    aioclient_mock.get(f"{url}/api/machine/profiles", json={})
    aioclient_mock.get(f"{url}/api/menu", json=[])
    aioclient_mock.get(f"{url}/api/version", json={})
    aioclient_mock.get(f"{url}/api/live/data", json={})
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": False})


async def _setup_entry(hass, aioclient_mock, status_json: dict):
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url, status_json)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


def _entity_by_unique_id(hass, unique_id: str):
    registry = er.async_get(hass)
    return next((e for e in registry.entities.values() if e.unique_id == unique_id), None)


async def test_no_additional_devices_on_single_machine_install(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_ONE})
    assert _entity_by_unique_id(hass, f"{entry.entry_id}_2_status") is None


async def test_additional_machine_gets_a_status_sensor_and_reachable_binary_sensor(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_TWO})

    sensor_entry = _entity_by_unique_id(hass, f"{entry.entry_id}_2_status")
    assert sensor_entry is not None
    state = hass.states.get(sensor_entry.entity_id)
    assert state is not None
    assert state.state == "configured"  # enabled, reachable, not currently on
    assert state.attributes["type"] == "gaggimate"

    binary_entry = _entity_by_unique_id(hass, f"{entry.entry_id}_2_reachable")
    assert binary_entry is not None
    binary_state = hass.states.get(binary_entry.entity_id)
    assert binary_state.state == "on"  # reachable: True


async def test_additional_machine_device_is_separate_from_and_linked_to_the_default_device(
    hass, aioclient_mock
) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_TWO})
    from homeassistant.helpers import device_registry as dr
    registry = dr.async_get(hass)

    default_device = registry.async_get_device_by_identifier((DOMAIN, entry.entry_id), entry.entry_id)
    additional_device = registry.async_get_device_by_identifier((DOMAIN, f"{entry.entry_id}_2"), entry.entry_id)
    assert default_device is not None
    assert additional_device is not None
    assert additional_device.id != default_device.id
    assert additional_device.via_device_id == default_device.id
    assert additional_device.name == "Kitchen GaggiMate"


async def test_default_machine_unique_ids_are_unchanged_when_a_second_machine_exists(hass, aioclient_mock) -> None:
    """The whole point of #48's design: the default machine keeps its
    original {entry_id}_{key} unique_ids, with no {machine_id} segment,
    even once additional machines are registered — existing dashboards
    never break."""
    entry, _ = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_TWO})
    assert _entity_by_unique_id(hass, f"{entry.entry_id}_machine_status") is not None
    assert _entity_by_unique_id(hass, f"{entry.entry_id}_shot_count") is not None


async def test_new_machine_added_at_runtime_gets_its_entity_without_reload(hass, aioclient_mock) -> None:
    """Machines can be added via the app's Settings UI (#319) after HA
    already set up the integration — the dynamic coordinator-listener
    wiring must pick up a newly appeared machines[] entry on the next
    refresh, no HA restart/entry reload required."""
    entry, url = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_ONE})
    assert _entity_by_unique_id(hass, f"{entry.entry_id}_2_status") is None

    # Simulate the app registering a second machine: next poll returns it.
    aioclient_mock.clear_requests()
    _mock_all_coordinator_endpoints(aioclient_mock, url, {"machines": MACHINES_TWO})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    await coordinator.async_refresh()
    await hass.async_block_till_done()

    assert _entity_by_unique_id(hass, f"{entry.entry_id}_2_status") is not None


async def test_maintenance_done_service_appends_machine_query_param(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_TWO})
    aioclient_mock.post(f"{url}/api/maintenance/descaling/done?machine=2", json={"ok": True})

    await hass.services.async_call(
        DOMAIN, "maintenance_done", {"task": "descaling", "machine": 2}, blocking=True
    )
    await hass.async_block_till_done()

    called_urls = [str(call[1]) for call in aioclient_mock.mock_calls]
    assert any(u.endswith("/api/maintenance/descaling/done?machine=2") for u in called_urls)


async def test_maintenance_done_service_omits_query_param_when_machine_not_given(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_ONE})
    aioclient_mock.post(f"{url}/api/maintenance/descaling/done", json={"ok": True})

    await hass.services.async_call(DOMAIN, "maintenance_done", {"task": "descaling"}, blocking=True)
    await hass.async_block_till_done()

    called_urls = [str(call[1]) for call in aioclient_mock.mock_calls]
    assert any(u.endswith("/api/maintenance/descaling/done") and "machine=" not in u for u in called_urls)


async def test_backup_service_appends_machine_query_param(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock, {"machines": MACHINES_TWO})
    aioclient_mock.get(f"{url}/api/backup?machine=2", json={"shots": []})

    await hass.services.async_call(DOMAIN, "backup", {"machine": 2}, blocking=True)
    await hass.async_block_till_done()

    called_urls = [str(call[1]) for call in aioclient_mock.mock_calls]
    assert any(u.endswith("/api/backup?machine=2") for u in called_urls)
