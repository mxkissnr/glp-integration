"""Tests for GlpSettingsCoordinator._async_update_data() (#109) -- fetches
GET /api/machine/settings?category=<c> for every category in
SETTINGS_CATEGORIES in parallel, isolating a single category's failure
(machine unreachable, 501 on a non-Gaggiuino machine, etc.) from the rest
instead of failing the whole update."""
import aiohttp
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.settings_coordinator import (
    SETTINGS_CATEGORIES,
    GlpSettingsCoordinator,
)
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"


def _make_coordinator(hass) -> GlpSettingsCoordinator:
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, URL)
    return GlpSettingsCoordinator(hass, session, URL, auth)


def _settings_url(category: str) -> str:
    return f"{URL}/api/machine/settings?category={category}"


SETTINGS_PAYLOADS = {name: {"ok": name} for name in SETTINGS_CATEGORIES}


async def test_fetches_every_category(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, settings=SETTINGS_PAYLOADS)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert set(data.keys()) == set(SETTINGS_CATEGORIES)
    assert data["boiler"] == {"ok": "boiler"}
    assert data["led"] == {"ok": "led"}


async def test_isolates_a_single_category_failure(hass, aioclient_mock) -> None:
    # aioclient_mock answers with the first matching registration, so the
    # failing category goes in before the shared set.
    aioclient_mock.get(_settings_url("scales"), exc=aiohttp.ClientConnectionError)
    mock_all_coordinator_endpoints(aioclient_mock, URL, settings=SETTINGS_PAYLOADS)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert "scales" not in data
    assert set(data.keys()) == set(SETTINGS_CATEGORIES) - {"scales"}


async def test_isolates_a_501_response(hass, aioclient_mock) -> None:
    """501 == machine type doesn't support the settings proxy for that
    category (or at all, on a non-Gaggiuino machine)."""
    aioclient_mock.get(_settings_url("system"), status=501)
    mock_all_coordinator_endpoints(aioclient_mock, URL, settings=SETTINGS_PAYLOADS)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert "system" not in data


async def test_every_category_unreachable_returns_empty_dict(hass, aioclient_mock) -> None:
    for category in SETTINGS_CATEGORIES:
        aioclient_mock.get(_settings_url(category), exc=aiohttp.ClientConnectionError)
    # The categories above win over the shared set's defaults (first match).
    mock_all_coordinator_endpoints(aioclient_mock, URL, settings=SETTINGS_PAYLOADS)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data == {}
