"""Event entity for finished shots (#340).

The bus event `gaggiuino_profiler_shot_completed` (coordinator.py) stays as it
is -- existing automations listen to it. This entity mirrors it into HA's own
event platform so the shot can also be used as a regular state trigger and
shows up on the device page.
"""
from __future__ import annotations

from homeassistant.components.event import EventEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
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
    parent_device_id: str | None = hass.data[DOMAIN][entry.entry_id].get("parent_device_id")
    async_add_entities([GlpShotEvent(coordinator, entry, parent_device_id=parent_device_id)])


class GlpShotEvent(GlpEntity[GlpDataCoordinator], EventEntity):
    """One `shot_finished` event per shot the coordinator reports as new."""

    _attr_translation_key = "shot"
    _attr_event_types = ["shot_finished"]

    def __init__(
        self,
        coordinator: GlpDataCoordinator,
        entry: ConfigEntry,
        parent_device_id: str | None = None,
    ) -> None:
        super().__init__(coordinator, entry, "shot", group="shots", parent_device_id=parent_device_id)
        self.pin_grouped_entity_id(Platform.EVENT.value)
        # Seed from the coordinator's current count so a shot detected before
        # this entity existed (or before an HA restart) is never replayed.
        self._seen_new_shot_count = coordinator.new_shot_count

    @property
    def suggested_object_id(self) -> str | None:
        return "shot"

    @callback
    def _handle_coordinator_update(self) -> None:
        # The counter, not the shot id, decides: the app can reuse an id for a
        # re-created shot, and only the coordinator knows what is genuinely new.
        if self.coordinator.new_shot_count != self._seen_new_shot_count:
            self._seen_new_shot_count = self.coordinator.new_shot_count
            payload = self.coordinator.last_new_shot
            if payload is not None:
                try:
                    self._trigger_event("shot_finished", dict(payload))
                except TypeError:
                    # HA Core < 2024.11 takes no attributes for an event.
                    self._trigger_event("shot_finished")
        self.async_write_ha_state()
