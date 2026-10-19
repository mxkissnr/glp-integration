"""Regression tests for #235 (part 2): entities must go unavailable when a
coordinator update fails, and settings writes must be built from a fresh
per-category GET instead of the up-to-30 s-old poll snapshot.
"""
from __future__ import annotations

import aiohttp
import pytest
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.update_coordinator import UpdateFailed
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import (
    AiohttpClientMockResponse,
)

from custom_components.gaggiuino_profiler.const import DOMAIN

URL = "http://glp.example.com"

LED_SETTINGS = {"state": "true", "color": {"R": 10, "G": 20, "B": 30}, "disco": "false", "tof": {"min": 5, "max": 50}}
BOILER_SETTINGS = {
    "steamSetPoint": 145, "offsetTemp": 1.5, "hpwr": 800,
    "mainDivider": 2, "brewDivider": 2, "startupHeatDelta": 5,
    "brewDeltaState": "true", "dreamSteamState": "false",
}
DISPLAY_SETTINGS = {
    "lcdBrightness": 80, "lcdSleep": 5, "lcdGoHome": 10,
    "lcdDarkMode": "false", "lcdCloseOnBrewOff": True, "simpleUI": False,
}
SCALES_SETTINGS = {"forcePredictive": "true", "hwScalesEnabled": "true", "btScalesEnabled": "false"}
SYSTEM_SETTINGS = {"releaseChannel": 1}

ENTITY_IDS = (
    "sensor.gaggiuino_local_profiler_machine_live_pressure",
    "binary_sensor.gaggiuino_local_profiler_steam_switch",
    "select.gaggiuino_local_profiler_release_channel",
    "number.gaggiuino_local_profiler_steam_set_point",
    "switch.gaggiuino_local_profiler_bt_scales_enabled",
    "light.gaggiuino_local_profiler_led",
)


def _dynamic_get(aioclient_mock, url: str, holder: dict) -> None:
    """Register a GET whose response is read from `holder["response"]` at
    request time -- lets a test change or break the endpoint after setup."""

    async def _handler(method, request_url, data):
        response = holder["response"]
        if isinstance(response, Exception):
            return AiohttpClientMockResponse(method, request_url, exc=response, status=500)
        return AiohttpClientMockResponse(method, request_url, json=response)

    aioclient_mock.get(url, side_effect=_handler)


def _mock_all_coordinator_endpoints(aioclient_mock, url: str, boiler_holder: dict | None = None) -> None:
    aioclient_mock.get(f"{url}/api/status", json={})
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json?limit=10", json=[])
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json={})
    aioclient_mock.get(f"{url}/api/machine/profiles", json={})
    aioclient_mock.get(f"{url}/api/menu", json=[])
    aioclient_mock.get(f"{url}/api/version", json={})
    aioclient_mock.get(f"{url}/api/live/data", json={})
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": True, "profileName": "Adaptive"})
    aioclient_mock.get(
        f"{url}/api/machine/live",
        json={"sensorSnap": None, "sysState": {"operationMode": 4, "coreVersion": "1.2.3", "timeAlive": 1000}},
    )
    if boiler_holder is None:
        boiler_holder = {"response": BOILER_SETTINGS}
    _dynamic_get(aioclient_mock, f"{url}/api/machine/settings?category=boiler", boiler_holder)
    aioclient_mock.get(f"{url}/api/machine/settings?category=display", json=DISPLAY_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=led", json=LED_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=scales", json=SCALES_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=system", json=SYSTEM_SETTINGS)


async def _setup_entry(hass, aioclient_mock, boiler_holder: dict | None = None):
    _mock_all_coordinator_endpoints(aioclient_mock, URL, boiler_holder)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _post_calls(aioclient_mock):
    return [c for c in aioclient_mock.mock_calls if c[0].lower() == "post"]


async def test_entities_go_unavailable_after_coordinator_update_failure(hass, aioclient_mock) -> None:
    entry = await _setup_entry(hass, aioclient_mock)

    for entity_id in ENTITY_IDS:
        state = hass.states.get(entity_id)
        assert state is not None, entity_id
        assert state.state != "unavailable", entity_id

    for key in ("data", "machine", "settings"):
        hass.data[DOMAIN][entry.entry_id][key].async_set_update_error(UpdateFailed("unreachable"))
    await hass.async_block_till_done()

    for entity_id in ENTITY_IDS:
        state = hass.states.get(entity_id)
        assert state is not None, entity_id
        assert state.state == "unavailable", entity_id


async def test_number_write_uses_freshly_fetched_category(hass, aioclient_mock) -> None:
    """A sibling field changed on the machine's screen since the last poll
    must survive the read-modify-write."""
    boiler_holder = {"response": BOILER_SETTINGS}
    entry = await _setup_entry(hass, aioclient_mock, boiler_holder)
    settings = hass.data[DOMAIN][entry.entry_id]["settings"]
    # Simulate a stale poll snapshot: hpwr still 800 in the coordinator data.
    settings.async_set_updated_data({"boiler": dict(BOILER_SETTINGS)})
    # Meanwhile the machine itself now reports hpwr=900.
    boiler_holder["response"] = {**BOILER_SETTINGS, "hpwr": 900}
    aioclient_mock.post(f"{URL}/api/machine/settings/boiler", json={"success": True})

    await hass.services.async_call(
        "number", "set_value",
        {"entity_id": "number.gaggiuino_local_profiler_steam_set_point", "value": 150},
        blocking=True,
    )
    await hass.async_block_till_done()

    _, called_url, body, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/settings/boiler")
    assert body["steamSetPoint"] == 150
    assert body["hpwr"] == 900


async def test_number_write_fetch_failure_raises_and_does_not_post(hass, aioclient_mock) -> None:
    boiler_holder = {"response": BOILER_SETTINGS}
    await _setup_entry(hass, aioclient_mock, boiler_holder)
    boiler_holder["response"] = aiohttp.ClientConnectionError("machine off")
    aioclient_mock.post(f"{URL}/api/machine/settings/boiler", json={"success": True})

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            "number", "set_value",
            {"entity_id": "number.gaggiuino_local_profiler_steam_set_point", "value": 150},
            blocking=True,
        )
    await hass.async_block_till_done()

    assert _post_calls(aioclient_mock) == []


async def test_integer_number_field_is_sent_as_int(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{URL}/api/machine/settings/display", json={"success": True})

    await hass.services.async_call(
        "number", "set_value",
        {"entity_id": "number.gaggiuino_local_profiler_lcd_brightness", "value": 55.0},
        blocking=True,
    )
    await hass.async_block_till_done()

    _, _, body, _ = _post_calls(aioclient_mock)[0]
    assert body["lcdBrightness"] == 55
    assert isinstance(body["lcdBrightness"], int)
