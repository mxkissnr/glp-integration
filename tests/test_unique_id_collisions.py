"""Regression test for #66/#238: every entity's unique_id is built as
`f"{entry.entry_id}_{key}"` (or an equivalent hardcoded suffix) -- one
namespace shared across sensor.py, binary_sensor.py, select.py, number.py,
switch.py, button.py, light.py and update.py. Two entities landing on the same
unique_id either collapse into one registry entry (same platform) or force a
`_2`-suffixed entity_id (different platforms), which is the failure class
behind the v1.22.1 entity-id collision (#62/#63).

This used to be an AST scan over the integration's source, comparing the
`description.key` tuples against literals found in `super().__init__(...)`
calls. That scanner needed a hand-maintained list of expected suffixes, grew a
classifier for the machine-scoped ids and still could not see a key that two
different platform files happen to use. Setting the integration up for real
checks the same thing without modelling it: whatever the platforms add is what
gets checked, including the per-additional-machine entities.
"""
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import EntityPlatform
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

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


async def _setup_entry(hass, aioclient_mock) -> MockConfigEntry:
    url = "http://glp.example.com"
    mock_all_coordinator_endpoints(
        aioclient_mock,
        url,
        status={"machines": MACHINES_TWO},
        machine_status={"available": True, "profileName": "Adaptive"},
        machine_live={"sysState": {"operationMode": 0}},
        settings={"system": {"releaseChannel": 1}},
    )
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _setup_with_entity_capture(hass, aioclient_mock, monkeypatch) -> tuple[MockConfigEntry, list]:
    """Set the entry up and return the entry plus every entity it added.

    The registry alone is not enough: it is keyed by (domain, platform,
    unique_id), so a duplicate inside one platform is merged into the existing
    entry instead of raising. Counting what reached `async_add_entities`
    makes that visible; the capture is filtered down to this entry's entities
    so anything a dependency component adds is not counted.
    """
    added: list = []
    original = EntityPlatform.async_add_entities

    async def _record(self, new_entities, *args, **kwargs):
        added.extend(new_entities if type(new_entities) is list else list(new_entities))
        return await original(self, new_entities, *args, **kwargs)

    monkeypatch.setattr(EntityPlatform, "async_add_entities", _record)
    entry = await _setup_entry(hass, aioclient_mock)
    ours = [e for e in added if (e.unique_id or "").startswith(entry.entry_id)]
    return entry, ours


def _registered_for(hass, entry) -> list:
    registry = er.async_get(hass)
    return [e for e in registry.entities.values() if e.config_entry_id == entry.entry_id]


async def test_every_added_entity_lands_in_the_registry_with_a_unique_id(
    hass, strict_aioclient_mock, monkeypatch
) -> None:
    entry, added = await _setup_with_entity_capture(hass, strict_aioclient_mock, monkeypatch)

    registered = _registered_for(hass, entry)
    unique_ids = [e.unique_id for e in registered]

    assert added
    assert len(registered) == len(set(unique_ids)), (
        f"duplicate unique_id: {sorted({u for u in unique_ids if unique_ids.count(u) > 1})}"
    )
    # One registry entry per entity the platforms added -- a duplicate
    # unique_id inside a single platform shows up here as a missing entry.
    assert len(registered) == len(added)


async def test_no_unique_id_is_used_by_two_entities(hass, strict_aioclient_mock, monkeypatch) -> None:
    """Checked across all platforms at once: the same unique_id in, say,
    sensor.py and binary_sensor.py does not collapse in the registry (the
    platform is part of its key) but does mint a mangled `_2` entity_id."""
    _entry, added = await _setup_with_entity_capture(hass, strict_aioclient_mock, monkeypatch)

    unique_ids = [entity.unique_id for entity in added]
    duplicates = sorted({u for u in unique_ids if unique_ids.count(u) > 1})

    assert not duplicates, f"unique_id used by more than one entity: {duplicates}"


async def test_additional_machine_entities_get_their_own_unique_ids(
    hass, strict_aioclient_mock, monkeypatch
) -> None:
    """The machine-scoped suffix is `{entry_id}_{machine_id}_{key}`, so the
    second machine's entities never share a unique_id with the default
    machine's -- the part of the namespace the old AST scan deliberately
    skipped."""
    entry, _added = await _setup_with_entity_capture(hass, strict_aioclient_mock, monkeypatch)

    registered = _registered_for(hass, entry)
    machine_two = {e.unique_id for e in registered if e.unique_id.startswith(f"{entry.entry_id}_2_")}
    default_machine = {e.unique_id for e in registered} - machine_two

    assert machine_two == {f"{entry.entry_id}_2_status", f"{entry.entry_id}_2_reachable"}
    assert not machine_two & default_machine


async def test_no_entity_id_was_collision_mangled(hass, strict_aioclient_mock) -> None:
    """HA resolves an entity_id clash by appending `_2` instead of raising, so
    a collision leaves a silent, permanent dashboard breakage: the card looks
    up the documented entity_id and finds nothing."""
    entry = await _setup_entry(hass, strict_aioclient_mock)

    entity_ids = {e.entity_id for e in _registered_for(hass, entry)}
    mangled = {
        eid for eid in entity_ids
        if eid.rsplit("_", 1)[-1].isdigit() and eid.rsplit("_", 1)[0] in entity_ids
    }

    assert not mangled, f"entity_id collision: {sorted(mangled)}"
