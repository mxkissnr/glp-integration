from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    PERCENTAGE,
    UnitOfPressure,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .coordinator import GlpDataCoordinator
from .entity import GlpAdditionalMachineEntity, GlpEntity
from .machine_coordinator import GlpMachineCoordinator


@dataclass(frozen=True)
class GlpSensorDescription(SensorEntityDescription):
    data_key: str = ""


@dataclass(frozen=True)
class GlpMaintenanceSensorDescription(SensorEntityDescription):
    task_key: str = ""


SENSORS: tuple[GlpSensorDescription, ...] = (
    GlpSensorDescription(
        key="machine_status",
        data_key="machine_status",
        name="Machine Status",
        icon="mdi:coffee-maker",
    ),
    GlpSensorDescription(
        key="shot_count",
        data_key="shot_count",
        name="Shot Count",
        icon="mdi:counter",
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement="shots",
    ),
    GlpSensorDescription(
        key="shots_today",
        data_key="shots_today",
        name="Shots Today",
        icon="mdi:coffee-maker-check-outline",
        state_class=SensorStateClass.TOTAL,
        native_unit_of_measurement="shots",
    ),
    GlpSensorDescription(
        key="last_shot_profile",
        data_key="last_shot_profile",
        name="Last Shot Profile",
        icon="mdi:chart-bell-curve",
    ),
    GlpSensorDescription(
        key="last_shot_rating",
        data_key="last_shot_rating",
        name="Last Shot Rating",
        icon="mdi:star-outline",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="★",
        suggested_display_precision=0,
    ),
    GlpSensorDescription(
        key="last_shot_date",
        data_key="last_shot_date",
        name="Last Shot Date",
        icon="mdi:calendar-clock",
        device_class=SensorDeviceClass.TIMESTAMP,
    ),
    GlpSensorDescription(
        key="last_shot_duration",
        data_key="last_shot_duration",
        name="Last Shot Duration",
        icon="mdi:timer-outline",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTime.SECONDS,
        suggested_display_precision=1,
    ),
    GlpSensorDescription(
        key="last_shot_pressure",
        data_key="last_shot_pressure",
        name="Last Shot Avg Pressure",
        icon="mdi:gauge",
        device_class=SensorDeviceClass.PRESSURE,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfPressure.BAR,
        suggested_display_precision=2,
    ),
    GlpSensorDescription(
        key="last_shot_weight",
        data_key="last_shot_weight",
        name="Last Shot Yield",
        icon="mdi:scale",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="g",
        suggested_display_precision=1,
    ),
    GlpSensorDescription(
        key="last_shot_ratio",
        data_key="last_shot_ratio",
        name="Last Shot Brew Ratio",
        icon="mdi:approximately-equal",
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=2,
    ),
    GlpSensorDescription(
        key="last_shot_dose",
        data_key="last_shot_dose",
        name="Last Shot Dose",
        icon="mdi:coffee",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="g",
        suggested_display_precision=1,
    ),
    GlpSensorDescription(
        key="last_shot_coffee",
        data_key="last_shot_coffee",
        name="Last Shot Coffee",
        icon="mdi:coffee-outline",
    ),
    GlpSensorDescription(
        key="last_shot_grinder",
        data_key="last_shot_grinder",
        name="Last Shot Grinder",
        icon="mdi:blender-outline",
    ),
    GlpSensorDescription(
        key="last_sync",
        data_key="last_sync",
        name="Last Sync",
        icon="mdi:sync",
        device_class=SensorDeviceClass.TIMESTAMP,
    ),
    GlpSensorDescription(
        key="machine_url",
        data_key="machine_url",
        name="Machine Hostname",
        icon="mdi:lan",
    ),
    GlpSensorDescription(
        key="machine_temperature",
        data_key="machine_temperature",
        name="Machine Temperature",
        icon="mdi:thermometer",
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        suggested_display_precision=1,
    ),
    GlpSensorDescription(
        key="machine_target_temperature",
        data_key="machine_target_temperature",
        name="Machine Target Temperature",
        icon="mdi:thermometer-chevron-up",
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        suggested_display_precision=1,
    ),
    GlpSensorDescription(
        key="preheat_elapsed",
        data_key="preheat_elapsed",
        name="Preheat Elapsed",
        icon="mdi:timer-outline",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTime.SECONDS,
        suggested_display_precision=0,
    ),
    GlpSensorDescription(
        key="preheat_remaining",
        data_key="preheat_remaining",
        name="Preheat Remaining",
        icon="mdi:timer-sand",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTime.SECONDS,
        suggested_display_precision=0,
    ),
    GlpSensorDescription(
        key="preheat_ready_by_target_at",
        data_key="preheat_ready_by_target_at",
        name="Preheat Ready By",
        icon="mdi:clock-alert-outline",
        device_class=SensorDeviceClass.TIMESTAMP,
    ),
    GlpSensorDescription(
        key="preheat_planned_switch_on_at",
        data_key="preheat_planned_switch_on_at",
        name="Preheat Planned Switch On",
        icon="mdi:clock-start",
        device_class=SensorDeviceClass.TIMESTAMP,
    ),
)


MAINTENANCE_SENSORS: tuple[GlpMaintenanceSensorDescription, ...] = (
    GlpMaintenanceSensorDescription(
        key="maint_descaling",
        task_key="descaling",
        name="Maintenance Descaling",
        icon="mdi:water-alert-outline",
    ),
    GlpMaintenanceSensorDescription(
        key="maint_backflush",
        task_key="backflush",
        name="Maintenance Backflush",
        icon="mdi:coffee-maker-outline",
    ),
    GlpMaintenanceSensorDescription(
        key="maint_grouphead",
        task_key="grouphead",
        name="Maintenance Group Head",
        icon="mdi:wrench-outline",
    ),
    GlpMaintenanceSensorDescription(
        key="maint_gaskets",
        task_key="gaskets",
        name="Maintenance Gaskets",
        icon="mdi:circle-outline",
    ),
    GlpMaintenanceSensorDescription(
        key="maint_waterfilter",
        task_key="waterfilter",
        name="Maintenance Water Filter",
        icon="mdi:water-check-outline",
    ),
)


@dataclass(frozen=True)
class GlpMachineSensorDescription(SensorEntityDescription):
    data_key: str = ""


MACHINE_SENSORS: tuple[GlpMachineSensorDescription, ...] = (
    # Note: machine_temperature and machine_target_temperature already exist in
    # the main coordinator (from /api/preheat). Only unique machine-coordinator
    # sensors are defined here to avoid duplicate entities.
    GlpMachineSensorDescription(
        key="machine_live_pressure",
        data_key="pressure",
        name="Machine Live Pressure",
        icon="mdi:gauge",
        device_class=SensorDeviceClass.PRESSURE,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfPressure.BAR,
        suggested_display_precision=2,
    ),
    GlpMachineSensorDescription(
        key="machine_water_level",
        data_key="waterLevel",
        name="Machine Water Level",
        icon="mdi:water-outline",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=PERCENTAGE,
        suggested_display_precision=0,
    ),
    GlpMachineSensorDescription(
        key="machine_live_weight",
        data_key="weight",
        name="Machine Live Weight",
        icon="mdi:scale",
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement="g",
        suggested_display_precision=1,
    ),
    GlpMachineSensorDescription(
        key="machine_uptime",
        data_key="upTime",
        name="Machine Uptime",
        icon="mdi:timer-outline",
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfTime.SECONDS,
        suggested_display_precision=0,
    ),
    GlpMachineSensorDescription(
        key="machine_live_profile",
        data_key="profileName",
        name="Machine Active Profile",
        icon="mdi:chart-bell-curve",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GlpDataCoordinator         = hass.data[DOMAIN][entry.entry_id]["data"]
    machine_coordinator: GlpMachineCoordinator = hass.data[DOMAIN][entry.entry_id]["machine"]
    entities: list = [GlpSensor(coordinator, entry, d) for d in SENSORS]
    entities += [GlpMaintenanceSensor(coordinator, entry, d) for d in MAINTENANCE_SENSORS]
    entities.append(GlpGrinderMaintenanceSensor(coordinator, entry))
    entities += [GlpMachineSensor(machine_coordinator, entry, d) for d in MACHINE_SENSORS]
    async_add_entities(entities)

    # Multi-machine (#48): one status sensor per *additional* (non-default)
    # machine from coordinator.data["machines"] (populated since #47 from
    # the app's GET /api/status). The default machine's entities above are
    # untouched -- same unique_ids, same device, zero dashboard breakage.
    #
    # Scope note: this is intentionally NOT a full mirror of the default
    # machine's sensor set (shot_count, last_shot_*, maintenance status,
    # live temperature/pressure...). Those all come from app endpoints
    # (/shots.json, /api/maintenance, /api/machine/status) that are not yet
    # machine-scoped -- they only ever describe the default machine as of
    # app v2.0.0. Mirroring them onto an additional machine's device would
    # silently show that machine's data as the OTHER machine's data, which
    # is actively misleading, not just incomplete. This sensor surfaces
    # exactly what IS genuinely available per machine today: name, type,
    # enabled and reachable/on from the machines[] registry array. Full
    # parity is a follow-up gated on the app adding ?machine=<id> support
    # to those endpoints.
    #
    # New machines added later (via the app's Settings UI, #319) get their
    # entity added at runtime via this listener -- no HA restart needed.
    known_machine_ids: set[int] = set()

    def _sync_additional_machines() -> None:
        machines = coordinator.data.get("machines") or [] if coordinator.data else []
        new_entities = []
        for m in machines:
            mid = m.get("id")
            if mid is None or m.get("isDefault") or mid in known_machine_ids:
                continue
            known_machine_ids.add(mid)
            new_entities.append(GlpAdditionalMachineSensor(coordinator, entry, mid, m.get("name") or f"Machine {mid}"))
        if new_entities:
            async_add_entities(new_entities)

    _sync_additional_machines()
    entry.async_on_unload(coordinator.async_add_listener(_sync_additional_machines))


class GlpSensor(GlpEntity[GlpDataCoordinator], SensorEntity):
    def __init__(
        self,
        coordinator: GlpDataCoordinator,
        entry: ConfigEntry,
        description: GlpSensorDescription,
    ) -> None:
        super().__init__(coordinator, entry, description.key)
        self.entity_description = description

    @property
    def suggested_object_id(self) -> str | None:
        """Pin entity_id assignment on first creation to the stable
        `key` instead of HA's slugification of the human-readable `name`,
        which produced an unpredictable, collision-mangled entity_id on a
        real instance (#62)."""
        return self.entity_description.key

    @property
    def native_value(self) -> Any:
        return self.coordinator.data.get(self.entity_description.data_key)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if self.entity_description.key == "machine_status":
            attrs: dict[str, Any] = {}
            sw = self.coordinator.data.get("switch_entity")
            if sw:
                attrs["switch_entity"] = sw
            machines = self.coordinator.data.get("machines")
            if machines:
                attrs["machines"] = machines
            recent = self.coordinator.data.get("recent_shots")
            if recent:
                attrs["recent_shots"] = recent
            return attrs
        return {}


class GlpGrinderMaintenanceSensor(GlpEntity[GlpDataCoordinator], SensorEntity):
    _attr_name = "Maintenance Grinders"
    _attr_icon = "mdi:coffee-maker-outline"

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "maint_grinders")

    @property
    def suggested_object_id(self) -> str | None:
        return "maint_grinders"

    @property
    def native_value(self) -> str | None:
        return self.coordinator.data.get("grinder_maintenance_status")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self.coordinator.data.get("grinder_maintenance_details") or {}


class GlpMaintenanceSensor(GlpEntity[GlpDataCoordinator], SensorEntity):
    def __init__(
        self,
        coordinator: GlpDataCoordinator,
        entry: ConfigEntry,
        description: GlpMaintenanceSensorDescription,
    ) -> None:
        super().__init__(coordinator, entry, description.key)
        self.entity_description = description

    @property
    def suggested_object_id(self) -> str | None:
        return self.entity_description.key

    def _task_data(self) -> dict:
        return self.coordinator.data.get(f"maint_{self.entity_description.task_key}") or {}

    @property
    def native_value(self) -> str | None:
        return self._task_data().get("status") or None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        d = self._task_data()
        return {
            "days_since":   d.get("daysSince"),
            "shots_since":  d.get("shotsSince"),
            "last_date":    d.get("lastDate"),
            "pct":          d.get("pct"),
        }


class GlpMachineSensor(GlpEntity[GlpMachineCoordinator], SensorEntity):
    """Live sensor sourced from the Gaggiuino machine via GLP add-on proxy."""

    def __init__(
        self,
        coordinator: GlpMachineCoordinator,
        entry: ConfigEntry,
        description: GlpMachineSensorDescription,
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
    def native_value(self) -> Any:
        if not self.coordinator.data:
            return None
        return self.coordinator.data.get(self.entity_description.data_key)


class GlpAdditionalMachineSensor(GlpAdditionalMachineEntity[GlpDataCoordinator], SensorEntity):
    """Status summary sensor for one additional (non-default) machine
    (#48) — see the scope-note comment in async_setup_entry() above for why
    this doesn't mirror the default machine's full sensor set."""

    _attr_name = "Status"
    _attr_icon = "mdi:coffee-maker"

    def __init__(self, coordinator: GlpDataCoordinator, entry: ConfigEntry, machine_id: int, machine_name: str) -> None:
        super().__init__(coordinator, entry, machine_id, machine_name, "status")

    @property
    def suggested_object_id(self) -> str | None:
        return f"machine_{self._machine_id}_status"

    def _machine(self) -> dict | None:
        machines = (self.coordinator.data or {}).get("machines") or []
        return next((m for m in machines if m.get("id") == self._machine_id), None)

    @property
    def available(self) -> bool:
        return self._machine() is not None

    @property
    def native_value(self) -> str | None:
        m = self._machine()
        if not m:
            return None
        if not m.get("enabled"):
            return "disabled"
        if m.get("reachable") is False:
            return "unreachable"
        if m.get("on"):
            return "on"
        return "configured"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        m = self._machine()
        if not m:
            return {}
        return {"type": m.get("type"), "enabled": m.get("enabled"), "reachable": m.get("reachable")}
