"""One-shot machine control buttons (#109) -- hass-gaggiuino parity.

Component-test buttons (pump/valve/valveB/LED) are deliberately NOT added in
this round -- they actuate real hardware and gaggiuino-local-profiler#600
flagged those message types as not yet live-verified. Revisit once #600 is
resolved.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import GlpDataCoordinator
from .entity import GlpEntity

if TYPE_CHECKING:
    from . import GlpConfigEntry

# Every entity in this platform talks to the app, so serialize its updates.
PARALLEL_UPDATES = 1


@dataclass(frozen=True)
class GlpButtonDescription(ButtonEntityDescription):
    endpoint: str = ""


BUTTONS: tuple[GlpButtonDescription, ...] = (
    GlpButtonDescription(
        key="tare_scale",
        translation_key="tare_scale",
        endpoint="/api/machine/tare",
    ),
    GlpButtonDescription(
        key="save_settings",
        translation_key="save_settings",
        endpoint="/api/machine/settings/save",
    ),
    GlpButtonDescription(
        key="save_active_profile",
        translation_key="save_active_profile",
        endpoint="/api/machine/profile/save",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GlpConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator = entry.runtime_data.data
    async_add_entities([GlpMachineButton(coordinator, entry, d) for d in BUTTONS])


class GlpMachineButton(GlpEntity[GlpDataCoordinator], ButtonEntity):
    """`Save Settings` persists whatever's currently applied in RAM to flash
    -- settings writes made through this integration's number/switch/light
    entities already auto-persist via their REST calls, so this button is
    specifically for changes made on the machine's own touchscreen/web UI
    that a user wants GLP to persist."""

    def __init__(
        self,
        coordinator: GlpDataCoordinator,
        entry: ConfigEntry,
        description: GlpButtonDescription,
    ) -> None:
        _url = (entry.options.get("url") or entry.data["url"]).rstrip("/")
        super().__init__(coordinator, entry, description.key, url=_url)
        self.entity_description = description

    @property
    def suggested_object_id(self) -> str | None:
        return self.entity_description.key

    async def async_press(self) -> None:
        await self.coordinator.auth.post(self.entity_description.endpoint, json={})
