"""Coordinator that polls the Gaggiuino machine live status via the GLP add-on proxy."""
import logging
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .auth import GlpAuth
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

MACHINE_INTERVAL_SECONDS = 5


class GlpMachineCoordinator(DataUpdateCoordinator):
    """Poll /api/machine/status from the GLP add-on every 5 s.

    The add-on caches the latest /api/system/status response from the Gaggiuino
    machine so no extra machine call is needed from the integration side.
    Returns an empty dict (not an error) when the machine status is unavailable
    so entities show as unavailable rather than triggering HA error states.

    Multi-machine (#48): `machine_id` is accepted for forward-compatibility
    but has no effect yet -- /api/machine/status isn't machine-scoped as of
    app v2.0.0 (it always describes the default machine), so a second
    GlpMachineCoordinator instance for an additional machine would just
    return the same data mislabeled as that machine's, which would be
    actively misleading. No additional-machine live sensors are set up in
    this round for that reason (see the scope note in sensor.py); once the
    app adds ?machine=<id> support here, per-machine live coordinators/
    sensors are a straightforward follow-up using this same parameter.
    """

    def __init__(
        self,
        hass: HomeAssistant,
        session: aiohttp.ClientSession,
        url: str,
        auth: GlpAuth,
        machine_id: int | None = None,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_machine" + (f"_{machine_id}" if machine_id else ""),
            update_interval=timedelta(seconds=MACHINE_INTERVAL_SECONDS),
        )
        self._session   = session
        self._url       = url.rstrip("/")
        self._auth      = auth
        self._machine_id = machine_id

    async def _async_update_data(self) -> dict:
        suffix = f"?machine={self._machine_id}" if self._machine_id else ""
        try:
            headers = await self._auth.headers()
            async with self._session.get(
                f"{self._url}/api/machine/status{suffix}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                r.raise_for_status()
                data = await r.json()
                # available=false → return empty dict, entities become unavailable
                if not data.get("available"):
                    return {}
                return data
        except Exception as err:
            raise UpdateFailed(f"GLP machine status unreachable: {err}") from err
