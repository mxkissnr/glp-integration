import asyncio
import json
import logging
import time
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .auth import GlpAuth
from .const import DOMAIN, LIVE_INTERVAL_SECONDS, LIVE_SSE_STALE_SECONDS

_LOGGER = logging.getLogger(__name__)

# Reconnect-with-backoff bounds for the SSE stream (app restart, HA Ingress
# restart, network blip) -- doubles each failed attempt, capped at the max.
_SSE_RECONNECT_MIN_SECONDS = 1
_SSE_RECONNECT_MAX_SECONDS = 30

# Wire event name from the app's lib/events.js EVENTS.LIVE_SNAPSHOT (#736).
_SSE_LIVE_SNAPSHOT_EVENT = "live-snapshot"


class GlpLiveCoordinator(DataUpdateCoordinator):
    """Live brewing state (#708/#736).

    Primarily driven by SSE push: `async_sse_loop()` (started as a background
    task tied to the config entry, see `__init__.py`) consumes `GET
    /api/events` and calls `async_set_updated_data()` directly on every
    `live-snapshot` event, bypassing the poll cycle for sub-second latency.

    `_async_update_data()` (the regular poll path, still driven by
    `update_interval` below) is kept as a fallback safety net for whenever
    the SSE stream is down or hasn't connected yet -- see
    `LIVE_SSE_STALE_SECONDS` in `const.py`. While SSE looks healthy it's a
    no-op that returns the cached data unchanged instead of hitting
    `/api/live/data` again.
    """

    def __init__(self, hass: HomeAssistant, session: aiohttp.ClientSession, url: str, auth: GlpAuth):
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_live",
            update_interval=timedelta(seconds=LIVE_INTERVAL_SECONDS),
        )
        self._session = session
        self._url     = url.rstrip("/")
        self._auth    = auth
        self._sse_last_event_monotonic: float | None = None
        # Instance seam so tests can fake reconnect backoff timing without
        # monkeypatching the global asyncio.sleep (which would also delay
        # unrelated sleeps elsewhere in the same event loop, e.g. during
        # fixture teardown).
        self._sleep = asyncio.sleep

    async def _async_update_data(self) -> dict:
        if self.data is not None and self._sse_healthy():
            return self.data
        try:
            headers = await self._auth.headers()
            async with self._session.get(
                f"{self._url}/api/live/data",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                r.raise_for_status()
                return await r.json()
        except Exception as err:
            raise UpdateFailed(f"GLP live unreachable: {err}") from err

    def _sse_healthy(self) -> bool:
        return (
            self._sse_last_event_monotonic is not None
            and (time.monotonic() - self._sse_last_event_monotonic) < LIVE_SSE_STALE_SECONDS
        )

    async def async_sse_loop(self) -> None:
        """Runs for the lifetime of the config entry (started via
        `entry.async_create_background_task`, which also cancels it on
        unload -- see `__init__.py`). Reconnects with capped exponential
        backoff on any drop; a clean read of at least one full SSE frame
        resets the backoff so a brief blip doesn't compound into a long wait."""
        backoff = _SSE_RECONNECT_MIN_SECONDS
        while True:
            try:
                await self._sse_connect_once()
            except asyncio.CancelledError:
                raise
            except Exception as err:
                _LOGGER.debug("GLP live SSE stream error, retrying in %ss: %s", backoff, err)
            else:
                backoff = _SSE_RECONNECT_MIN_SECONDS
            await self._sleep(backoff)
            backoff = min(backoff * 2, _SSE_RECONNECT_MAX_SECONDS)

    async def _sse_connect_once(self) -> None:
        headers = await self._auth.headers()
        headers = {**headers, "Accept": "text/event-stream"}
        async with self._session.get(
            f"{self._url}/api/events",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=None, sock_connect=10, sock_read=60),
        ) as r:
            r.raise_for_status()
            event_name: str | None = None
            async for raw_line in r.content:
                line = raw_line.decode("utf-8", errors="ignore").rstrip("\r\n")
                if not line:
                    event_name = None  # blank line ends the frame, per SSE spec
                    continue
                if line.startswith(":"):
                    continue  # comment/keepalive line, e.g. the app's padding/ping frames
                if line.startswith("event:"):
                    event_name = line[len("event:"):].strip()
                elif line.startswith("data:") and event_name == _SSE_LIVE_SNAPSHOT_EVENT:
                    try:
                        payload = json.loads(line[len("data:"):].strip())
                    except ValueError:
                        _LOGGER.debug("GLP live SSE: malformed live-snapshot payload, skipping")
                        continue
                    self._sse_last_event_monotonic = time.monotonic()
                    self.async_set_updated_data(payload)
