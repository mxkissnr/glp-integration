"""Tests for #62: GlpSensor (and sibling sensor classes) must override the
`suggested_object_id` property to return the stable programmatic `key`
rather than relying on HA's slugification of the human-readable `name`,
which produced an unpredictable, collision-mangled entity_id for the new
preheat "ready by" sensors from #59/#60 on a real instance (a stray
"v_dev_" prefix and a missing "_at" suffix).

Note on `_attr_suggested_object_id`: HA core 2026.2 does NOT support this as
a settable `_attr_` (it isn't in Entity.CACHED_PROPERTIES_WITH_ATTR_, so
setting `self._attr_suggested_object_id` is a no-op) -- the only way to
influence it is overriding the `suggested_object_id` property itself, as
homeassistant/components/aosmith/select.py does upstream. Verified directly
against the installed homeassistant.helpers.entity_platform source: an
entity that overrides `suggested_object_id` has that value routed through
`_async_derive_object_ids()` into `object_id_base` (since the entity never
sets `internal_integration_suggested_object_id`), which still deterministically
drives the assigned entity_id -- see test_*_entity_id_matches_key below,
which asserts on the actual entity_id rather than the registry's
`suggested_object_id` metadata field (which stays None on this code path;
the outcome that matters, a deterministic entity_id, is what's tested).

Also see test_suggested_object_id_does_not_rename_an_already_registered_entity:
entity_registry.async_get_or_create looks up any existing entry by unique_id
first and returns early via _async_update_entity without ever passing
new_entity_id -- so an existing install's already-registered (possibly
mangled) entity_id is left untouched by this fix.
"""
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    MAINTENANCE_SENSORS,
    SENSORS,
)

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
    _mock_all_coordinator_endpoints(aioclient_mock, url, {"machines": MACHINES_ONE})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


def _entity_by_unique_id(hass, unique_id: str):
    registry = er.async_get(hass)
    return next((e for e in registry.entities.values() if e.unique_id == unique_id), None)


def _expected_entity_id(key: str) -> str:
    return f"sensor.gaggiuino_local_profiler_{key}"


async def test_glp_sensor_entity_id_matches_key(hass, aioclient_mock) -> None:
    """Every GlpSensor (SENSORS tuple) must land on entity_id derived from
    its stable `key`, not whatever `name` slugifies to."""
    entry, _ = await _setup_entry(hass, aioclient_mock)
    for description in SENSORS:
        entry_reg = _entity_by_unique_id(hass, f"{entry.entry_id}_{description.key}")
        assert entry_reg is not None, f"missing entity for key={description.key}"
        assert entry_reg.entity_id == _expected_entity_id(description.key)


async def test_preheat_ready_by_sensors_get_the_expected_entity_id(hass, aioclient_mock) -> None:
    """Regression test for #62: on first creation (no collision), the new
    preheat sensors from #59/#60 must land on the exact entity_id the
    lovelace card hardcodes -- not a mangled/prefixed variant."""
    entry, _ = await _setup_entry(hass, aioclient_mock)

    ready_by = _entity_by_unique_id(hass, f"{entry.entry_id}_preheat_ready_by_target_at")
    assert ready_by is not None
    assert ready_by.entity_id == "sensor.gaggiuino_local_profiler_preheat_ready_by_target_at"

    switch_on = _entity_by_unique_id(hass, f"{entry.entry_id}_preheat_planned_switch_on_at")
    assert switch_on is not None
    assert switch_on.entity_id == "sensor.gaggiuino_local_profiler_preheat_planned_switch_on_at"


async def test_maintenance_sensor_entity_id_matches_key(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock)
    for description in MAINTENANCE_SENSORS:
        entry_reg = _entity_by_unique_id(hass, f"{entry.entry_id}_{description.key}")
        assert entry_reg is not None, f"missing entity for key={description.key}"
        assert entry_reg.entity_id == _expected_entity_id(description.key)


async def test_grinder_maintenance_sensor_entity_id(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock)
    entry_reg = _entity_by_unique_id(hass, f"{entry.entry_id}_maint_grinders")
    assert entry_reg is not None
    assert entry_reg.entity_id == "sensor.gaggiuino_local_profiler_maint_grinders"


async def test_machine_sensor_entity_id_matches_key(hass, aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, aioclient_mock)
    for description in MACHINE_SENSORS:
        entry_reg = _entity_by_unique_id(hass, f"{entry.entry_id}_{description.key}")
        assert entry_reg is not None, f"missing entity for key={description.key}"
        assert entry_reg.entity_id == _expected_entity_id(description.key)


async def test_suggested_object_id_does_not_rename_an_already_registered_entity(hass, aioclient_mock) -> None:
    """Confirms the safety claim for existing installs: pre-registering an
    entity under a collision-mangled entity_id (simulating what happened on
    a real instance before this fix existed) and then loading the config
    entry must NOT move it to the "correct" entity_id -- HA's registry only
    consults suggested_object_id on an entity's first-ever creation
    (entity_registry.async_get_or_create looks up the existing entry by
    unique_id first and never passes new_entity_id when updating it)."""
    registry = er.async_get(hass)
    url = "http://glp.example.com"
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)

    unique_id = f"{entry.entry_id}_preheat_ready_by_target_at"
    mangled_entity_id = "sensor.v_dev_gaggiuino_local_profiler_preheat_ready_by"
    registry.async_get_or_create(
        "sensor",
        DOMAIN,
        unique_id,
        suggested_object_id="v_dev_gaggiuino_local_profiler_preheat_ready_by",
        config_entry=entry,
    )
    assert registry.async_get_entity_id("sensor", DOMAIN, unique_id) == mangled_entity_id

    _mock_all_coordinator_endpoints(aioclient_mock, url, {"machines": MACHINES_ONE})
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    # Still the mangled entity_id -- our suggested_object_id fix did not
    # retroactively rename the already-registered entity.
    assert registry.async_get_entity_id("sensor", DOMAIN, unique_id) == mangled_entity_id
