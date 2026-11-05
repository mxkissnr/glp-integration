"""Supervisor discovery for the GLP app (#338, #363).

The app announces `{"host": "<app hostname>", "port": <int>}` for the service
`gaggiuino_profiler`. The flow builds the URL from that payload, probes it,
and asks the user to confirm before creating an entry. A stale announcement
for an app whose host-port mapping changed updates the existing entry instead
of adding a second one, and a malformed payload never reaches the network.

Since #363 an already configured app is also recognised under another address
(-- `http://localhost:8099`, an IP address) by the install id that GET
/api/status carries; only a live entry's own id may abort, and the stored id
may move an unreachable entry to the discovered address.
"""
from urllib.parse import urlparse

import pytest
from homeassistant.config_entries import SOURCE_HASSIO, ConfigEntryState
from homeassistant.helpers.service_info.hassio import HassioServiceInfo
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.diagnostics import TO_REDACT
from tests.common import mock_all_coordinator_endpoints

HOST = "5611d8a7-gaggiuino-local-profiler"
URL = f"http://{HOST}:8099"
DEV_HOST = "5611d8a7-gaggiuino-local-profiler-dev"
DEV_URL = f"http://{DEV_HOST}:8099"
PROD_ID = "11111111-1111-4111-8111-111111111111"
DEV_ID = "22222222-2222-4222-8222-222222222222"
LOCAL_URL = "http://localhost:8099"
IP_URL = "http://192.0.2.10:8099"


def _host_of(call) -> str | None:
    """The host of a recorded aioclient_mock call, whatever its URL type."""
    host = getattr(call[1], "host", None)
    return host if host else urlparse(str(call[1])).hostname


def _headers_of(call) -> dict:
    return call[3] or {}


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
        {"host": "user@evil.example", "port": 8099},
        {"host": "evil.example/x?", "port": 8099},
        {"host": "evil.example:1", "port": 8099},
        {"host": "[::1]", "port": 8099},
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


@pytest.mark.parametrize("entry_url", [LOCAL_URL, IP_URL])
async def test_same_install_id_on_another_address_aborts(
    hass, aioclient_mock, entry_url
) -> None:
    """#363: the app setup under localhost or an IP is not offered again when
    discovery announces the container hostname for the same install."""
    entry = MockConfigEntry(domain=DOMAIN, data={"url": entry_url}, unique_id=entry_url)
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{entry_url}/api/status", json={"installId": PROD_ID})
    aioclient_mock.get(f"{URL}/api/status", json={"installId": PROD_ID})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert entry.data["url"] == entry_url
    assert entry.unique_id == entry_url
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1
    assert hass.config_entries.flow.async_progress() == []


async def test_options_url_with_same_install_id_aborts(hass, aioclient_mock) -> None:
    """The URL an entry really uses can come from its options; that is the one
    compared, and the stale data URL is never contacted."""
    entry = MockConfigEntry(
        domain=DOMAIN, data={"url": IP_URL}, options={"url": URL}, unique_id=IP_URL
    )
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{URL}/api/status", json={"installId": PROD_ID})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert entry.data["url"] == IP_URL
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


async def test_a_different_install_id_is_offered_as_a_second_app(
    hass, aioclient_mock
) -> None:
    """The DEV build listens on the same container port but has its own
    database, so it is offered separately (and stores its own id)."""
    entry = MockConfigEntry(domain=DOMAIN, data={"url": LOCAL_URL}, unique_id=LOCAL_URL)
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{LOCAL_URL}/api/status", json={"installId": PROD_ID})
    mock_all_coordinator_endpoints(aioclient_mock, DEV_URL, status={"installId": DEV_ID})

    result = await _start(hass, {"host": DEV_HOST, "port": 8099})
    assert result["type"] == "form"
    assert result["step_id"] == "hassio_confirm"

    result2 = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    assert result2["type"] == "create_entry"
    entries = hass.config_entries.async_entries(DOMAIN)
    assert len(entries) == 2
    new_entry = next(e for e in entries if e.entry_id != entry.entry_id)
    assert new_entry.data["url"] == DEV_URL
    assert new_entry.data["install_id"] == DEV_ID
    assert entry.data == {"url": LOCAL_URL}
    assert entry.unique_id == LOCAL_URL


async def test_unreachable_entry_without_stored_id_is_not_touched(
    hass, aioclient_mock
) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": LOCAL_URL}, unique_id=LOCAL_URL)
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{LOCAL_URL}/api/status", status=500)
    aioclient_mock.get(f"{URL}/api/status", json={"installId": PROD_ID})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "form"
    assert result["step_id"] == "hassio_confirm"
    assert entry.data == {"url": LOCAL_URL}
    assert entry.unique_id == LOCAL_URL


async def test_unreachable_entry_with_stored_id_is_moved_to_the_discovered_url(
    hass, aioclient_mock
) -> None:
    """The app under a new address is the entry we already had: move it there
    instead of adding a second one."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"url": LOCAL_URL, "install_id": PROD_ID},
        unique_id=LOCAL_URL,
    )
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{LOCAL_URL}/api/status", status=500)
    aioclient_mock.get(f"{URL}/api/status", json={"installId": PROD_ID})

    result = await _start(hass, {"host": HOST, "port": 8099})
    await hass.async_block_till_done()

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert entry.data["url"] == URL
    assert entry.unique_id == URL
    assert entry.data["install_id"] == PROD_ID
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


async def test_stored_id_does_not_win_over_a_live_entry_with_another_id(
    hass, aioclient_mock
) -> None:
    """A stored id can be out of date after the app's database was recreated."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"url": LOCAL_URL, "install_id": PROD_ID},
        unique_id=LOCAL_URL,
    )
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{LOCAL_URL}/api/status", json={"installId": DEV_ID})
    aioclient_mock.get(f"{URL}/api/status", json={"installId": PROD_ID})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "form"
    assert result["step_id"] == "hassio_confirm"
    assert entry.data["url"] == LOCAL_URL
    assert entry.data["install_id"] == PROD_ID


async def test_live_entry_wins_over_a_dead_duplicate_with_a_stored_id(
    hass, aioclient_mock
) -> None:
    """A dead duplicate must not be moved when another entry answers."""
    dead = MockConfigEntry(
        domain=DOMAIN,
        data={"url": LOCAL_URL, "install_id": PROD_ID},
        unique_id=LOCAL_URL,
    )
    dead.add_to_hass(hass)
    live = MockConfigEntry(domain=DOMAIN, data={"url": IP_URL}, unique_id=IP_URL)
    live.add_to_hass(hass)
    aioclient_mock.get(f"{LOCAL_URL}/api/status", status=500)
    aioclient_mock.get(f"{IP_URL}/api/status", json={"installId": PROD_ID})
    aioclient_mock.get(f"{URL}/api/status", json={"installId": PROD_ID})

    result = await _start(hass, {"host": HOST, "port": 8099})
    await hass.async_block_till_done()

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert dead.data["url"] == LOCAL_URL
    assert dead.unique_id == LOCAL_URL
    assert live.data["url"] == IP_URL


@pytest.mark.parametrize("bad_id", [123, "", "{}", "not-a-uuid"])
async def test_malformed_discovered_id_skips_the_id_comparison(
    hass, aioclient_mock, bad_id
) -> None:
    """The entry URL is deliberately unmocked: touching it would fail the
    strict unmocked-request guard, so this also proves no id comparison ran."""
    entry = MockConfigEntry(domain=DOMAIN, data={"url": IP_URL}, unique_id=IP_URL)
    entry.add_to_hass(hass)
    aioclient_mock.get(f"{URL}/api/status", json={"installId": bad_id})

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "form"
    assert result["step_id"] == "hassio_confirm"
    assert entry.data["url"] == IP_URL


async def test_redirected_status_aborts_cannot_connect(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/status", status=302)

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "cannot_connect"
    assert hass.config_entries.async_entries(DOMAIN) == []


async def test_non_json_status_body_aborts_cannot_connect(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/status", text="<html>not the app</html>")

    result = await _start(hass, {"host": HOST, "port": 8099})

    assert result["type"] == "abort"
    assert result["reason"] == "cannot_connect"
    assert hass.config_entries.async_entries(DOMAIN) == []


async def test_discovery_probes_send_no_token(hass, aioclient_mock) -> None:
    """The announced host is untrusted, so the probes must not carry the
    token that belongs to the configured app."""
    mock_all_coordinator_endpoints(
        aioclient_mock, LOCAL_URL, status={"installId": PROD_ID}, token={"apiToken": "old-token"}
    )
    entry = MockConfigEntry(domain=DOMAIN, data={"url": LOCAL_URL}, unique_id=LOCAL_URL)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED

    aioclient_mock.get(f"{DEV_URL}/api/status", json={"installId": DEV_ID})
    start = len(aioclient_mock.mock_calls)

    result = await _start(hass, {"host": DEV_HOST, "port": 8099})
    await hass.async_block_till_done()

    assert result["type"] == "form"
    calls = aioclient_mock.mock_calls[start:]
    assert [call for call in calls if _host_of(call) == DEV_HOST], "discovery made no probe"
    for call in calls:
        if _host_of(call) == DEV_HOST:
            assert "X-GLP-Token" not in _headers_of(call)
    assert not any(str(call[1]).endswith("/api/token") for call in calls)


async def test_move_refetches_the_token_from_the_new_host(hass, aioclient_mock) -> None:
    """After the move the entry reloads with a fresh GlpAuth, so the token the
    old host issued never reaches the new one."""
    mock_all_coordinator_endpoints(aioclient_mock, LOCAL_URL, token={"apiToken": "old-token"})
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"url": LOCAL_URL, "install_id": PROD_ID},
        unique_id=LOCAL_URL,
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED

    aioclient_mock.clear_requests()
    # The old entry is still loaded: keep its endpoints mocked with the status
    # failing, so its own background polling cannot reach an unmocked URL.
    mock_all_coordinator_endpoints(aioclient_mock, LOCAL_URL, statuses={"status": 500})
    mock_all_coordinator_endpoints(
        aioclient_mock, URL, status={"installId": PROD_ID}, token={"apiToken": "new-token"}
    )

    result = await _start(hass, {"host": HOST, "port": 8099})
    await hass.async_block_till_done()

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert entry.data["url"] == URL
    for call in aioclient_mock.mock_calls:
        if _host_of(call) == HOST:
            assert _headers_of(call).get("X-GLP-Token") != "old-token"


async def test_setup_stores_the_install_id(hass, aioclient_mock) -> None:
    """Written before the update listener is added, so it causes no reload."""
    mock_all_coordinator_endpoints(aioclient_mock, URL, status={"installId": PROD_ID})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL}, unique_id=URL)
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.LOADED
    assert entry.data["install_id"] == PROD_ID
    token_calls = [call for call in aioclient_mock.mock_calls if str(call[1]).endswith("/api/token")]
    assert len(token_calls) == 1


async def test_setup_replaces_a_changed_install_id(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, status={"installId": PROD_ID})
    entry = MockConfigEntry(
        domain=DOMAIN, data={"url": URL, "install_id": DEV_ID}, unique_id=URL
    )
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.data["install_id"] == PROD_ID


async def test_setup_keeps_the_stored_install_id_when_status_has_none(
    hass, aioclient_mock
) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL)
    entry = MockConfigEntry(
        domain=DOMAIN, data={"url": URL, "install_id": PROD_ID}, unique_id=URL
    )
    entry.add_to_hass(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.data["install_id"] == PROD_ID


def test_install_id_is_redacted_in_diagnostics() -> None:
    assert "install_id" in TO_REDACT
