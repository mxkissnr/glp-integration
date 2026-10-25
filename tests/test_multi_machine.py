"""Tests for the multi-machine registry surfaced by GlpDataCoordinator (#47),
mirroring the app's additive GET /api/status "machines" array added in GLP
#317. Scope of this round: the coordinator parses and exposes the array
(coordinator.data["machines"] + the machine_status sensor's "machines"
attribute). The per-machine HA devices/entities this registry feeds are
covered in tests/test_multi_machine_devices.py.
"""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

MACHINES_PAYLOAD = [
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
        "reachable": None,
        "on": None,
    },
]


async def _setup_entry(hass, strict_aioclient_mock, status_json: dict):
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(strict_aioclient_mock, url, status=status_json)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


async def test_coordinator_exposes_machines_array(hass, strict_aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, strict_aioclient_mock, {"machines": MACHINES_PAYLOAD})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machines"] == MACHINES_PAYLOAD


async def test_coordinator_defaults_to_empty_machines_list_when_absent(hass, strict_aioclient_mock) -> None:
    """Backward compat: an app instance running an app version older than
    GLP #317 (no "machines" key in /api/status at all) must not break setup."""
    entry, url = await _setup_entry(hass, strict_aioclient_mock, {})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    assert coordinator.data["machines"] == []


async def test_machine_status_sensor_exposes_machines_attribute(hass, strict_aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, strict_aioclient_mock, {"machines": MACHINES_PAYLOAD})
    # Look up the machine_status entity via the entity registry instead of
    # guessing the entity_id from the title (has_entity_name device naming).
    from homeassistant.helpers import entity_registry as er
    registry = er.async_get(hass)
    entity_id = next(
        eid for eid, entry_ in registry.entities.items()
        if entry_.unique_id == f"{entry.entry_id}_machine_status"
    )
    state = hass.states.get(entity_id)
    assert state is not None
    assert state.attributes.get("machines") == MACHINES_PAYLOAD


async def test_machine_status_sensor_omits_machines_attribute_when_empty(hass, strict_aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, strict_aioclient_mock, {})
    from homeassistant.helpers import entity_registry as er
    registry = er.async_get(hass)
    entity_id = next(
        eid for eid, entry_ in registry.entities.items()
        if entry_.unique_id == f"{entry.entry_id}_machine_status"
    )
    state = hass.states.get(entity_id)
    assert state is not None
    assert "machines" not in state.attributes
