"""Regression test for #106: sensors sourced from live machine values
(machine_temperature, machine_target_temperature) must go unavailable when
the add-on reports the physical Gaggiuino machine as unreachable
(GET /api/status "machineReachable": false), instead of holding their last
value forever as long as the add-on's own HTTP endpoint keeps responding.

Unrelated sensors -- shot history / add-on link status -- must stay
available regardless of machineReachable; that's a distinct mechanism
(entity availability) from machine_status's own state value, covered below
and in test_machine_status_reachability.py (#667).
"""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

PREHEAT_PAYLOAD = {"temp": 93.5, "targetTemp": 94.0}


async def _setup_entry(hass, strict_aioclient_mock, status_json: dict):
    url = "http://glp.example.com"
    mock_all_coordinator_endpoints(
        strict_aioclient_mock, url, status=status_json, preheat=PREHEAT_PAYLOAD
    )
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


def _entity_id(key: str) -> str:
    return f"sensor.gaggiuino_local_profiler_{key}"


async def test_coordinator_exposes_machine_reachable_true(hass, strict_aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, strict_aioclient_mock, {"machineReachable": True})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machine_reachable"] is True


async def test_coordinator_exposes_machine_reachable_false(hass, strict_aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, strict_aioclient_mock, {"machineReachable": False})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machine_reachable"] is False


async def test_coordinator_defaults_machine_reachable_false_when_absent(hass, strict_aioclient_mock) -> None:
    """Backward compat: an add-on version predating #106 (no "machineReachable"
    key in /api/status) must not crash setup -- and the affected sensors
    correctly fall back to unavailable rather than assuming reachability."""
    entry, _ = await _setup_entry(hass, strict_aioclient_mock, {})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machine_reachable"] is False


async def test_machine_temperature_sensors_unavailable_when_machine_unreachable(hass, strict_aioclient_mock) -> None:
    await _setup_entry(hass, strict_aioclient_mock, {"machineReachable": False})
    for key in ("machine_temperature", "machine_target_temperature"):
        state = hass.states.get(_entity_id(key))
        assert state is not None
        assert state.state == "unavailable", f"{key} expected unavailable, got {state.state!r}"


async def test_machine_temperature_sensors_available_when_machine_reachable(hass, strict_aioclient_mock) -> None:
    await _setup_entry(hass, strict_aioclient_mock, {"machineReachable": True})
    temp = hass.states.get(_entity_id("machine_temperature"))
    target = hass.states.get(_entity_id("machine_target_temperature"))
    assert temp is not None and temp.state == "93.5"
    assert target is not None and target.state == "94.0"


async def test_unrelated_sensors_stay_available_when_machine_unreachable(hass, strict_aioclient_mock) -> None:
    """Shot history / add-on link status must not be affected by the
    machine being off -- only genuinely live machine values should."""
    await _setup_entry(hass, strict_aioclient_mock, {"machineReachable": False})
    for key in ("machine_status", "shot_count", "shots_today"):
        state = hass.states.get(_entity_id(key))
        assert state is not None
        assert state.state != "unavailable", f"{key} unexpectedly unavailable"
