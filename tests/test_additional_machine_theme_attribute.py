"""Regression test for #128 (part of gaggiuino-local-profiler#701): a
non-default machine's own status sensor (GlpAdditionalMachineSensor) must
expose that machine's `theme` as an entity attribute, the same way it
already exposes `type`/`enabled`/`reachable`, so a card scoped to that
specific machine can read its accent theme without cross-referencing the
default machine's `machine_status` sensor's `machines` list attribute.
"""
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

MACHINES_TWO = [
    {
        "id": 1,
        "name": "Gaggiuino",
        "type": "gaggiuino",
        "isDefault": True,
        "enabled": True,
        "reachable": True,
        "on": True,
        "theme": None,
    },
    {
        "id": 2,
        "name": "Kitchen GaggiMate",
        "type": "gaggimate",
        "isDefault": False,
        "enabled": True,
        "reachable": True,
        "on": False,
        "theme": {"preset": "amber-americano"},
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


async def _setup_entry(hass, aioclient_mock):
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url, {"machines": MACHINES_TWO})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


async def test_additional_machine_status_sensor_exposes_its_theme(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)

    registry = er.async_get(hass)
    entity_id = next(
        (e.entity_id for e in registry.entities.values() if e.entity_id.endswith("_machine_2_status")),
        None,
    )
    assert entity_id is not None, "expected an additional-machine status sensor for machine id 2"

    state = hass.states.get(entity_id)
    assert state is not None
    assert state.attributes.get("theme") == {"preset": "amber-americano"}
    assert state.attributes.get("type") == "gaggimate"


async def test_default_machine_machine_status_sensor_still_forwards_full_machines_list(hass, aioclient_mock) -> None:
    """Unchanged pre-existing behavior (#47/#48): the default machine's
    machine_status sensor forwards the whole machines[] array verbatim,
    which already includes theme once the app returns it -- no code change
    needed on that entity for this to work."""
    await _setup_entry(hass, aioclient_mock)

    state = hass.states.get("sensor.gaggiuino_local_profiler_machine_status")
    assert state is not None
    machines = state.attributes.get("machines")
    assert machines is not None
    by_id = {m["id"]: m for m in machines}
    assert by_id[1]["theme"] is None
    assert by_id[2]["theme"] == {"preset": "amber-americano"}
