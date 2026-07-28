"""Tests for reaching the add-on over the internal Supervisor container
network instead of `localhost:<host-port>` (#75).

`_auto_discover_internal_url` must only ever return a candidate URL after
successfully probing it live with GET /api/status -- any failure (missing
token, add-on not found, no container port, wrong hostname guess, add-on
unreachable on that network) must fall through to None so `_auto_discover_url`
falls back to the pre-#75 host-port path (#78) unchanged.
"""
import aiohttp
import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.auth import _is_trusted_host
from custom_components.gaggiuino_profiler.config_flow import (
    _addon_hostname,
    _auto_discover_internal_url,
    _auto_discover_url,
    _container_port,
)
from custom_components.gaggiuino_profiler.const import DEFAULT_URL

_ADDONS_LIST_RESPONSE = {
    "result": "ok",
    "data": {
        "addons": [
            {"name": "File editor", "slug": "core_configurator"},
            {
                "name": "GLP — Gaggiuino Local Profiler",
                "slug": "5611d8a7_gaggiuino_local_profiler",
            },
        ]
    },
}


@pytest.fixture(autouse=True)
def _supervisor_token(monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test-token")


def test_container_port_parses_from_network_key() -> None:
    assert _container_port({"network": {"8099/tcp": 8123}}) == 8099


def test_container_port_none_when_no_network_data() -> None:
    assert _container_port({}) is None
    assert _container_port({"network": {}}) is None


def test_addon_hostname_prefers_explicit_hostname_field() -> None:
    assert _addon_hostname("5611d8a7_gaggiuino_local_profiler", {"hostname": "custom-host"}) == "custom-host"


def test_addon_hostname_falls_back_to_slug_transform() -> None:
    assert (
        _addon_hostname("5611d8a7_gaggiuino_local_profiler", {})
        == "5611d8a7-gaggiuino-local-profiler"
    )


async def test_internal_url_returned_when_reachable(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://supervisor/addons", json=_ADDONS_LIST_RESPONSE)
    aioclient_mock.get(
        "http://supervisor/addons/5611d8a7_gaggiuino_local_profiler/info",
        json={"data": {"network": {"8099/tcp": 8123}}},
    )
    aioclient_mock.get(
        "http://5611d8a7-gaggiuino-local-profiler:8099/api/status", json={}
    )

    session = async_get_clientsession(hass)
    url = await _auto_discover_internal_url(session)

    assert url == "http://5611d8a7-gaggiuino-local-profiler:8099"


async def test_internal_url_prefers_explicit_hostname_field(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://supervisor/addons", json=_ADDONS_LIST_RESPONSE)
    aioclient_mock.get(
        "http://supervisor/addons/5611d8a7_gaggiuino_local_profiler/info",
        json={"data": {"network": {"8099/tcp": 8123}, "hostname": "glp-addon"}},
    )
    aioclient_mock.get("http://glp-addon:8099/api/status", json={})

    session = async_get_clientsession(hass)
    url = await _auto_discover_internal_url(session)

    assert url == "http://glp-addon:8099"


async def test_internal_url_none_when_probe_fails(hass, aioclient_mock) -> None:
    """A wrong hostname guess must fail soft, not raise or wrongly succeed."""
    aioclient_mock.get("http://supervisor/addons", json=_ADDONS_LIST_RESPONSE)
    aioclient_mock.get(
        "http://supervisor/addons/5611d8a7_gaggiuino_local_profiler/info",
        json={"data": {"network": {"8099/tcp": 8123}}},
    )
    aioclient_mock.get(
        "http://5611d8a7-gaggiuino-local-profiler:8099/api/status",
        exc=aiohttp.ClientConnectionError,
    )

    session = async_get_clientsession(hass)
    url = await _auto_discover_internal_url(session)

    assert url is None


async def test_internal_url_none_when_no_matching_addon(hass, aioclient_mock) -> None:
    aioclient_mock.get(
        "http://supervisor/addons",
        json={"result": "ok", "data": {"addons": [{"slug": "core_ssh"}]}},
    )

    session = async_get_clientsession(hass)
    url = await _auto_discover_internal_url(session)

    assert url is None


async def test_internal_url_none_without_supervisor_token(hass, aioclient_mock, monkeypatch) -> None:
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)

    session = async_get_clientsession(hass)
    url = await _auto_discover_internal_url(session)

    assert url is None
    assert len(aioclient_mock.mock_calls) == 0


async def test_auto_discover_url_prefers_internal_over_host_port(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://supervisor/addons", json=_ADDONS_LIST_RESPONSE)
    aioclient_mock.get(
        "http://supervisor/addons/5611d8a7_gaggiuino_local_profiler/info",
        json={"data": {"network": {"8099/tcp": 8123}}},
    )
    aioclient_mock.get(
        "http://5611d8a7-gaggiuino-local-profiler:8099/api/status", json={}
    )

    session = async_get_clientsession(hass)
    url = await _auto_discover_url(session)

    assert url == "http://5611d8a7-gaggiuino-local-profiler:8099"


async def test_auto_discover_url_falls_back_to_host_port_when_internal_unreachable(
    hass, aioclient_mock
) -> None:
    aioclient_mock.get("http://supervisor/addons", json=_ADDONS_LIST_RESPONSE)
    aioclient_mock.get(
        "http://supervisor/addons/5611d8a7_gaggiuino_local_profiler/info",
        json={"data": {"network": {"8099/tcp": 8123}}},
    )
    aioclient_mock.get(
        "http://5611d8a7-gaggiuino-local-profiler:8099/api/status",
        exc=aiohttp.ClientConnectionError,
    )

    session = async_get_clientsession(hass)
    url = await _auto_discover_url(session)

    assert url == "http://localhost:8123"


async def test_auto_discover_url_falls_back_to_default_when_nothing_works(hass, aioclient_mock) -> None:
    aioclient_mock.get(
        "http://supervisor/addons", exc=aiohttp.ClientConnectionError
    )

    session = async_get_clientsession(hass)
    url = await _auto_discover_url(session)

    assert url == DEFAULT_URL


def test_is_trusted_host_trusts_addon_internal_hostname() -> None:
    assert _is_trusted_host("http://gaggiuino-local-profiler:8099") is True
    assert _is_trusted_host("http://5611d8a7-gaggiuino-local-profiler:8099") is True


def test_is_trusted_host_does_not_trust_unrelated_hostnames() -> None:
    assert _is_trusted_host("http://evil-gaggiuino-local-profiler.attacker.io") is False
    assert _is_trusted_host("http://gaggiuino-local-profiler.attacker.io") is False
