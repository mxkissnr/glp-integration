"""Tests for GlpLiveCoordinator._async_update_data() (#69) -- previously
untested: the success path and the error path (any failure while polling
/api/live/data must raise UpdateFailed rather than propagate the raw
exception, so HA marks the entity unavailable instead of erroring)."""
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
