"""Tests for the gaggiuino_profiler.set_ready_by service (#59, part 2/3 of
the ready-by preheat timer feature — part 1 is the app's
POST /api/preheat/ready-by endpoint, mxkissnr/gaggiuino-local-profiler#542)
and the two new preheat sensors it feeds: preheat_ready_by_target_at and
preheat_planned_switch_on_at."""
from datetime import UTC, datetime

import pytest
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

READY_BY_TARGET_AT_MS = 1806566400000  # 2027-03-01T00:00:00Z (epoch-ms)
PLANNED_SWITCH_ON_AT_MS = 1806565500000  # 15 min earlier


def _mock_all_coordinator_endpoints(aioclient_mock, url: str, preheat: dict | None = None) -> None:
    """Mocks every endpoint the three coordinators poll on first refresh so
    async_setup_entry completes and the coordinator lands in hass.data --
    same as test_backup_service.py, except /api/preheat carries the new
    readyByTargetAt/plannedSwitchOnAt fields so sensor tests have something
    to assert on."""
    aioclient_mock.get(f"{url}/api/status", json={})
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json=preheat if preheat is not None else {})
    aioclient_mock.get(f"{url}/api/machine/profiles", json={})
    aioclient_mock.get(f"{url}/api/menu", json=[])
    aioclient_mock.get(f"{url}/api/version", json={})
    aioclient_mock.get(f"{url}/api/live/data", json={})
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": False})


async def _setup_entry(hass, aioclient_mock, preheat: dict | None = None):
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url, preheat)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


def _entity_by_unique_id(hass, unique_id: str):
    registry = er.async_get(hass)
    return next((e for e in registry.entities.values() if e.unique_id == unique_id), None)


async def test_set_ready_by_posts_epoch_ms_and_refreshes(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(
        f"{url}/api/preheat/ready-by",
        json={"ready": False, "readyByTargetAt": READY_BY_TARGET_AT_MS, "plannedSwitchOnAt": PLANNED_SWITCH_ON_AT_MS},
    )

    assert hass.services.has_service(DOMAIN, "set_ready_by")
    target_time = datetime.fromtimestamp(READY_BY_TARGET_AT_MS / 1000, tz=UTC)
    await hass.services.async_call(
        DOMAIN, "set_ready_by", {"target_time": target_time}, blocking=True
    )
    await hass.async_block_till_done()

    post_calls = [c for c in aioclient_mock.mock_calls if c[0].lower() == "post"]
    assert len(post_calls) == 1
    _, called_url, body, _ = post_calls[0]
    assert str(called_url).endswith("/api/preheat/ready-by")
    assert body == {"targetAt": READY_BY_TARGET_AT_MS}


async def test_set_ready_by_without_target_time_clears(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(
        f"{url}/api/preheat/ready-by",
        json={"ready": False, "readyByTargetAt": None, "plannedSwitchOnAt": None},
    )

    await hass.services.async_call(DOMAIN, "set_ready_by", {}, blocking=True)
    await hass.async_block_till_done()

    post_calls = [c for c in aioclient_mock.mock_calls if c[0].lower() == "post"]
    assert len(post_calls) == 1
    _, _, body, _ = post_calls[0]
    assert body == {"targetAt": None}


async def test_set_ready_by_surfaces_400_as_home_assistant_error(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(
        f"{url}/api/preheat/ready-by",
        status=400,
        json={"error": "switch_entity not configured"},
    )

    target_time = datetime.fromtimestamp(READY_BY_TARGET_AT_MS / 1000, tz=UTC)
    with pytest.raises(HomeAssistantError, match="switch_entity not configured"):
        await hass.services.async_call(
            DOMAIN, "set_ready_by", {"target_time": target_time}, blocking=True
        )
    await hass.async_block_till_done()


async def test_ready_by_sensors_read_coordinator_data(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(
        hass,
        aioclient_mock,
        preheat={
            "ready": False,
            "readyByTargetAt": READY_BY_TARGET_AT_MS,
            "plannedSwitchOnAt": PLANNED_SWITCH_ON_AT_MS,
        },
    )

    target_entry = _entity_by_unique_id(hass, f"{entry.entry_id}_preheat_ready_by_target_at")
    assert target_entry is not None
    target_state = hass.states.get(target_entry.entity_id)
    assert target_state is not None
    assert target_state.state == datetime.fromtimestamp(
        READY_BY_TARGET_AT_MS / 1000, tz=UTC
    ).isoformat()

    switch_on_entry = _entity_by_unique_id(hass, f"{entry.entry_id}_preheat_planned_switch_on_at")
    assert switch_on_entry is not None
    switch_on_state = hass.states.get(switch_on_entry.entity_id)
    assert switch_on_state is not None
    assert switch_on_state.state == datetime.fromtimestamp(
        PLANNED_SWITCH_ON_AT_MS / 1000, tz=UTC
    ).isoformat()


async def test_ready_by_sensors_are_none_when_not_scheduled(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(
        hass, aioclient_mock, preheat={"ready": False, "readyByTargetAt": None, "plannedSwitchOnAt": None}
    )

    target_entry = _entity_by_unique_id(hass, f"{entry.entry_id}_preheat_ready_by_target_at")
    target_state = hass.states.get(target_entry.entity_id)
    assert target_state.state == "unknown"
