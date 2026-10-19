"""Tests for auth.py: GlpAuth (#67's lazy-fetch + cache token object,
extracted out of GlpDataCoordinator._headers)."""
import asyncio

import aiohttp
import pytest
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMockResponse
from yarl import URL

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator

URL = "http://glp.local:8099"


def _mock_sequence(aioclient_mock, method: str, url: str, *responses: dict) -> None:
    """Answer repeated requests to *url* with *responses*, in order."""
    pending = list(responses)

    async def _next(request_method, request_url, _data):
        return AiohttpClientMockResponse(
            method=request_method, url=URL(request_url), **pending.pop(0)
        )

    aioclient_mock.request(method, url, side_effect=_next)


async def test_headers_fetches_and_caches_token(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://glp.local:8099/api/token", json={"apiToken": "tok-123"})
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, "http://glp.local:8099")

    headers = await auth.headers()
    assert headers == {"X-GLP-Token": "tok-123"}

    # Second call must not issue a second request — the token is cached.
    headers_again = await auth.headers()
    assert headers_again == {"X-GLP-Token": "tok-123"}
    assert len(aioclient_mock.mock_calls) == 1


async def test_headers_empty_when_token_endpoint_errors(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://glp.local:8099/api/token", status=500)
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, "http://glp.local:8099")

    assert await auth.headers() == {}


async def test_headers_empty_when_token_endpoint_unreachable(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://glp.local:8099/api/token", exc=aiohttp.ClientConnectionError)
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, "http://glp.local:8099")

    assert await auth.headers() == {}


async def test_parallel_headers_fetch_token_once(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "tok-123"})
    auth = GlpAuth(async_get_clientsession(hass), URL)

    first, second = await asyncio.gather(auth.headers(), auth.headers())

    assert first == second == {"X-GLP-Token": "tok-123"}
    assert len(aioclient_mock.mock_calls) == 1


async def test_post_retries_once_with_fresh_token_on_401(hass, aioclient_mock) -> None:
    _mock_sequence(
        aioclient_mock,
        "get",
        f"{URL}/api/token",
        {"json": {"apiToken": "old-token"}},
        {"json": {"apiToken": "new-token"}},
    )
    _mock_sequence(
        aioclient_mock,
        "post",
        f"{URL}/api/machine/tare",
        {"status": 401},
        {"status": 200},
    )
    auth = GlpAuth(async_get_clientsession(hass), URL)

    await auth.post("/api/machine/tare", json={})

    token_calls = [c for c in aioclient_mock.mock_calls if c[0].lower() == "get"]
    assert len(token_calls) == 2
    posts = [c for c in aioclient_mock.mock_calls if c[0].lower() == "post"]
    assert [p[3]["X-GLP-Token"] for p in posts] == ["old-token", "new-token"]


async def test_post_gives_up_after_second_401(hass, aioclient_mock) -> None:
    _mock_sequence(
        aioclient_mock,
        "get",
        f"{URL}/api/token",
        {"json": {"apiToken": "old-token"}},
        {"json": {"apiToken": "new-token"}},
    )
    _mock_sequence(
        aioclient_mock,
        "post",
        f"{URL}/api/machine/tare",
        {"status": 401},
        {"status": 401},
    )
    auth = GlpAuth(async_get_clientsession(hass), URL)

    with pytest.raises(HomeAssistantError, match="401"):
        await auth.post("/api/machine/tare", json={})

    assert len([c for c in aioclient_mock.mock_calls if c[0].lower() == "post"]) == 2


async def test_post_wraps_aiohttp_errors(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "tok-123"})
    aioclient_mock.post(
        f"{URL}/api/machine/tare", exc=aiohttp.ClientConnectionError("connection lost")
    )
    auth = GlpAuth(async_get_clientsession(hass), URL)

    with pytest.raises(HomeAssistantError, match="connection lost"):
        await auth.post("/api/machine/tare", json={})


async def test_data_coordinator_401_on_status_invalidates_cached_token(
    hass, aioclient_mock
) -> None:
    _mock_sequence(
        aioclient_mock,
        "get",
        f"{URL}/api/token",
        {"json": {"apiToken": "old-token"}},
        {"json": {"apiToken": "new-token"}},
    )
    aioclient_mock.get(f"{URL}/api/status", status=401)
    aioclient_mock.get(f"{URL}/shots.json?limit=10", json=[])
    aioclient_mock.get(f"{URL}/shots.json", json=[])
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    coordinator = GlpDataCoordinator(hass, async_get_clientsession(hass), URL)
    assert await coordinator.auth.headers() == {"X-GLP-Token": "old-token"}

    with pytest.raises(UpdateFailed):
        await coordinator._async_update_data()
    await hass.async_block_till_done()

    # The stale header is gone, so the next poll fetches the new token.
    assert await coordinator.auth.headers() == {"X-GLP-Token": "new-token"}


async def test_token_request_has_no_authorization_header(hass, aioclient_mock, monkeypatch) -> None:
    """The token request carries no Authorization header, even with
    SUPERVISOR_TOKEN set and a LAN URL."""
    monkeypatch.setenv("SUPERVISOR_TOKEN", "super-secret")
    aioclient_mock.get("http://192.168.1.50:8099/api/token", json={"apiToken": "tok"})
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, "http://192.168.1.50:8099")

    await auth.headers()

    sent_headers = aioclient_mock.mock_calls[0][3] or {}
    assert "Authorization" not in sent_headers
