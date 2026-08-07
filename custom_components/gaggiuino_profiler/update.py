from __future__ import annotations

import logging

import aiohttp
from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .entity import GlpEntity

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    async_add_entities([GlpUpdateEntity(coordinator, entry), GlpMachineFirmwareUpdate(coordinator, entry)])


class GlpUpdateEntity(GlpEntity[GlpDataCoordinator], UpdateEntity):
    """Read-only version display — no install capability.

    HA already creates its own Supervisor-backed update entity for the
    add-on (update.<slug>_glp_update), which goes through the Supervisor's
    own update path. Triggering an install from here required the add-on
    to hold the Supervisor "manager" role (see mxkissnr/gaggiuino-local-
    profiler#514, #515, #516) just to duplicate that — dropped in favor of
    relying on HA's native entity (this repo's #54). This entity stays for
    non-Supervisor installs (plain Docker), where it's the only update
    signal available and self-install was never possible anyway (GLP's
    /api/update always returned 503 there).
    """

    _attr_name = "Update"
    _attr_title = "Gaggiuino Local Profiler"
    _attr_icon = "mdi:coffee-maker"

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "update")

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


class GlpMachineFirmwareUpdate(GlpEntity[GlpDataCoordinator], UpdateEntity):
    """Update availability + install trigger for the espresso machine's own
    firmware (#125, Phase 2 of gaggiuino-local-profiler#620).

    Unlike GlpUpdateEntity above (the app's own self-update, deliberately
    install-less -- see that class's docstring), installing here is a plain
    HTTP proxy to the physical machine's existing OTA endpoint
    (POST /api/machine/firmware/update -> the Gaggiuino's own
    /api/firmware/update-all), with no Supervisor-role entanglement, so it's
    safe to support.

    Deliberately does NOT declare UpdateEntityFeature.PROGRESS: the
    machine's own /api/firmware/progress response shape has never been
    exercised by any GLP frontend code (checked at the time this was
    written -- zero usages), so its real field names are unverified. Firing
    off the OTA and letting `installed_version` catch up on Home
    Assistant's own next coordinator poll (once the machine reports its new
    coreVersion) is the version-supported without asserting an unconfirmed
    payload shape.

    On a non-Gaggiuino machine (e.g. GaggiMate, no settingsProxy support)
    the add-on's endpoint returns 501; the coordinator fetch already treats
    that as "no data" (see coordinator.py), so this entity goes unavailable
    the same way the machine's other Gaggiuino-only entities do.
    """

    _attr_name = "Firmware"
    _attr_title = "Machine Firmware"
    _attr_icon = "mdi:chip"
    _attr_supported_features = UpdateEntityFeature.INSTALL

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, "firmware_update", url=_url)
        self._url = _url

    @property
    def suggested_object_id(self) -> str | None:
        return "machine_firmware"

    @property
    def installed_version(self) -> str | None:
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("firmware_installed")

    @property
    def latest_version(self) -> str | None:
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("firmware_latest")

    @property
    def release_url(self) -> str | None:
        if self.coordinator.data is None:
            return None
        return self.coordinator.data.get("firmware_release_url")

    async def async_install(self, version: str | None, backup: bool, **kwargs: object) -> None:
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                f"{self._url}/api/machine/firmware/update",
                json={},
                headers=await self.coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to trigger machine firmware update: %s", err)
            raise
        await self.coordinator.async_request_refresh()
