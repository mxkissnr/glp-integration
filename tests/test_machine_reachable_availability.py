"""Regression test for #106: sensors sourced from live machine values
(machine_temperature, machine_target_temperature) must go unavailable when
the add-on reports the physical Gaggiuino machine as unreachable
(GET /api/status "machineReachable": false), instead of holding their last
value forever as long as the add-on's own HTTP endpoint keeps responding.

Unrelated sensors -- including machine_status, which reflects the add-on's
own sync-link health via lastSyncError, a distinct signal -- must stay
available regardless of machineReachable.
"""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN


def _mock_all_coordinator_endpoints(aioclient_mock, url: str, status_json: dict) -> None:
    aioclient_mock.get(f"{url}/api/status", json=status_json)
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json={"temp": 93.5, "targetTemp": 94.0})
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


def _entity_id(key: str) -> str:
    return f"sensor.gaggiuino_local_profiler_{key}"


async def test_coordinator_exposes_machine_reachable_true(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock, {"machineReachable": True})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machine_reachable"] is True


async def test_coordinator_exposes_machine_reachable_false(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock, {"machineReachable": False})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machine_reachable"] is False


async def test_coordinator_defaults_machine_reachable_false_when_absent(hass, aioclient_mock) -> None:
    """Backward compat: an add-on version predating #106 (no "machineReachable"
    key in /api/status) must not crash setup -- and the affected sensors
    correctly fall back to unavailable rather than assuming reachability."""
    entry, _ = await _setup_entry(hass, aioclient_mock, {})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machine_reachable"] is False


async def test_machine_temperature_sensors_unavailable_when_machine_unreachable(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock, {"machineReachable": False})
    for key in ("machine_temperature", "machine_target_temperature"):
        state = hass.states.get(_entity_id(key))
        assert state is not None
        assert state.state == "unavailable", f"{key} expected unavailable, got {state.state!r}"


async def test_machine_temperature_sensors_available_when_machine_reachable(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock, {"machineReachable": True})
    temp = hass.states.get(_entity_id("machine_temperature"))
    target = hass.states.get(_entity_id("machine_target_temperature"))
    assert temp is not None and temp.state == "93.5"
    assert target is not None and target.state == "94.0"


async def test_unrelated_sensors_stay_available_when_machine_unreachable(hass, aioclient_mock) -> None:
    """Shot history / add-on link status must not be affected by the
    machine being off -- only genuinely live machine values should."""
    await _setup_entry(hass, aioclient_mock, {"machineReachable": False})
    for key in ("machine_status", "shot_count", "shots_today"):
        state = hass.states.get(_entity_id(key))
        assert state is not None
        assert state.state != "unavailable", f"{key} unexpectedly unavailable"


async def test_machine_status_reflects_addon_sync_not_machine_reachable(hass, aioclient_mock) -> None:
    """machine_status is a distinct signal (add-on sync-link health via
    lastSyncError) and keeps its existing online/error semantic even when
    the machine itself is unreachable."""
    await _setup_entry(hass, aioclient_mock, {"machineReachable": False, "lastSyncError": None})
    state = hass.states.get(_entity_id("machine_status"))
    assert state is not None
    assert state.state == "online"
