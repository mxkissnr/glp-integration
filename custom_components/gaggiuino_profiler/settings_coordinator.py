"""Coordinator that polls the Gaggiuino machine's settings via the GLP
add-on's settings proxy (#597/#109) -- backs the write-capable light/number/
switch/select (release channel) config entities.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .auth import GlpAuth
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SETTINGS_INTERVAL_SECONDS = 30

# Categories consumed by light.py/number.py/switch.py/select.py's
# GlpReleaseChannelSelect (#109) -- "theme" and "versions" aren't used by any
# entity in this round. Fetched individually via ?category= (rather than the
# unfiltered /api/machine/settings) since that's the add-on's documented
# per-category response shape, and it's also the exact payload shape these
# entities POST back on write (full-category read-modify-write).
SETTINGS_CATEGORIES = ("boiler", "display", "led", "scales", "system")


class GlpSettingsCoordinator(DataUpdateCoordinator):
    """Poll GET /api/machine/settings?category=<c> for every category the
    control entities need, one dict per category so a write (e.g. number.py
    changing a single boiler field) can resubmit the full unchanged payload
    rather than clobbering sibling fields.

    Returns an empty dict (not an error) when the settings proxy is
    unavailable (machine off, non-Gaggiuino machine, 501/502 from the
    add-on) so entities show as unavailable rather than triggering HA error
    states -- same convention as GlpMachineCoordinator.

    Multi-machine (#48): default-machine-only for v1, same scope note as
    GlpMachineCoordinator -- see the "Multi-machine" scope note in sensor.py
    and this issue's own text (#109).
    """

    def __init__(
        self,
        hass: HomeAssistant,
        session: aiohttp.ClientSession,
        url: str,
        auth: GlpAuth,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_settings",
            update_interval=timedelta(seconds=SETTINGS_INTERVAL_SECONDS),
        )
        self._session = session
        self._url = url.rstrip("/")
        # Public (unlike the private `_auth` on the other coordinators) --
        # entities read/write settings directly (light.py/number.py/switch.py/
        # select.py's GlpReleaseChannelSelect), the same `coordinator.auth`
        # access pattern select.py's GlpProfileSelect already uses against
        # GlpDataCoordinator.
        self.auth = auth

    async def _fetch_category(self, headers: dict, category: str) -> tuple[str, dict | None]:
        try:
            async with self._session.get(
                f"{self._url}/api/machine/settings?category={category}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                if r.status >= 400:
                    return category, None
                data = await r.json()
                return category, data if isinstance(data, dict) else None
        except Exception as err:
            _LOGGER.debug("GLP machine settings category %s unreachable: %s", category, err)
            return category, None

    async def _async_update_data(self) -> dict:
        try:
            headers = await self.auth.headers()
        except Exception as err:
            raise UpdateFailed(f"GLP machine settings unreachable: {err}") from err
        results = await asyncio.gather(
            *(self._fetch_category(headers, category) for category in SETTINGS_CATEGORIES)
        )
        return {category: payload for category, payload in results if payload is not None}
