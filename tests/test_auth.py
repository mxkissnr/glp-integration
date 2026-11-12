"""Tests for auth.py: GlpAuth (#67's lazy-fetch + cache token object,
extracted out of GlpDataCoordinator._headers)."""
import asyncio

import aiohttp
import pytest
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator
from custom_components.gaggiuino_profiler.live_coordinator import GlpLiveCoordinator
from custom_components.gaggiuino_profiler.machine_coordinator import GlpMachineCoordinator
from custom_components.gaggiuino_profiler.settings_coordinator import GlpSettingsCoordinator
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.local:8099"


class _FakeResponse:
    def __init__(self, status: int = 200, payload: dict | None = None) -> None:
        self.status = status
        self._payload = payload or {}

    def raise_for_status(self) -> None:
        if self.status >= 400:
            raise aiohttp.ClientResponseError(
                request_info=None, history=None, status=self.status
            )

    async def json(self) -> dict:
        return self._payload


class _FakeRequest:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    async def __aenter__(self) -> _FakeResponse:
        return self._response

    async def __aexit__(self, *exc_info: object) -> bool:
        return False


class _FakeSession:
    """Scripted token and POST responses that records the sent headers."""

    def __init__(
        self,
        tokens: list[str | None] | None = None,
        post_statuses: list[int] | None = None,
    ) -> None:
        self._tokens = list(tokens or [])
        self._post_statuses = list(post_statuses or [])
        self.token_calls = 0
        self.posts: list[dict[str, str]] = []

    def get(self, url: str, *, timeout: object = None) -> _FakeRequest:
        self.token_calls += 1
        token = self._tokens.pop(0) if self._tokens else None
        payload = {"apiToken": token} if token else {}
        return _FakeRequest(_FakeResponse(payload=payload))

    def post(
        self,
        url: str,
        *,
        json: dict | None = None,
        headers: dict | None = None,
        timeout: object = None,
    ) -> _FakeRequest:
        self.posts.append(headers or {})
        status = self._post_statuses.pop(0) if self._post_statuses else 200
        return _FakeRequest(_FakeResponse(status=status))


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


async def test_post_retries_once_with_fresh_token_on_401() -> None:
    session = _FakeSession(tokens=["old-token", "new-token"], post_statuses=[401, 200])
    auth = GlpAuth(session, URL)

    await auth.post("/api/machine/tare", json={})

    assert session.token_calls == 2
    assert session.posts == [
        {"X-GLP-Token": "old-token"},
        {"X-GLP-Token": "new-token"},
    ]


async def test_post_gives_up_after_second_401() -> None:
    session = _FakeSession(tokens=["old-token", "new-token"], post_statuses=[401, 401])
    auth = GlpAuth(session, URL)

    with pytest.raises(HomeAssistantError) as exc_info:
        await auth.post("/api/machine/tare", json={})

    assert exc_info.value.translation_key == "request_failed"
    assert "401" in exc_info.value.translation_placeholders["error"]
    assert len(session.posts) == 2


async def test_reject_if_unauthorized_drops_the_token_only_on_401(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "tok-123"})
    auth = GlpAuth(async_get_clientsession(hass), URL)
    assert await auth.headers() == {"X-GLP-Token": "tok-123"}

    def http_error(status: int) -> aiohttp.ClientResponseError:
        return aiohttp.ClientResponseError(request_info=None, history=None, status=status)

    assert auth.reject_if_unauthorized(http_error(500)) is False
    assert auth.reject_if_unauthorized(aiohttp.ClientConnectionError("boom")) is False
    assert await auth.headers() == {"X-GLP-Token": "tok-123"}

    assert auth.reject_if_unauthorized(http_error(401)) is True
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "tok-456"})
    assert await auth.headers() == {"X-GLP-Token": "tok-456"}


async def test_post_wraps_aiohttp_errors(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "tok-123"})
    aioclient_mock.post(
        f"{URL}/api/machine/tare", exc=aiohttp.ClientConnectionError("connection lost")
    )
    auth = GlpAuth(async_get_clientsession(hass), URL)

    with pytest.raises(HomeAssistantError) as exc_info:
        await auth.post("/api/machine/tare", json={})

    assert exc_info.value.translation_key == "request_failed"
    assert "connection lost" in exc_info.value.translation_placeholders["error"]


async def test_data_coordinator_401_on_shots_invalidates_cached_token(
    hass, aioclient_mock
) -> None:
    # The app serves /api/status without a token, so the 401 for a stale token
    # comes on the other requests -- /shots.json here (#390).
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses={"shots": 401})
    token_session = _FakeSession(tokens=["old-token", "new-token"])
    auth = GlpAuth(token_session, URL)
    coordinator = GlpDataCoordinator(
        hass, async_get_clientsession(hass), URL, auth=auth
    )
    assert await coordinator.auth.headers() == {"X-GLP-Token": "old-token"}

    with pytest.raises(UpdateFailed) as exc_info:
        await coordinator._async_update_data()
    await hass.async_block_till_done()

    assert "rejected the API token" in str(exc_info.value)
    # The stale header is gone, so the next poll fetches the new token.
    assert await coordinator.auth.headers() == {"X-GLP-Token": "new-token"}
    assert token_session.token_calls == 2


async def test_data_coordinator_401_on_optional_fetch_invalidates_cached_token(
    hass, aioclient_mock
) -> None:
    """An optional endpoint answering 401 must drop the token too, without
    failing the whole update (its failure stays a fallback to the default)."""
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses={"version": 401})
    token_session = _FakeSession(tokens=["old-token", "new-token"])
    auth = GlpAuth(token_session, URL)
    coordinator = GlpDataCoordinator(
        hass, async_get_clientsession(hass), URL, auth=auth
    )
    assert await coordinator.auth.headers() == {"X-GLP-Token": "old-token"}

    data = await coordinator._async_update_data()
    await hass.async_block_till_done()

    assert data["machine_status"] == "online"
    assert await coordinator.auth.headers() == {"X-GLP-Token": "new-token"}
    assert token_session.token_calls == 2


async def test_live_coordinator_401_invalidates_cached_token(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses={"live_data": 401})
    token_session = _FakeSession(tokens=["old-token", "new-token"])
    auth = GlpAuth(token_session, URL)
    coordinator = GlpLiveCoordinator(
        hass, async_get_clientsession(hass), URL, auth
    )
    assert await coordinator._auth.headers() == {"X-GLP-Token": "old-token"}

    with pytest.raises(UpdateFailed) as exc_info:
        await coordinator._async_update_data()
    await hass.async_block_till_done()

    assert "rejected the API token" in str(exc_info.value)
    assert await coordinator._auth.headers() == {"X-GLP-Token": "new-token"}
    assert token_session.token_calls == 2


async def test_live_coordinator_event_stream_401_invalidates_cached_token(
    hass, aioclient_mock
) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses={"events": 401})
    token_session = _FakeSession(tokens=["old-token", "new-token"])
    auth = GlpAuth(token_session, URL)
    coordinator = GlpLiveCoordinator(
        hass, async_get_clientsession(hass), URL, auth
    )
    assert await coordinator._auth.headers() == {"X-GLP-Token": "old-token"}

    with pytest.raises(aiohttp.ClientResponseError):
        await coordinator._sse_connect_once()
    await hass.async_block_till_done()

    # The next reconnect fetches a fresh token.
    assert await coordinator._auth.headers() == {"X-GLP-Token": "new-token"}
    assert token_session.token_calls == 2


async def test_machine_coordinator_401_invalidates_cached_token(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses={"machine_status": 401})
    token_session = _FakeSession(tokens=["old-token", "new-token"])
    auth = GlpAuth(token_session, URL)
    coordinator = GlpMachineCoordinator(
        hass, async_get_clientsession(hass), URL, auth
    )
    assert await coordinator.auth.headers() == {"X-GLP-Token": "old-token"}

    with pytest.raises(UpdateFailed) as exc_info:
        await coordinator._async_update_data()
    await hass.async_block_till_done()

    assert "rejected the API token" in str(exc_info.value)
    assert await coordinator.auth.headers() == {"X-GLP-Token": "new-token"}
    assert token_session.token_calls == 2


async def test_settings_coordinator_401_invalidates_cached_token(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses={"settings": 401})
    token_session = _FakeSession(tokens=["old-token", "new-token"])
    auth = GlpAuth(token_session, URL)
    coordinator = GlpSettingsCoordinator(
        hass, async_get_clientsession(hass), URL, auth
    )
    assert await coordinator.auth.headers() == {"X-GLP-Token": "old-token"}

    assert await coordinator._async_update_data() == {}
    await hass.async_block_till_done()

    assert await coordinator.auth.headers() == {"X-GLP-Token": "new-token"}
    assert token_session.token_calls == 2


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
