"""Tests for GlpLiveCoordinator._async_update_data() (#69) -- previously
untested: the success path and the error path (any failure while polling
/api/live/data must raise UpdateFailed rather than propagate the raw
exception, so HA marks the entity unavailable instead of erroring).

#708/#736: also covers the fallback-poll skip logic -- _async_update_data
must not hit /api/live/data at all while the SSE stream (see
test_live_coordinator_sse.py) has delivered a fresh event recently, and must
fall back to the REST poll once that event goes stale."""
import time

import aiohttp
import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.live_coordinator import GlpLiveCoordinator

URL = "http://glp.example.com"


def _make_coordinator(hass) -> GlpLiveCoordinator:
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, URL)
    return GlpLiveCoordinator(hass, session, URL, auth)


async def test_returns_live_data_on_success(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/live/data", json={"isLive": True, "profileName": "Adaptive"})
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data == {"isLive": True, "profileName": "Adaptive"}


async def test_raises_update_failed_on_connection_error(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/live/data", exc=aiohttp.ClientConnectionError)
    coordinator = _make_coordinator(hass)

    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()


async def test_raises_update_failed_on_http_error_status(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/live/data", status=500)
    coordinator = _make_coordinator(hass)

    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()


async def test_raises_update_failed_on_timeout(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/live/data", exc=TimeoutError)
    coordinator = _make_coordinator(hass)

    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()


async def test_skips_poll_when_sse_recently_delivered_data(hass, aioclient_mock) -> None:
    # No /api/live/data mock registered -- a REST call here would fail the test.
    coordinator = _make_coordinator(hass)
    coordinator.data = {"isLive": True, "profileName": "SSE-pushed"}
    coordinator._sse_last_event_monotonic = time.monotonic()

    data = await coordinator._async_update_data()

    assert data == {"isLive": True, "profileName": "SSE-pushed"}


async def test_falls_back_to_poll_when_sse_data_is_stale(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/live/data", json={"isLive": False, "profileName": None})
    coordinator = _make_coordinator(hass)
    coordinator.data = {"isLive": True, "profileName": "Stale"}
    coordinator._sse_last_event_monotonic = time.monotonic() - 999

    data = await coordinator._async_update_data()

    assert data == {"isLive": False, "profileName": None}
