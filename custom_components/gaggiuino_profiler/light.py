"""LED light control for the Gaggiuino machine (#109) -- hass-gaggiuino parity."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
from homeassistant.components.light import (
    ATTR_EFFECT,
    ATTR_RGB_COLOR,
    ColorMode,
    LightEntity,
    LightEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .entity import GlpEntity
from .gaggiuino_bool import coerce_gaggiuino_bool, encode_gaggiuino_bool
from .settings_coordinator import GlpSettingsCoordinator

_LOGGER = logging.getLogger(__name__)

EFFECT_DISCO = "Disco"
EFFECT_NONE = "None"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    settings_coordinator: GlpSettingsCoordinator = hass.data[DOMAIN][entry.entry_id]["settings"]
    async_add_entities([GlpLedLight(settings_coordinator, entry)])


class GlpLedLight(GlpEntity[GlpSettingsCoordinator], LightEntity):
    """Machine LED -- category `led` of the settings proxy. REST settings
    writes apply and persist in one call, unlike the WS-based opmode/tare/
    profile-save commands elsewhere in this round (button.py)."""

    _attr_name = "LED"
    _attr_icon = "mdi:led-strip-variant"
    _attr_color_mode = ColorMode.RGB
    _attr_supported_color_modes = {ColorMode.RGB}
    _attr_supported_features = LightEntityFeature.EFFECT
    _attr_effect_list = [EFFECT_NONE, EFFECT_DISCO]

    def __init__(self, coordinator: GlpSettingsCoordinator, entry: ConfigEntry) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, "led", url=_url)
        self._url = _url

    @property
    def suggested_object_id(self) -> str | None:
        return "led"

    def _settings(self) -> dict:
        return (self.coordinator.data or {}).get("led") or {}

    @property
    def available(self) -> bool:
        return bool(self._settings())

    @property
    def is_on(self) -> bool | None:
        settings = self._settings()
        if not settings:
            return None
        return coerce_gaggiuino_bool(settings.get("state"))

    @property
    def rgb_color(self) -> tuple[int, int, int] | None:
        color = self._settings().get("color") or {}
        if not color:
            return None
        return (
            int(color.get("R", 0)),
            int(color.get("G", 0)),
            int(color.get("B", 0)),
        )

    @property
    def effect(self) -> str | None:
        settings = self._settings()
        if not settings:
            return None
        return EFFECT_DISCO if coerce_gaggiuino_bool(settings.get("disco")) else EFFECT_NONE

    async def async_turn_on(self, **kwargs: Any) -> None:
        payload = dict(self._settings())
        payload["state"] = encode_gaggiuino_bool(True, like=payload.get("state"))
        if ATTR_RGB_COLOR in kwargs:
            r, g, b = kwargs[ATTR_RGB_COLOR]
            payload["color"] = {"R": r, "G": g, "B": b}
        if ATTR_EFFECT in kwargs:
            payload["disco"] = encode_gaggiuino_bool(kwargs[ATTR_EFFECT] == EFFECT_DISCO, like=payload.get("disco"))
        await self._write(payload)

    async def async_turn_off(self, **kwargs: Any) -> None:
        payload = dict(self._settings())
        payload["state"] = encode_gaggiuino_bool(False, like=payload.get("state"))
        await self._write(payload)

    async def _write(self, payload: dict) -> None:
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                f"{self._url}/api/machine/settings/led",
                json=payload,
                headers=await self.coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to update LED settings: %s", err)
            raise
        await self.coordinator.async_request_refresh()
