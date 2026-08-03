"""Profile selector for the Gaggiuino machine — replaces ALERTua/hass-gaggiuino."""
from __future__ import annotations

import logging

import aiohttp
from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .entity import GlpEntity
from .machine_coordinator import GlpMachineCoordinator
from .settings_coordinator import GlpSettingsCoordinator

_LOGGER = logging.getLogger(__name__)

# #109: OperationModeDto enum, transcribed from
# gaggiuino-local-profiler's lib/gaggiuino-proto.js -- the add-on's
# GET /api/machine/live returns sysState.operationMode as this numeric wire
# value (protobuf-ts binary decode, not the JSON enum name), so the select
# needs its own reverse mapping to resolve a display option from it.
# BREW_MANUAL (1) is deliberately excluded from OPERATION_MODE_OPTIONS --
# the add-on's own /api/machine/opmode rejects it with a 400 (live-verified
# no-op while idle).
_OPERATION_MODE_BY_INDEX: dict[int, str] = {
    0: "BREW_AUTO",
    1: "BREW_MANUAL",
    2: "FLUSH",
    3: "DESCALE",
    4: "STEAM",
    5: "FLUSH_AUTO",
    6: "HOT_WATER",
    7: "HOME",
}
OPERATION_MODE_OPTIONS: list[str] = [
    v for v in _OPERATION_MODE_BY_INDEX.values() if v != "BREW_MANUAL"
]

# #109: releaseChannel (category `system`) is a plain 0/1/2 integer, not a
# WS-protobuf enum -- see gaggiuino-local-profiler's settings proxy docs.
_RELEASE_CHANNEL_BY_INDEX: dict[int, str] = {0: "stable", 1: "test", 2: "debug"}
_RELEASE_CHANNEL_BY_NAME: dict[str, int] = {v: k for k, v in _RELEASE_CHANNEL_BY_INDEX.items()}
RELEASE_CHANNEL_OPTIONS: list[str] = list(_RELEASE_CHANNEL_BY_NAME)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator            = hass.data[DOMAIN][entry.entry_id]["data"]
    machine_coordinator: GlpMachineCoordinator = hass.data[DOMAIN][entry.entry_id]["machine"]
    settings_coordinator: GlpSettingsCoordinator = hass.data[DOMAIN][entry.entry_id]["settings"]
    async_add_entities([
        GlpProfileSelect(coordinator, machine_coordinator, entry),
        GlpOperationModeSelect(machine_coordinator, entry),
        GlpReleaseChannelSelect(settings_coordinator, entry),
    ])


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


class GlpOperationModeSelect(GlpEntity[GlpMachineCoordinator], SelectEntity):
    """Machine operation mode -- BREW_AUTO/FLUSH/DESCALE/STEAM/FLUSH_AUTO/
    HOT_WATER/HOME (BREW_MANUAL deliberately excluded, see module docstring
    constants above). Everyday-use control, not entity_category CONFIG."""

    _attr_name = "Operation Mode"
    _attr_icon = "mdi:tune-variant"
    _attr_options = OPERATION_MODE_OPTIONS

    def __init__(self, coordinator: GlpMachineCoordinator, entry: ConfigEntry) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, "operation_mode", url=_url)
        self._url = _url

    @property
    def suggested_object_id(self) -> str | None:
        return "operation_mode"

    @property
    def available(self) -> bool:
        return bool(self.coordinator.data)

    @property
    def current_option(self) -> str | None:
        if not self.coordinator.data:
            return None
        raw = self.coordinator.data.get("operationMode")
        name = _OPERATION_MODE_BY_INDEX.get(raw) if isinstance(raw, int) else raw
        # BREW_MANUAL (or an unrecognized value) isn't a selectable option --
        # reported as unknown rather than a value SelectEntity can't offer.
        return name if name in OPERATION_MODE_OPTIONS else None

    async def async_select_option(self, option: str) -> None:
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                f"{self._url}/api/machine/opmode",
                json={"mode": option},
                headers=await self.coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to set operation mode %s: %s", option, err)
            raise
        await self.coordinator.async_request_refresh()


class GlpReleaseChannelSelect(GlpEntity[GlpSettingsCoordinator], SelectEntity):
    """Firmware release channel -- category `system`, field `releaseChannel`
    (0/1/2, mapped to stable/test/debug). Settings-backed, entity_category
    CONFIG like number.py/switch.py's settings entries."""

    _attr_name = "Release Channel"
    _attr_icon = "mdi:source-branch"
    _attr_options = RELEASE_CHANNEL_OPTIONS
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: GlpSettingsCoordinator, entry: ConfigEntry) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, "release_channel", url=_url)
        self._url = _url

    @property
    def suggested_object_id(self) -> str | None:
        return "release_channel"

    def _settings(self) -> dict:
        return (self.coordinator.data or {}).get("system") or {}

    @property
    def available(self) -> bool:
        return bool(self._settings())

    @property
    def current_option(self) -> str | None:
        raw = self._settings().get("releaseChannel")
        return _RELEASE_CHANNEL_BY_INDEX.get(raw)

    async def async_select_option(self, option: str) -> None:
        payload = dict(self._settings())
        payload["releaseChannel"] = _RELEASE_CHANNEL_BY_NAME[option]
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                f"{self._url}/api/machine/settings/system",
                json=payload,
                headers=await self.coordinator.auth.headers(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                r.raise_for_status()
        except Exception as err:
            _LOGGER.error("Failed to set release channel %s: %s", option, err)
            raise
        await self.coordinator.async_request_refresh()
