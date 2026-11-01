"""Shared entity base classes (#68).

The identical `DeviceInfo(...)` block used to be copied verbatim across
sensor.py, binary_sensor.py, select.py and update.py -- changing the device
name or model meant updating every one of those places by hand, precisely
the pattern that produces entity/device inconsistencies.

Two variants, matching the two device shapes actually used:

- `GlpEntity`: entities describing the config entry's default machine --
  most of them live on one shared HA device. Entities passed a `group`
  (#336) live on a child device of it instead (Shots, Maintenance,
  Preheat), so HA's fixed device-page sections do not have to swallow all
  ~75 entities at once.
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

# #336: display names of the child devices the default machine's entities are
# grouped into, used as the fallback name for HA Core versions that do not
# translate device names; #339 adds the `device.<group>.name` translations.
GROUP_NAMES = {"shots": "Shots", "maintenance": "Maintenance", "preheat": "Preheat"}


class GlpEntity(CoordinatorEntity[_CoordinatorT]):
    """Base for entities on the config entry's default-machine device."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: _CoordinatorT,
        entry: ConfigEntry,
        key: str,
        url: str | None = None,
        group: str | None = None,
        parent_device_id: str | None = None,
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._group = group
        # #191: "Visit" should open the machine's own web UI, and the device
        # should carry the machine firmware version. Both are dynamic (only
        # known once the machine has been reachable) and shared across entities
        # from three different coordinators, so they're applied centrally to the
        # device registry in __init__.py (_async_sync_device_metadata) rather
        # than raced through per-entity DeviceInfo. This static block only
        # provides the identity + the add-on URL as the initial fallback.
        self._attr_device_info = self._device_info(entry, url, group, parent_device_id)

    @staticmethod
    def _device_info(
        entry: ConfigEntry,
        url: str | None,
        group: str | None,
        parent_device_id: str | None,
    ) -> DeviceInfo:
        if group is None:
            return DeviceInfo(
                identifiers={(DOMAIN, entry.entry_id)},
                name="Gaggiuino Local Profiler",
                manufacturer="Gaggiuino",
                model="Local Profiler",
                configuration_url=url or entry.data["url"],
            )
        identifiers = {(DOMAIN, f"{entry.entry_id}_group_{group}")}
        if ChildDeviceInfo is not None and parent_device_id:
            # #336: same shape as the additional-machine child devices (#322).
            return ChildDeviceInfo(
                identifiers=identifiers,
                name=GROUP_NAMES[group],
                parent_device_id=parent_device_id,
            )
        return DeviceInfo(
            identifiers=identifiers,
            name=GROUP_NAMES[group],
            manufacturer="Gaggiuino",
            model="Local Profiler",
            via_device=(DOMAIN, entry.entry_id),
        )

    def pin_grouped_entity_id(self, domain: str) -> None:
        """Keep the entity_id of a grouped entity (#336), call after the
        description/suggested id is set, with the platform's domain.

        With `has_entity_name=True` HA derives a fresh entity's object id from
        the DEVICE name, which for a grouped entity is its child device
        ("Shots", "Maintenance", "Preheat") instead of the machine ("Gaggiuino
        Local Profiler"), so a fresh install would get `sensor.shots_shot_count`
        where an existing install has `sensor.gaggiuino_local_profiler_shot_count`.
        Setting `entity_id` before the entity is added makes HA treat it as the
        suggested object id instead: the installed `helpers/entity_platform.py`
        (`_async_add_entity`) routes a preset `entity_id` into
        `internal_integration_suggested_object_id`, which is then still run
        through `async_get_available_entity_id()` -- so collisions are
        de-duplicated exactly as before.
        """
        if self._group is None:
            return
        object_id = self.suggested_object_id
        if object_id:
            self.entity_id = f"{domain}.gaggiuino_local_profiler_{object_id}"


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
