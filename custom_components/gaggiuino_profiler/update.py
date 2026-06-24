from __future__ import annotations

import logging

import aiohttp
from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import GlpDataCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    async_add_entities([GlpUpdateEntity(coordinator, entry)])


class GlpUpdateEntity(CoordinatorEntity[GlpDataCoordinator], UpdateEntity):
    _attr_has_entity_name = True
    _attr_name = "Update"
    _attr_title = "Gaggiuino Local Profiler"
    _attr_supported_features = UpdateEntityFeature.INSTALL
    _attr_icon = "mdi:coffee-maker"

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_update"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Gaggiuino Local Profiler",
            manufacturer="Gaggiuino",
            model="Local Profiler",
            configuration_url=entry.data["url"],
        )

    @property
    def installed_version(self) -> str | None:
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("version_current")

    @property
    def latest_version(self) -> str | None:
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("version_latest")

    @property
    def release_url(self) -> str | None:
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("version_release_url")

    async def async_install(self, version: str | None, backup: bool, **kwargs) -> None:
        url = (self._entry.options.get("url") or self._entry.data["url"]).rstrip("/")
        try:
            async with self.coordinator._session.post(
                f"{url}/api/update",
                headers=self.coordinator._headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                if not r.ok:
                    body = await r.text()
                    _LOGGER.error("GLP update trigger failed (%s): %s", r.status, body)
                    raise Exception(f"GLP /api/update returned {r.status}: {body}")
        except aiohttp.ClientConnectionError:
            # Expected — add-on restarts immediately after triggering the update
            _LOGGER.debug("GLP connection closed after update trigger (add-on restarting)")
        _LOGGER.info("GLP add-on update triggered successfully")
