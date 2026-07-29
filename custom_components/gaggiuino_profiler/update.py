from __future__ import annotations

from homeassistant.components.update import UpdateEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .entity import GlpEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    async_add_entities([GlpUpdateEntity(coordinator, entry)])


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
