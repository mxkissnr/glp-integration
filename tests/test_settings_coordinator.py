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

URL = "http://glp.example.com"


def _make_coordinator(hass) -> GlpSettingsCoordinator:
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, URL)
    return GlpSettingsCoordinator(hass, session, URL, auth)


def _mock_all_categories(aioclient_mock, **overrides) -> None:
    for category in SETTINGS_CATEGORIES:
        if category in overrides:
            continue
        aioclient_mock.get(f"{URL}/api/machine/settings?category={category}", json={"ok": category})


async def test_fetches_every_category(hass, aioclient_mock) -> None:
    _mock_all_categories(aioclient_mock)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert set(data.keys()) == set(SETTINGS_CATEGORIES)
    assert data["boiler"] == {"ok": "boiler"}
    assert data["led"] == {"ok": "led"}


async def test_isolates_a_single_category_failure(hass, aioclient_mock) -> None:
    _mock_all_categories(aioclient_mock, scales=None)
    aioclient_mock.get(f"{URL}/api/machine/settings?category=scales", exc=aiohttp.ClientConnectionError)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert "scales" not in data
    assert set(data.keys()) == set(SETTINGS_CATEGORIES) - {"scales"}


async def test_isolates_a_501_response(hass, aioclient_mock) -> None:
    """501 == machine type doesn't support the settings proxy for that
    category (or at all, on a non-Gaggiuino machine)."""
    _mock_all_categories(aioclient_mock, system=None)
    aioclient_mock.get(f"{URL}/api/machine/settings?category=system", status=501)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert "system" not in data


async def test_every_category_unreachable_returns_empty_dict(hass, aioclient_mock) -> None:
    for category in SETTINGS_CATEGORIES:
        aioclient_mock.get(f"{URL}/api/machine/settings?category={category}", exc=aiohttp.ClientConnectionError)
    coordinator = _make_coordinator(hass)

    data = await coordinator._async_update_data()

    assert data == {}
