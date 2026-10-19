"""GLP API token acquisition, shared by all three coordinators and the
`/api/glp/*` proxy views (#67).

Previously each coordinator fetched and cached the token itself, and every
other caller (other coordinators, select.py, orders_api.py, __init__.py's
service handlers) reached into `GlpDataCoordinator._headers` directly. That
private attribute was only populated after the data coordinator's first
successful `_async_update_data()` run, making auth acquisition an implicit
timing dependency between all three coordinators. `GlpAuth` decouples that:
it is constructed once per config entry and lazily fetches+caches the token
on first use, independent of any particular coordinator's update cycle.

It is also the single place that writes through the API: `post()` retries
once with a freshly fetched token when the cached one is rejected, so an app
reinstall or a restore with a new token no longer leaves every control
answering 401 until Home Assistant restarts.
"""
from __future__ import annotations

import asyncio
import logging
from typing import NoReturn

import aiohttp
from homeassistant.exceptions import HomeAssistantError

_LOGGER = logging.getLogger(__name__)


class GlpAuth:
    """Lazily fetches and caches the GLP `X-GLP-Token` auth header.

    Constructed once per config entry and shared across all three
    coordinators and the `/api/glp/*` proxy views (see `__init__.py`), so
    the token is fetched independently of any particular coordinator's
    update cycle and only ever requested once per HA runtime (until the app
    hands out a new token, see `invalidate()`).
    """

    def __init__(self, session: aiohttp.ClientSession, url: str) -> None:
        self._session = session
        self._url = url.rstrip("/")
        self._cached_headers: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def headers(self) -> dict[str, str]:
        """Return the cached `X-GLP-Token` header, fetching it first if
        this is the first call or the previous fetch didn't yield a token.

        The lock keeps parallel first calls from each requesting a token;
        the cache is re-checked inside it so only the winner fetches."""
        if not self._cached_headers:
            async with self._lock:
                if not self._cached_headers:
                    await self._fetch()
        return self._cached_headers

    def invalidate(self) -> None:
        """Drop the cached header so the next request fetches a new token."""
        self._cached_headers = {}

    async def post(self, path: str, json: dict | None = None, timeout: float = 10) -> None:
        """POST *path* with the cached token, retrying once on a 401.

        Every failure surfaces as a `HomeAssistantError` so the UI shows a
        readable message instead of a raw aiohttp exception."""
        try:
            await self._post_once(path, json, timeout)
        except aiohttp.ClientResponseError as err:
            if err.status != 401:
                self._fail(path, err)
            # The cached token was rejected (app reinstall, restore with a new
            # token): drop it, fetch a fresh one and retry exactly once.
            self.invalidate()
            try:
                await self._post_once(path, json, timeout)
            except Exception as retry_err:
                self._fail(path, retry_err)
        except Exception as err:
            self._fail(path, err)

    async def _post_once(self, path: str, json: dict | None, timeout: float) -> None:
        async with self._session.post(
            f"{self._url}{path}",
            json=json,
            headers=await self.headers(),
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as response:
            response.raise_for_status()

    def _fail(self, path: str, err: Exception) -> NoReturn:
        message = self._describe(err)
        _LOGGER.error("GLP request failed: %s %s", path, message)
        raise HomeAssistantError(f"GLP request failed: {message}") from err

    @staticmethod
    def _describe(err: Exception) -> str:
        if isinstance(err, aiohttp.ClientResponseError):
            return f"{err.status} {err.message}".strip()
        return str(err) or type(err).__name__

    async def _fetch(self) -> None:
        # The token endpoint needs no credentials.
        try:
            async with self._session.get(
                f"{self._url}/api/token",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as tr:
                if tr.status < 400:
                    td = await tr.json()
                    if td.get("apiToken"):
                        self._cached_headers = {"X-GLP-Token": td["apiToken"]}
                else:
                    _LOGGER.warning(
                        "GLP /api/token returned %s — check add-on logs for denied IP",
                        tr.status,
                    )
        except Exception as token_err:
            _LOGGER.warning("GLP token fetch failed: %s", token_err)
