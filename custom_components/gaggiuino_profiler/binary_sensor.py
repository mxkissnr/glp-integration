from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .live_coordinator import GlpLiveCoordinator
from .machine_coordinator import GlpMachineCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    live_coordinator: GlpLiveCoordinator       = hass.data[DOMAIN][entry.entry_id]["live"]
    data_coordinator: GlpDataCoordinator       = hass.data[DOMAIN][entry.entry_id]["data"]
    machine_coordinator: GlpMachineCoordinator = hass.data[DOMAIN][entry.entry_id]["machine"]
    async_add_entities([
        IsBrewingSensor(live_coordinator, entry),
        PreheatReadySensor(data_coordinator, entry),
        SteamSwitchSensor(machine_coordinator, entry),
    ])

    # Multi-machine (#48) — one "Reachable" binary_sensor per additional
    # machine, same dynamic-add-on-coordinator-update pattern and same
    # scope note as GlpAdditionalMachineSensor in sensor.py: reachable/on
    # are the only fields genuinely available per machine from the app's
    # machines[] registry array today.
    known_machine_ids: set[int] = set()

    def _sync_additional_machines() -> None:
        machines = data_coordinator.data.get("machines") or [] if data_coordinator.data else []
        new_entities = []
        for m in machines:
            mid = m.get("id")
            if mid is None or m.get("isDefault") or mid in known_machine_ids:
                continue
            known_machine_ids.add(mid)
            new_entities.append(
                GlpAdditionalMachineReachableSensor(data_coordinator, entry, mid, m.get("name") or f"Machine {mid}")
            )
        if new_entities:
            async_add_entities(new_entities)

    _sync_additional_machines()
    entry.async_on_unload(data_coordinator.async_add_listener(_sync_additional_machines))


class IsBrewingSensor(CoordinatorEntity[GlpLiveCoordinator], BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Brewing"
    _attr_device_class = BinarySensorDeviceClass.RUNNING
    _attr_icon = "mdi:coffee-maker-check-outline"

    def __init__(self, coordinator: GlpLiveCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_is_brewing"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Gaggiuino Local Profiler",
            manufacturer="Gaggiuino",
            model="Local Profiler",
            configuration_url=entry.data["url"],
        )

    @property
    def is_on(self) -> bool | None:
        if self.coordinator.data is None:
            return None
        return bool(self.coordinator.data.get("isLive"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data
        if not data:
            return {}
        dp = data.get("datapoints")
        if not dp:
            return {}
        return {
            "profile_name": data.get("profileName"),
            "seq":          data.get("seq"),
            "datapoints":   dp,
        }


class PreheatReadySensor(CoordinatorEntity[GlpDataCoordinator], BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Preheat Ready"
    _attr_icon = "mdi:coffee-maker-check"

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_preheat_ready"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Gaggiuino Local Profiler",
            manufacturer="Gaggiuino",
            model="Local Profiler",
            configuration_url=entry.data["url"],
        )

    @property
    def is_on(self) -> bool | None:
        if self.coordinator.data is None:
            return None
        return bool(self.coordinator.data.get("preheat_ready"))


class SteamSwitchSensor(CoordinatorEntity[GlpMachineCoordinator], BinarySensorEntity):
    """Physical steam switch state from the Gaggiuino machine."""

    _attr_has_entity_name = True
    _attr_name = "Steam Switch"
    _attr_device_class = BinarySensorDeviceClass.HEAT
    _attr_icon = "mdi:weather-fog"

    def __init__(self, coordinator: GlpMachineCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_steam_switch"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Gaggiuino Local Profiler",
            manufacturer="Gaggiuino",
            model="Local Profiler",
            configuration_url=entry.data["url"],
        )

    @property
    def available(self) -> bool:
        return bool(self.coordinator.data)

    @property
    def is_on(self) -> bool | None:
        if not self.coordinator.data:
            return None
        return bool(self.coordinator.data.get("steamSwitchState"))


class GlpAdditionalMachineReachableSensor(CoordinatorEntity[GlpDataCoordinator], BinarySensorEntity):
    """Reachability of one additional (non-default) machine (#48)."""

    _attr_has_entity_name = True
    _attr_name = "Reachable"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry, machine_id: int, machine_name: str) -> None:
        super().__init__(coordinator)
        self._machine_id = machine_id
        self._attr_unique_id = f"{entry.entry_id}_{machine_id}_reachable"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{machine_id}")},
            name=machine_name,
            manufacturer="Gaggiuino",
            model="Local Profiler (additional machine)",
            configuration_url=entry.data["url"],
            via_device=(DOMAIN, entry.entry_id),
        )

    def _machine(self) -> dict | None:
        machines = (self.coordinator.data or {}).get("machines") or []
        return next((m for m in machines if m.get("id") == self._machine_id), None)

    @property
    def available(self) -> bool:
        return self._machine() is not None

    @property
    def is_on(self) -> bool | None:
        m = self._machine()
        if not m:
            return None
        return bool(m.get("reachable"))
