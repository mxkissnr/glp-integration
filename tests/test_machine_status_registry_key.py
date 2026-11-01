"""Tests for #323: the machine_status sensor carries the registry
translation_key "machine_status", so the cards can find it through Home
Assistant's entity registry instead of its (device-composed, translated,
possibly main-entity-shortened) friendly name.

The explicit `name="Machine Status"` must keep winning over the translation
key, otherwise the entity name and every existing entity_id would change on
an upgrade -- see the #62 precedent in CLAUDE.md.
"""
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

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

ENTITY_ID = "sensor.gaggiuino_local_profiler_machine_status"


async def _setup_entry(hass, strict_aioclient_mock):
    url = "http://glp.example.com"
    mock_all_coordinator_endpoints(strict_aioclient_mock, url, status={"machines": MACHINES_ONE})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_machine_status_sensor_has_the_registry_translation_key(hass, strict_aioclient_mock) -> None:
    """#323: the cards identify the sensor by `translation_key`, which HA
    stores in the entity registry."""
    entry = await _setup_entry(hass, strict_aioclient_mock)
    registered = er.async_get(hass).async_get(ENTITY_ID)

    assert registered is not None
    assert registered.unique_id == f"{entry.entry_id}_machine_status"
    assert registered.translation_key == "machine_status"
    assert registered.platform == DOMAIN


async def test_machine_status_sensor_name_and_entity_id_are_unchanged(hass, strict_aioclient_mock) -> None:
    """The explicit `name` still wins over the translation key, so adding it
    must not rename anything: the friendly name keeps its "Machine Status"
    tail and the entity_id keeps deriving from the stable key."""
    await _setup_entry(hass, strict_aioclient_mock)

    state = hass.states.get(ENTITY_ID)
    assert state is not None
    assert str(state.attributes["friendly_name"]).endswith("Machine Status")
