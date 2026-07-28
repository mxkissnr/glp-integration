"""Tests for auth.py: _is_trusted_host (the guard that decides whether the
privileged HA Supervisor token is forwarded to the configured GLP host --
security-relevant, a permissive guard would leak the Supervisor token to an
admin-configured, only scheme-validated URL) and GlpAuth (#67's lazy-fetch
+cache token object, extracted out of GlpDataCoordinator._headers)."""
import aiohttp
import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.auth import GlpAuth, _is_trusted_host


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8099",
        "http://127.0.0.1:8099",
        "http://[::1]:8099",
        "http://10.0.0.5:8099",
        "http://192.168.1.50:8099",
        "http://172.30.32.1:8099",
        "http://gaggiuino.local:8099",
        "http://glp.internal",
        "http://glp.intern",
        "http://homeassistant.lan",
        "http://addon.home",
        "http://box.home.arpa",
        "https://GAGGIUINO.LOCAL",  # case-insensitive suffix match
    ],
)
def test_trusted_hosts(url: str) -> None:
    assert _is_trusted_host(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://evil.example.com:8099",
        "http://8.8.8.8",
        "http://1.1.1.1:8099",
        "http://attacker.io/.local",  # suffix check is on hostname only
        "",
        "not a url",
        "http://",
    ],
)
def test_untrusted_hosts(url: str) -> None:
    assert _is_trusted_host(url) is False


def test_scheme_is_not_checked() -> None:
    """_is_trusted_host only inspects the hostname, not the scheme — the
    scheme is validated separately in config_flow. Documented here so a
    future refactor notices if this assumption changes."""
    assert _is_trusted_host("ftp://gaggiuino.local") is True


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


async def test_supervisor_token_only_sent_to_trusted_host(hass, aioclient_mock, monkeypatch) -> None:
    """Untrusted host (public hostname) must not receive the Supervisor
    token, even when SUPERVISOR_TOKEN is set."""
    monkeypatch.setenv("SUPERVISOR_TOKEN", "super-secret")
    aioclient_mock.get("http://evil.example.com/api/token", json={"apiToken": "tok"})
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, "http://evil.example.com")

    await auth.headers()

    sent_headers = aioclient_mock.mock_calls[0][3]
    assert "Authorization" not in sent_headers


async def test_supervisor_token_sent_to_trusted_host(hass, aioclient_mock, monkeypatch) -> None:
    monkeypatch.setenv("SUPERVISOR_TOKEN", "super-secret")
    aioclient_mock.get("http://localhost:8099/api/token", json={"apiToken": "tok"})
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, "http://localhost:8099")

    await auth.headers()

    sent_headers = aioclient_mock.mock_calls[0][3]
    assert sent_headers.get("Authorization") == "Bearer super-secret"
