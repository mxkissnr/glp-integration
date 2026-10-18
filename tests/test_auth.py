"""Tests for auth.py: GlpAuth (#67's lazy-fetch + cache token object,
extracted out of GlpDataCoordinator._headers)."""
import aiohttp
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.auth import GlpAuth


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
