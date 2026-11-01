"""Supervisor discovery for the GLP app (#338).

The app announces `{"host": "<app hostname>", "port": <int>}` for the service
`gaggiuino_profiler`. The flow builds the URL from that payload, probes it,
and asks the user to confirm before creating an entry. A stale announcement
for an app whose host-port mapping changed updates the existing entry instead
of adding a second one, and a malformed payload never reaches the network.
"""
import pytest
from homeassistant.config_entries import SOURCE_HASSIO
from homeassistant.helpers.service_info.hassio import HassioServiceInfo
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

HOST = "5611d8a7-gaggiuino-local-profiler"
URL = f"http://{HOST}:8099"


def _discovery(config: dict, uuid: str = "abc123") -> HassioServiceInfo:
    return HassioServiceInfo(
        config=config,
        name="GLP — Gaggiuino Local Profiler",
        slug="5611d8a7_gaggiuino_local_profiler",
        uuid=uuid,
    )


async def _start(hass, config: dict):
    return await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_HASSIO},
        data=_discovery(config),
    )


async def test_discovery_asks_for_confirmation_then_creates_entry(
    hass, aioclient_mock
) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL)

    result = await _start(hass, {"host": HOST, "port": 8099})
    assert result["type"] == "form"
    assert result["step_id"] == "hassio_confirm"

    # Only now does the entry exist, and only after the user confirmed.
    assert hass.config_entries.async_entries(DOMAIN) == []

    result2 = await hass.config_entries.flow.async_configure(result["flow_id"], {})

    assert result2["type"] == "create_entry"
    assert result2["data"] == {"url": URL}
    assert result2["result"].unique_id == URL


async def test_second_discovery_of_same_url_aborts(hass, aioclient_mock) -> None:
    MockConfigEntry(domain=DOMAIN, data={"url": URL}, unique_id=URL).add_to_hass(hass)
    aioclient_mock.get(f"{URL}/api/status", json={"ok": True})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


async def test_new_port_for_same_host_updates_existing_entry(
    hass, aioclient_mock
) -> None:
    """The app's host port is not stable across restarts: a second discovery
    for a known host rewrites the entry instead of adding a duplicate."""
    old_url = f"http://{HOST}:8098"
    mock_all_coordinator_endpoints(aioclient_mock, old_url)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": old_url}, unique_id=old_url)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    mock_all_coordinator_endpoints(aioclient_mock, URL)
    aioclient_mock.get(f"{URL}/api/status", json={"ok": True})

    result = await _start(hass, {"host": HOST, "port": 8099})
    await hass.async_block_till_done()

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert entry.data["url"] == URL
    assert entry.unique_id == URL
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


@pytest.mark.parametrize(
    "config",
    [
        {"port": 8099},
        {"host": "", "port": 8099},
        {"host": HOST},
        {"host": HOST, "port": "8099"},
        {"host": HOST, "port": None},
        {"host": HOST, "port": True},
        {"host": HOST, "port": 0},
    ],
)
async def test_malformed_payload_aborts_without_a_network_call(
    hass, aioclient_mock, config
) -> None:
    result = await _start(hass, config)

    assert result["type"] == "abort"
    assert result["reason"] == "invalid_discovery_info"
    assert hass.config_entries.async_entries(DOMAIN) == []


async def test_unreachable_app_aborts_cannot_connect(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/status", status=500)

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "cannot_connect"
    assert hass.config_entries.async_entries(DOMAIN) == []


async def test_entry_from_user_flow_makes_discovery_abort(hass, aioclient_mock) -> None:
    """A manually configured entry for the same address is not duplicated."""
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{URL}/api/status", json={"ok": True})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1
