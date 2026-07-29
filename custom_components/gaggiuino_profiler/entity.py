"""Shared entity base classes (#68).

The identical `DeviceInfo(...)` block used to be copied verbatim across
sensor.py, binary_sensor.py, select.py and update.py -- changing the device
name or model meant updating every one of those places by hand, precisely
the pattern that produces entity/device inconsistencies.

Two variants, matching the two device shapes actually used:

- `GlpEntity`: entities describing the config entry's default machine --
  all of them live on one shared HA device.
- `GlpAdditionalMachineEntity`: the per-machine entities added by the
  multi-machine registry (#48), each on its own device linked back to the
  default device via `via_device`.
"""
from __future__ import annotations

from typing import TypeVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity, DataUpdateCoordinator

from .const import DOMAIN

_CoordinatorT = TypeVar("_CoordinatorT", bound=DataUpdateCoordinator)


class GlpEntity(CoordinatorEntity[_CoordinatorT]):
    """Base for entities on the config entry's default-machine device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: _CoordinatorT, entry: ConfigEntry, key: str, url: str | None = None) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Gaggiuino Local Profiler",
            manufacturer="Gaggiuino",
            model="Local Profiler",
            configuration_url=url or entry.data["url"],
        )


class GlpAdditionalMachineEntity(CoordinatorEntity[_CoordinatorT]):
    """Base for per-machine entities from the multi-machine registry (#48)."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: _CoordinatorT,
        entry: ConfigEntry,
        machine_id: int,
        machine_name: str,
        key_suffix: str,
    ) -> None:
        super().__init__(coordinator)
        self._machine_id = machine_id
        self._attr_unique_id = f"{entry.entry_id}_{machine_id}_{key_suffix}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{machine_id}")},
            name=machine_name,
            manufacturer="Gaggiuino",
            model="Local Profiler (additional machine)",
            configuration_url=entry.data["url"],
            via_device=(DOMAIN, entry.entry_id),
        )
