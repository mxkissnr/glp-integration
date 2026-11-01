"""Shared entity base classes (#68).

The identical `DeviceInfo(...)` block used to be copied verbatim across
sensor.py, binary_sensor.py, select.py and update.py -- changing the device
name or model meant updating every one of those places by hand, precisely
the pattern that produces entity/device inconsistencies.

Two variants, matching the two device shapes actually used:

- `GlpEntity`: entities describing the config entry's default machine --
  all of them live on one shared HA device.
- `GlpAdditionalMachineEntity`: the per-machine entities added by the
  multi-machine registry (#48), each on its own device. On HA Core 2026.9+
  that device is a child device of the default device (#322); older cores
  keep the `via_device` link, which 2026.11 deprecates.
"""
from __future__ import annotations

from typing import TypeVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity, DataUpdateCoordinator

from .const import DOMAIN

try:
    from homeassistant.helpers.device_registry import ChildDeviceInfo
except ImportError:  # HA Core < 2026.9
    ChildDeviceInfo = None

_CoordinatorT = TypeVar("_CoordinatorT", bound=DataUpdateCoordinator)


class GlpEntity(CoordinatorEntity[_CoordinatorT]):
    """Base for entities on the config entry's default-machine device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: _CoordinatorT, entry: ConfigEntry, key: str, url: str | None = None) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        # #191: "Visit" should open the machine's own web UI, and the device
        # should carry the machine firmware version. Both are dynamic (only
        # known once the machine has been reachable) and shared across entities
        # from three different coordinators, so they're applied centrally to the
        # device registry in __init__.py (_async_sync_device_metadata) rather
        # than raced through per-entity DeviceInfo. This static block only
        # provides the identity + the add-on URL as the initial fallback.
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
        parent_device_id: str | None = None,
    ) -> None:
        super().__init__(coordinator)
        self._machine_id = machine_id
        self._attr_unique_id = f"{entry.entry_id}_{machine_id}_{key_suffix}"
        identifiers = {(DOMAIN, f"{entry.entry_id}_{machine_id}")}
        if ChildDeviceInfo is not None and parent_device_id:
            # #322: the machine is a logical part of the GLP device, so HA models
            # it as a child device instead of a separate device linked by
            # via_device (deprecated in 2026.11).
            self._attr_device_info = ChildDeviceInfo(
                identifiers=identifiers,
                name=machine_name,
                parent_device_id=parent_device_id,
            )
        else:
            self._attr_device_info = DeviceInfo(
                identifiers=identifiers,
                name=machine_name,
                manufacturer="Gaggiuino",
                model="Local Profiler (additional machine)",
                configuration_url=entry.data["url"],
                via_device=(DOMAIN, entry.entry_id),
            )
