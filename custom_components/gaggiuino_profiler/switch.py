"""Boiler/display/scales config switches for the Gaggiuino machine (#109) --
hass-gaggiuino parity. Like number.py, every write resubmits the full
settings category payload (read-modify-write) -- `ledState`/`ledDisco` are
intentionally not duplicated here, light.py already covers them.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import aiohttp
from homeassistant.components.switch import SwitchEntity, SwitchEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import GlpEntity
from .settings_coordinator import GlpSettingsCoordinator

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class GlpSwitchDescription(SwitchEntityDescription):
    category: str = ""
    data_key: str = ""


SWITCHES: tuple[GlpSwitchDescription, ...] = (
    GlpSwitchDescription(
        key="brew_delta_state",
        category="boiler",
        data_key="brewDeltaState",
        name="Brew Delta",
        icon="mdi:delta",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="dream_steam_state",
        category="boiler",
        data_key="dreamSteamState",
        name="Dream Steam",
        icon="mdi:kettle-steam",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="lcd_dark_mode",
        category="display",
        data_key="lcdDarkMode",
        name="LCD Dark Mode",
        icon="mdi:brightness-4",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="lcd_close_on_brew_off",
        category="display",
        data_key="lcdCloseOnBrewOff",
        name="LCD Close On Brew Off",
        icon="mdi:coffee-off-outline",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="simple_ui",
        category="display",
        data_key="simpleUI",
        name="Simple UI",
        icon="mdi:view-dashboard-outline",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="force_predictive",
        category="scales",
        data_key="forcePredictive",
        name="Force Predictive Scales",
        icon="mdi:chart-line",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="hw_scales_enabled",
        category="scales",
        data_key="hwScalesEnabled",
        name="Hardware Scales Enabled",
        icon="mdi:scale",
        entity_category=EntityCategory.CONFIG,
    ),
    GlpSwitchDescription(
        key="bt_scales_enabled",
        category="scales",
        data_key="btScalesEnabled",
        name="Bluetooth Scales Enabled",
        icon="mdi:bluetooth",
        entity_category=EntityCategory.CONFIG,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    settings_coordinator: GlpSettingsCoordinator = hass.data[DOMAIN][entry.entry_id]["settings"]
    async_add_entities([GlpMachineSwitch(settings_coordinator, entry, d) for d in SWITCHES])


class GlpMachineSwitch(GlpEntity[GlpSettingsCoordinator], SwitchEntity):
    def __init__(
        self,
        coordinator: GlpSettingsCoordinator,
        entry: ConfigEntry,
        description: GlpSwitchDescription,
    ) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, description.key, url=_url)
        self.entity_description = description
        self._url = _url

    @property
    def suggested_object_id(self) -> str | None:
        return self.entity_description.key

    def _settings(self) -> dict:
        return (self.coordinator.data or {}).get(self.entity_description.category) or {}

    @property
    def available(self) -> bool:
        return bool(self._settings())

    @property
    def is_on(self) -> bool | None:
        settings = self._settings()
        if not settings:
            return None
        return bool(settings.get(self.entity_description.data_key))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._write(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._write(False)

    async def _write(self, value: bool) -> None:
        payload = dict(self._settings())
        payload[self.entity_description.data_key] = value
        session = async_get_clientsession(self.hass)
        category = self.entity_description.category
        try:
            async with session.post(
                f"{self._url}/api/machine/settings/{category}",
                json=payload,
                headers=await self.coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to update %s.%s: %s", category, self.entity_description.data_key, err)
            raise
        await self.coordinator.async_request_refresh()
