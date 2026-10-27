"""Regression tests for #236/#242: keep live curves and recent shots out of
the recorder, poll only the newest shots, and refresh the machine coordinator
after a profile switch."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed
from homeassistant.util import dt as dt_util

from custom_components.gaggiuino_profiler.binary_sensor import IsBrewingSensor
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator
from custom_components.gaggiuino_profiler.select import GlpProfileSelect
from custom_components.gaggiuino_profiler.sensor import GlpSensor
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"


async def _coordinator(hass):
    return GlpDataCoordinator(hass, async_get_clientsession(hass), URL)


def _shot(shot_id: int, timestamp: str) -> dict:
    return {"id": shot_id, "timestamp": timestamp}


def _shot_urls(aioclient_mock) -> list[str]:
    return [str(call[1]) for call in aioclient_mock.mock_calls]


def test_live_brewing_attributes_are_unrecorded() -> None:
    assert {"datapoints", "seq"} <= IsBrewingSensor._unrecorded_attributes


def test_recent_shots_attributes_are_unrecorded() -> None:
    assert {"recent_shots", "machines"} <= GlpSensor._unrecorded_attributes


async def test_poll_uses_limit_and_header_count(hass, aioclient_mock) -> None:
    # The shots endpoint is registered per test: the header it must send
    # (X-Shots-Today) is not something the shared helper can express.
    mock_all_coordinator_endpoints(aioclient_mock, URL, skip=("shots",))
    aioclient_mock.get(
        f"{URL}/shots.json?limit=10",
        json=[_shot(7, dt_util.now().isoformat())],
        headers={"X-Shots-Today": "3"},
    )

    data = await (await _coordinator(hass))._async_update_data()

    assert data["shots_today"] == 3
    urls = _shot_urls(aioclient_mock)
    assert f"{URL}/shots.json?limit=10" in urls
    assert f"{URL}/shots.json" not in urls


async def test_old_app_counts_full_list_on_first_and_later_polls(hass, aioclient_mock) -> None:
    now = dt_util.now().isoformat()
    mock_all_coordinator_endpoints(aioclient_mock, URL, skip=("shots",))
    aioclient_mock.get(f"{URL}/shots.json?limit=10", json=[_shot(3, now)])
    aioclient_mock.get(
        f"{URL}/shots.json",
        json=[_shot(1, now), _shot(2, now), _shot(3, now)],
    )

    coordinator = await _coordinator(hass)

    first = await coordinator._async_update_data()
    assert first["shots_today"] == 3
    urls = _shot_urls(aioclient_mock)
    # The first poll re-fetches the full list immediately so the value is right.
    assert urls.count(f"{URL}/shots.json?limit=10") == 1
    assert urls.count(f"{URL}/shots.json") == 1

    second = await coordinator._async_update_data()
    assert second["shots_today"] == 3
    urls = _shot_urls(aioclient_mock)
    assert urls.count(f"{URL}/shots.json?limit=10") == 1
    assert urls.count(f"{URL}/shots.json") == 2


async def test_failing_status_still_raises_update_failed(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(
        aioclient_mock, URL, skip=("shots",), statuses={"status": 500}
    )
    aioclient_mock.get(f"{URL}/shots.json?limit=10", json=[], headers={"X-Shots-Today": "0"})

    with pytest.raises(UpdateFailed):
        await (await _coordinator(hass))._async_update_data()


def _make_profile_select():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": URL}
    data_coordinator = MagicMock()
    data_coordinator.data = {
        "profile_options": ["Adaptive", "Sertao Decaf"],
        "current_profile": "Adaptive",
    }
    data_coordinator.auth.post = AsyncMock()
    data_coordinator.async_request_refresh = AsyncMock()
    machine_coordinator = MagicMock()
    machine_coordinator.data = {"profileName": "Adaptive"}
    machine_coordinator.async_request_refresh = AsyncMock()
    return (
        GlpProfileSelect(data_coordinator, machine_coordinator, entry),
        data_coordinator,
        machine_coordinator,
    )


async def test_profile_select_refreshes_machine_coordinator() -> None:
    select, data_coordinator, machine_coordinator = _make_profile_select()

    await select.async_select_option("Adaptive")

    data_coordinator.auth.post.assert_awaited_once_with(
        "/api/machine/profile/set", json={"option": "Adaptive"}
    )
    machine_coordinator.async_request_refresh.assert_awaited_once()
    data_coordinator.async_request_refresh.assert_not_awaited()
