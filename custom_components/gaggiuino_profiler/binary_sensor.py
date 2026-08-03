from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .entity import GlpAdditionalMachineEntity, GlpEntity
from .live_coordinator import GlpLiveCoordinator
from .machine_coordinator import GlpMachineCoordinator


@dataclass(frozen=True)
class GlpMachineBinarySensorDescription(BinarySensorEntityDescription):
    data_key: str = ""
    # Only set on the two fault sensors (#108) -- exposed as the
    # `fault_reason` extra state attribute.
    reason_key: str = ""


# #108: relay/valve states and sensor-fault flags merged into
# /api/machine/status by gaggiuino-local-profiler#597/#599.
MACHINE_BINARY_SENSORS: tuple[GlpMachineBinarySensorDescription, ...] = (
    GlpMachineBinarySensorDescription(
        key="thermocouple_faulted",
        data_key="thermocoupleFaulted",
        reason_key="thermocoupleFaultReason",
        name="Thermocouple Faulted",
        icon="mdi:thermometer-alert",
        device_class=BinarySensorDeviceClass.PROBLEM,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    GlpMachineBinarySensorDescription(
        key="pressure_sensor_faulted",
        data_key="pressureSensorFaulted",
        reason_key="pressureSensorFaultReason",
        name="Pressure Sensor Faulted",
        icon="mdi:gauge-full",
        device_class=BinarySensorDeviceClass.PROBLEM,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    GlpMachineBinarySensorDescription(
        key="boiler_state",
        data_key="boilerState",
        name="Boiler Relay",
        icon="mdi:radiator",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    GlpMachineBinarySensorDescription(
        key="valve_state",
        data_key="valveState",
        name="Valve",
        icon="mdi:valve",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    GlpMachineBinarySensorDescription(
        key="steam_valve_state",
        data_key="steamValveState",
        name="Steam Valve",
        icon="mdi:valve",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    GlpMachineBinarySensorDescription(
        key="valve_b_state",
        data_key="valveBState",
        name="Valve B",
        icon="mdi:valve",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    GlpMachineBinarySensorDescription(
        key="steam_boiler_relay_state",
        data_key="steamBoilerRelayState",
        name="Steam Boiler Relay",
        icon="mdi:radiator",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
)


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
        *[GlpMachineBinarySensor(machine_coordinator, entry, d) for d in MACHINE_BINARY_SENSORS],
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


class IsBrewingSensor(GlpEntity[GlpLiveCoordinator], BinarySensorEntity):
    _attr_name = "Brewing"
    _attr_device_class = BinarySensorDeviceClass.RUNNING
    _attr_icon = "mdi:coffee-maker-check-outline"

    def __init__(self, coordinator: GlpLiveCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "is_brewing")

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


class PreheatReadySensor(GlpEntity[GlpDataCoordinator], BinarySensorEntity):
    _attr_name = "Preheat Ready"
    _attr_icon = "mdi:coffee-maker-check"

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "preheat_ready")

    @property
    def is_on(self) -> bool | None:
        if self.coordinator.data is None:
            return None
        return bool(self.coordinator.data.get("preheat_ready"))


class SteamSwitchSensor(GlpEntity[GlpMachineCoordinator], BinarySensorEntity):
    """Physical steam switch state from the Gaggiuino machine."""

    _attr_name = "Steam Switch"
    _attr_device_class = BinarySensorDeviceClass.HEAT
    _attr_icon = "mdi:weather-fog"

    def __init__(self, coordinator: GlpMachineCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "steam_switch")

    @property
    def available(self) -> bool:
        return bool(self.coordinator.data)

    @property
    def is_on(self) -> bool | None:
        if not self.coordinator.data:
            return None
        return bool(self.coordinator.data.get("steamSwitchState"))


class GlpMachineBinarySensor(GlpEntity[GlpMachineCoordinator], BinarySensorEntity):
    """Relay/valve state or sensor-fault flag from the Gaggiuino machine (#108)."""

    def __init__(
        self,
        coordinator: GlpMachineCoordinator,
        entry: ConfigEntry,
        description: GlpMachineBinarySensorDescription,
    ) -> None:
        super().__init__(coordinator, entry, description.key)
        self.entity_description = description

    @property
    def suggested_object_id(self) -> str | None:
        return self.entity_description.key

    @property
    def available(self) -> bool:
        return bool(self.coordinator.data)

    @property
    def is_on(self) -> bool | None:
        if not self.coordinator.data:
            return None
        return bool(self.coordinator.data.get(self.entity_description.data_key))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        reason_key = self.entity_description.reason_key
        if not reason_key or not self.coordinator.data:
            return {}
        reason = self.coordinator.data.get(reason_key)
        return {"fault_reason": reason} if reason else {}


class GlpAdditionalMachineReachableSensor(GlpAdditionalMachineEntity[GlpDataCoordinator], BinarySensorEntity):
    """Reachability of one additional (non-default) machine (#48)."""

    _attr_name = "Reachable"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry, machine_id: int, machine_name: str) -> None:
        super().__init__(coordinator, entry, machine_id, machine_name, "reachable")

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
