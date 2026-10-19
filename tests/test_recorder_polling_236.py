"""Regression tests for #236/#242: keep live curves and recent shots out of
the recorder, poll only the newest shots, and refresh the machine coordinator
after a profile switch."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.gaggiuino_profiler.binary_sensor import IsBrewingSensor
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator
from custom_components.gaggiuino_profiler.sensor import GlpSensor
from custom_components.gaggiuino_profiler.select import GlpProfileSelect

URL = "http://glp.example.com"


def _mock_endpoints(aioclient_mock, *, status=None, status_status=200) -> None:
    if status_status < 400:
        aioclient_mock.get(f"{URL}/api/status", json=status or {})
    else:
        aioclient_mock.get(f"{URL}/api/status", status=status_status)
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    aioclient_mock.get(f"{URL}/api/machine/firmware/version", json={})


async def _coordinator(hass):
    return GlpDataCoordinator(hass, async_get_clientsession(hass), URL)


def _shot(shot_id: int, timestamp: str) -> dict:
    return {"id": shot_id, "timestamp": timestamp}


def _shot_urls(aioclient_mock) -> list[str]:
    return [str(r.url) for r in aioclient_mock.request_history]


def test_live_brewing_attributes_are_unrecorded() -> None:
    assert {"datapoints", "seq"} <= IsBrewingSensor._unrecorded_attributes


def test_recent_shots_attributes_are_unrecorded() -> None:
    assert {"recent_shots", "machines"} <= GlpSensor._unrecorded_attributes


async def test_poll_uses_limit_and_header_count(hass, aioclient_mock) -> None:
    _mock_endpoints(aioclient_mock)
    aioclient_mock.get(
        f"{URL}/shots.json?limit=10",
        json=[_shot(7, datetime.now(UTC).isoformat())],
        headers={"X-Shots-Today": "3"},
    )

    data = await (await _coordinator(hass))._async_update_data()

    assert data["shots_today"] == 3
    urls = _shot_urls(aioclient_mock)
    assert f"{URL}/shots.json?limit=10" in urls
    assert f"{URL}/shots.json" not in urls


async def test_old_app_counts_full_list_on_first_and_later_polls(hass, aioclient_mock) -> None:
    now = datetime.now(UTC).isoformat()
    _mock_endpoints(aioclient_mock)
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
    _mock_endpoints(aioclient_mock, status_status=500)
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
    data_coordinator.auth.headers = AsyncMock(return_value={})
    data_coordinator.async_request_refresh = AsyncMock()
    machine_coordinator = MagicMock()
    machine_coordinator.data = {"profileName": "Adaptive"}
    machine_coordinator.async_request_refresh = AsyncMock()
    return (
        GlpProfileSelect(data_coordinator, machine_coordinator, entry),
        data_coordinator,
        machine_coordinator,
    )


async def test_profile_select_refreshes_machine_coordinator(monkeypatch) -> None:
    select, data_coordinator, machine_coordinator = _make_profile_select()

    response = MagicMock()
    response.raise_for_status = MagicMock()
    post_cm = MagicMock()
    post_cm.__aenter__ = AsyncMock(return_value=response)
    post_cm.__aexit__ = AsyncMock(return_value=False)
    session = MagicMock()
    session.post.return_value = post_cm
    monkeypatch.setattr(
        "custom_components.gaggiuino_profiler.select.async_get_clientsession",
        lambda hass: session,
    )

    await select.async_select_option("Adaptive")

    machine_coordinator.async_request_refresh.assert_awaited_once()
    data_coordinator.async_request_refresh.assert_not_awaited()
