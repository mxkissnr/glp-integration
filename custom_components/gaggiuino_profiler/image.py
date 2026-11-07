"""Image entity with the last shot's curve (#342).

The picture is not drawn here: the GLP app renders it and serves it as
`GET /api/shots/{id}/chart.png` (app #1851), a fixed 960x480 PNG with the
pressure, pump flow, weight and temperature curves.

The integration keeps the current picture in memory. HA's image proxy
(`/api/image_proxy/<entity_id>`) and `image.async_get_image()` call
`async_image()` on every request, and the frontend re-requests the picture
every 5 minutes for each open dashboard, while the app redraws the chart on
every request and allows 30 renders per minute per IP (Home Assistant is one
IP for all of its requests). One shot's chart never changes either -- it only
draws the shot's own datapoints -- so the picture is cached per shot id.

A 404 makes the entity unavailable: an app older than 3.7.0 has no such route
and answers 404, and a shot deleted in the app answers 404 as well. Both are
retried with the next shot, which is also the only way back.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import aiohttp
from homeassistant.components.image import ImageEntity
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .coordinator import GlpDataCoordinator
from .entity import GlpEntity

if TYPE_CHECKING:
    from . import GlpConfigEntry

_LOGGER = logging.getLogger(__name__)

# No polling and no actions. The picture fetch runs per proxy request, which
# PARALLEL_UPDATES does not gate.
PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GlpConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator = entry.runtime_data.data
    parent_device_id: str | None = entry.runtime_data.parent_device_id
    async_add_entities([GlpLastShotChartImage(coordinator, entry, parent_device_id=parent_device_id)])


class GlpLastShotChartImage(GlpEntity[GlpDataCoordinator], ImageEntity):
    """The last shot's curve, rendered by the app."""

    _attr_translation_key = "last_shot_chart"
    _attr_content_type = "image/png"

    def __init__(
        self,
        coordinator: GlpDataCoordinator,
        entry: GlpConfigEntry,
        parent_device_id: str | None = None,
    ) -> None:
        super().__init__(coordinator, entry, "last_shot_chart", group="shots", parent_device_id=parent_device_id)
        # CoordinatorEntity does not chain to ImageEntity, so its token deque
        # and HTTP client have to be set up explicitly.
        ImageEntity.__init__(self, coordinator.hass)
        self.pin_grouped_entity_id(Platform.IMAGE.value)
        self._shot_id: int | None = None
        self._missing_shot_id: int | None = None
        self._chart: tuple[int, bytes] | None = None
        self._sync_shot()

    @property
    def suggested_object_id(self) -> str | None:
        return "last_shot_chart"

    def _sync_shot(self) -> None:
        data = self.coordinator.data or {}
        shot_id = data.get("last_shot_id")
        # The id is interpolated into a URL path, so anything that is not a
        # positive integer is unusable (same reasoning as the #65 fix).
        if not (isinstance(shot_id, int) and not isinstance(shot_id, bool) and shot_id > 0):
            shot_id = None
        if shot_id == self._shot_id:
            return
        self._shot_id = shot_id
        # The shot's own timestamp, not "now": the state then survives an HA
        # restart unchanged and only moves when the last shot changes.
        self._attr_image_last_updated = (
            None if shot_id is None else data.get("last_shot_date") or dt_util.utcnow()
        )

    @callback
    def _handle_coordinator_update(self) -> None:
        self._sync_shot()
        super()._handle_coordinator_update()

    @property
    def available(self) -> bool:
        return (
            super().available
            and self._shot_id is not None
            and self._shot_id != self._missing_shot_id
        )

    async def async_image(self) -> bytes | None:
        shot_id = self._shot_id
        if shot_id is None or shot_id == self._missing_shot_id:
            return None
        if self._chart is not None and self._chart[0] == shot_id:
            return self._chart[1]

        coordinator = self.coordinator
        try:
            async with coordinator._session.get(
                f"{coordinator._url}/api/shots/{shot_id}/chart.png",
                params={"lang": self.hass.config.language},
                headers=await coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status == 401:
                    coordinator.auth.invalidate()
                    _LOGGER.debug(
                        "%s: the app rejected the token, dropping it", self.entity_id
                    )
                    return None
                if response.status == 404:
                    self._missing_shot_id = shot_id
                    self.async_write_ha_state()
                    _LOGGER.debug(
                        "%s: the app has no chart for shot %s", self.entity_id, shot_id
                    )
                    return None
                if response.status >= 400:
                    _LOGGER.debug(
                        "%s: the app answered %s for shot %s",
                        self.entity_id,
                        response.status,
                        shot_id,
                    )
                    return None
                content_type = response.headers.get("Content-Type", "")
                if not content_type.lower().startswith("image/"):
                    _LOGGER.debug(
                        "%s: shot %s came back as %r, not a picture",
                        self.entity_id,
                        shot_id,
                        content_type,
                    )
                    return None
                content = await response.read()
        except (aiohttp.ClientError, TimeoutError) as err:
            _LOGGER.debug(
                "%s: fetching the chart of shot %s failed: %s", self.entity_id, shot_id, err
            )
            return None

        self._chart = (shot_id, content)
        return content
