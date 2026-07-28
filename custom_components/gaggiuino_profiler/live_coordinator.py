import logging
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .auth import GlpAuth
from .const import DOMAIN, LIVE_INTERVAL_SECONDS

_LOGGER = logging.getLogger(__name__)


class GlpLiveCoordinator(DataUpdateCoordinator):
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

    async def _async_update_data(self) -> dict:
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
