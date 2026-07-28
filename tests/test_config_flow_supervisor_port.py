"""Tests for _supervisor_port()'s add-on slug resolution (#78).

Supervisor does not expose installed add-ons under their bare config.yaml
slug — it prefixes them with a repository identifier (`local_`, `core_`,
or an 8-char sha1 hash of the repo URL for a custom repository like GLP's).
_supervisor_port() must resolve the real slug via GET /addons before it can
read the port from GET /addons/<slug>/info.
"""
import aiohttp
import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.config_flow import _supervisor_port

# A realistic slice of a real installation's `/addons` response: 23 add-ons,
# several with hash prefixes from different custom repositories, including
# GLP's own (`5611d8a7_gaggiuino_local_profiler`, matching the slug Max
# confirmed live against his Supervisor).
_ADDONS_LIST_RESPONSE = {
    "result": "ok",
    "data": {
        "addons": [
            {"name": "File editor", "slug": "core_configurator"},
            {"name": "Mosquitto broker", "slug": "core_mosquitto"},
            {"name": "Samba share", "slug": "core_samba"},
            {"name": "ESPHome", "slug": "5c53de3b_esphome"},
            {"name": "Zigbee2MQTT", "slug": "a0d7b954_zigbee2mqtt"},
            {"name": "AdGuard Home", "slug": "a0d7b954_adguard"},
            {
                "name": "GLP — Gaggiuino Local Profiler",
                "slug": "5611d8a7_gaggiuino_local_profiler",
            },
            {"name": "Some other profiler", "slug": "9f1c2ab3_local_profiler"},
            {"name": "Terminal & SSH", "slug": "core_ssh"},
        ]
    },
}

_ADDON_INFO_RESPONSE = {
    "result": "ok",
    "data": {
        "slug": "5611d8a7_gaggiuino_local_profiler",
        "network": {"8099/tcp": 8123},
    },
}


@pytest.fixture(autouse=True)
def _supervisor_token(monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test-token")


async def test_resolves_real_slug_and_returns_port(hass, aioclient_mock) -> None:
    aioclient_mock.get(
        "http://supervisor/addons", json=_ADDONS_LIST_RESPONSE
    )
    aioclient_mock.get(
        "http://supervisor/addons/5611d8a7_gaggiuino_local_profiler/info",
        json=_ADDON_INFO_RESPONSE,
    )

    session = async_get_clientsession(hass)
    port = await _supervisor_port(session)

    assert port == 8123


async def test_no_matching_addon_returns_none(hass, aioclient_mock) -> None:
    addons_without_glp = {
        "result": "ok",
        "data": {
            "addons": [
                {"name": "File editor", "slug": "core_configurator"},
                {"name": "Some other profiler", "slug": "9f1c2ab3_local_profiler"},
            ]
        },
    }
    aioclient_mock.get("http://supervisor/addons", json=addons_without_glp)

    session = async_get_clientsession(hass)
    port = await _supervisor_port(session)

    assert port is None


async def test_supervisor_unreachable_returns_none(hass, aioclient_mock) -> None:
    aioclient_mock.get(
        "http://supervisor/addons", exc=aiohttp.ClientConnectionError
    )

    session = async_get_clientsession(hass)
    port = await _supervisor_port(session)

    assert port is None


async def test_supervisor_list_error_status_returns_none(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://supervisor/addons", status=500)

    session = async_get_clientsession(hass)
    port = await _supervisor_port(session)

    assert port is None


async def test_no_supervisor_token_returns_none_without_network_call(
    hass, aioclient_mock, monkeypatch
) -> None:
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)

    session = async_get_clientsession(hass)
    port = await _supervisor_port(session)

    assert port is None
    assert len(aioclient_mock.mock_calls) == 0
