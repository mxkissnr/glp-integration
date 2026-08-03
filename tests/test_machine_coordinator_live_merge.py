"""Tests for GlpMachineCoordinator._async_update_data()'s #109 extension:
merging sysState.operationMode/coreVersion/timeAlive from GET /api/machine/live
into the same dict returned for /api/machine/status, best-effort (a live-fetch
failure must not fail the whole update since /api/machine/status already
succeeded -- see test_live_fetch_failure_is_best_effort below)."""
import aiohttp
import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.machine_coordinator import GlpMachineCoordinator

URL = "http://glp.example.com"


def _make_coordinator(hass) -> GlpMachineCoordinator:
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, URL)
    return GlpMachineCoordinator(hass, session, URL, auth)


async def test_merges_sys_state_fields_into_status_data(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": True, "pressure": 8.5})
    aioclient_mock.get(
        f"{URL}/api/machine/live",
        json={"sensorSnap": None, "sysState": {"operationMode": 4, "coreVersion": "1.2.3", "timeAlive": 999}},
    )
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data["pressure"] == 8.5
    assert data["operationMode"] == 4
    assert data["coreVersion"] == "1.2.3"
    assert data["timeAlive"] == 999


async def test_live_fetch_failure_is_best_effort(hass, aioclient_mock) -> None:
    """/api/machine/status succeeding must not be undone by /api/machine/live
    failing -- other machine-coordinator entities (pressure, weight, ...)
    must stay live even if the opmode select alone falls back to unknown."""
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": True, "pressure": 8.5})
    aioclient_mock.get(f"{URL}/api/machine/live", exc=aiohttp.ClientConnectionError)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data["pressure"] == 8.5
    assert "operationMode" not in data


async def test_live_sys_state_null_leaves_status_data_untouched(hass, aioclient_mock) -> None:
    """sysState is null until the machine's first WS push arrives (per the
    add-on's own docs) -- must not crash or write None fields."""
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": True, "pressure": 8.5})
    aioclient_mock.get(f"{URL}/api/machine/live", json={"sensorSnap": None, "sysState": None})
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data == {"available": True, "pressure": 8.5}


async def test_status_unavailable_returns_empty_dict_without_calling_live(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": False})
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data == {}


async def test_status_failure_raises_update_failed(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/machine/status", status=500)
    coordinator = _make_coordinator(hass)

    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()
