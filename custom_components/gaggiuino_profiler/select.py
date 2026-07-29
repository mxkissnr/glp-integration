"""Profile selector for the Gaggiuino machine — replaces ALERTua/hass-gaggiuino."""
from __future__ import annotations

import logging

import aiohttp
from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .entity import GlpEntity
from .machine_coordinator import GlpMachineCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator           = hass.data[DOMAIN][entry.entry_id]["data"]
    machine_coordinator: GlpMachineCoordinator = hass.data[DOMAIN][entry.entry_id]["machine"]
    async_add_entities([GlpProfileSelect(coordinator, machine_coordinator, entry)])


class GlpProfileSelect(GlpEntity[GlpDataCoordinator], SelectEntity):
    """Gaggiuino brew profile selector.

    Profile options list comes from the main coordinator (60 s) — profiles
    rarely change. The current selection is read from the machine coordinator
    (5 s) so profile switches on the machine itself are reflected quickly.
    Writing a new profile calls /api/machine/profile/set on the add-on.
    """

    _attr_name = "Profile"
    _attr_icon = "mdi:coffee"

    def __init__(
        self,
        coordinator: GlpDataCoordinator,
        machine_coordinator: GlpMachineCoordinator,
        entry: ConfigEntry,
    ) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, "profile", url=_url)
        self._machine_coordinator = machine_coordinator
        self._url = _url

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # CoordinatorEntity only pushes a state update when the coordinator it
        # was constructed with (the 60 s data coordinator) refreshes. This
        # entity's current_option below reads live data from the machine
        # coordinator (5 s) instead, so without this extra subscription a
        # profile switch made directly on the machine's own screen is fetched
        # correctly but never actually reaches Home Assistant/the card until
        # the next slow-coordinator cycle — the same reasoning GlpMachineSensor
        # (sensor.py) already subscribes to the machine coordinator for.
        self.async_on_remove(
            self._machine_coordinator.async_add_listener(self.async_write_ha_state)
        )

    @property
    def options(self) -> list[str]:
        # Full profile list from main coordinator (60 s — rarely changes)
        return self.coordinator.data.get("profile_options") or []

    @property
    def current_option(self) -> str | None:
        # Live profile name from machine coordinator (5 s)
        if self._machine_coordinator.data:
            return self._machine_coordinator.data.get("profileName")
        return self.coordinator.data.get("current_profile")

    @property
    def available(self) -> bool:
        return bool(self.options)

    async def async_select_option(self, option: str) -> None:
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                f"{self._url}/api/machine/profile/set",
                json={"option": option},
                headers=await self.coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to set profile %s: %s", option, err)
            raise
        # Trigger immediate refresh so the UI reflects the new selection
        await self.coordinator.async_request_refresh()
