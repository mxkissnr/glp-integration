"""Tests for GlpLiveCoordinator's SSE push path (#708/#736):
_sse_connect_once()'s SSE-frame parsing and async_sse_loop()'s
reconnect-with-backoff behavior. The regular REST poll path
(_async_update_data) is covered separately in test_live_coordinator.py."""
import asyncio

import aiohttp
import pytest
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.live_coordinator import GlpLiveCoordinator

URL = "http://glp.example.com"


def _make_coordinator(hass) -> GlpLiveCoordinator:
    session = async_get_clientsession(hass)
    auth = GlpAuth(session, URL)
    return GlpLiveCoordinator(hass, session, URL, auth)


async def test_sse_connect_once_pushes_live_snapshot_payload(hass, aioclient_mock) -> None:
    # Mirrors the app's actual wire format (routes/sse.js): a leading padding
    # comment line, an unrelated event type that must be ignored, then the
    # live-snapshot event this coordinator cares about.
    frame = (
        b":" + b" " * 8 + b"\n\n"
        b"event: sync-progress\ndata: {\"machineId\": 1}\n\n"
        b"event: live-snapshot\ndata: {\"isLive\": true, \"profileName\": \"Adaptive\"}\n\n"
    )
    aioclient_mock.get(f"{URL}/api/events", content=frame)
    coordinator = _make_coordinator(hass)

    await coordinator._sse_connect_once()

    assert coordinator.data == {"isLive": True, "profileName": "Adaptive"}
    assert coordinator._sse_healthy()


async def test_sse_connect_once_ignores_non_live_snapshot_events(hass, aioclient_mock) -> None:
    frame = b"event: sync-progress\ndata: {\"machineId\": 1}\n\n"
    aioclient_mock.get(f"{URL}/api/events", content=frame)
    coordinator = _make_coordinator(hass)

    await coordinator._sse_connect_once()

    assert coordinator.data is None
    assert not coordinator._sse_healthy()


async def test_sse_connect_once_skips_malformed_json(hass, aioclient_mock) -> None:
    frame = b"event: live-snapshot\ndata: {not-json\n\n"
    aioclient_mock.get(f"{URL}/api/events", content=frame)
    coordinator = _make_coordinator(hass)

    await coordinator._sse_connect_once()

    assert coordinator.data is None


async def test_sse_loop_reconnects_with_capped_exponential_backoff(hass, monkeypatch) -> None:
    coordinator = _make_coordinator(hass)
    attempts = []

    async def fake_connect_once():
        attempts.append(1)
        raise aiohttp.ClientConnectionError("boom")

    monkeypatch.setattr(coordinator, "_sse_connect_once", fake_connect_once)

    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)
        if len(sleep_calls) >= 3:
            raise asyncio.CancelledError

    coordinator._sleep = fake_sleep

    with pytest.raises(asyncio.CancelledError):
        await coordinator.async_sse_loop()

    assert attempts == [1, 1, 1]
    assert sleep_calls == [1, 2, 4]  # doubles each failed attempt


async def test_sse_loop_resets_backoff_after_clean_connect(hass, monkeypatch) -> None:
    coordinator = _make_coordinator(hass)
    connect_results = iter([
        aiohttp.ClientConnectionError("boom"),
        None,  # clean connect/disconnect -- resets backoff
        aiohttp.ClientConnectionError("boom again"),
    ])

    async def fake_connect_once():
        result = next(connect_results)
        if result is not None:
            raise result

    monkeypatch.setattr(coordinator, "_sse_connect_once", fake_connect_once)

    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)
        if len(sleep_calls) >= 3:
            raise asyncio.CancelledError

    coordinator._sleep = fake_sleep

    with pytest.raises(asyncio.CancelledError):
        await coordinator.async_sse_loop()

    # 1st failure -> sleep(1); clean connect resets backoff -> sleep(1) again; 2nd failure -> sleep(2)
    assert sleep_calls == [1, 1, 2]
