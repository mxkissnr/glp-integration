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
"""
import logging

import aiohttp

_LOGGER = logging.getLogger(__name__)


class GlpAuth:
    """Lazily fetches and caches the GLP `X-GLP-Token` auth header.

    Constructed once per config entry and shared across all three
    coordinators and the `/api/glp/*` proxy views (see `__init__.py`), so
    the token is fetched independently of any particular coordinator's
    update cycle and only ever requested once per HA runtime (cached for
    the lifetime of this object).
    """

    def __init__(self, session: aiohttp.ClientSession, url: str) -> None:
        self._session = session
        self._url = url.rstrip("/")
        self._cached_headers: dict[str, str] = {}

    async def headers(self) -> dict[str, str]:
        """Return the cached `X-GLP-Token` header, fetching it first if
        this is the first call or the previous fetch didn't yield a token."""
        if not self._cached_headers:
            await self._fetch()
        return self._cached_headers

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
