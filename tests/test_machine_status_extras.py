"""Tests for #108: pumpFlow/weightFlow/waterTemperature sensors and the
relay-state/sensor-fault binary sensors merged into /api/machine/status by
gaggiuino-local-profiler#597 (PR #599) -- all sourced from GlpMachineCoordinator,
same as the existing machine_live_* sensors and SteamSwitchSensor."""
from unittest.mock import MagicMock

from custom_components.gaggiuino_profiler.binary_sensor import (
    MACHINE_BINARY_SENSORS,
    GlpMachineBinarySensor,
)
from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    GlpMachineSensor,
)


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.data = {"url": "http://glp.local:8099"}
    return entry


def _description(tup, key):
    return next(d for d in tup if d.key == key)


def _machine_sensor(key: str, data: dict | None):
    coordinator = MagicMock()
    coordinator.data = data
    return GlpMachineSensor(coordinator, _make_entry(), _description(MACHINE_SENSORS, key))


def _machine_binary_sensor(key: str, data: dict | None):
    coordinator = MagicMock()
    coordinator.data = data
    return GlpMachineBinarySensor(coordinator, _make_entry(), _description(MACHINE_BINARY_SENSORS, key))


MACHINE_STATUS = {
    "pumpFlow": 1.23,
    "weightFlow": 2.05,
    "waterTemperature": 91.4,
    "thermocoupleFaulted": True,
    "thermocoupleFaultReason": "open circuit",
    "pressureSensorFaulted": False,
    "pressureSensorFaultReason": "",
    "boilerState": True,
    "valveState": False,
    "steamValveState": True,
    "valveBState": False,
    "steamBoilerRelayState": True,
}


def test_pump_flow_native_value():
    sensor = _machine_sensor("pump_flow", MACHINE_STATUS)
    assert sensor.native_value == 1.23
    assert sensor.suggested_object_id == "pump_flow"


def test_weight_flow_native_value():
    sensor = _machine_sensor("weight_flow", MACHINE_STATUS)
    assert sensor.native_value == 2.05


def test_water_temperature_native_value():
    sensor = _machine_sensor("water_temperature", MACHINE_STATUS)
    assert sensor.native_value == 91.4


def test_new_machine_sensors_unavailable_when_coordinator_data_empty():
    for key in ("pump_flow", "weight_flow", "water_temperature"):
        sensor = _machine_sensor(key, {})
        assert sensor.available is False
        assert sensor.native_value is None


def test_thermocouple_faulted_is_on_and_exposes_reason():
    sensor = _machine_binary_sensor("thermocouple_faulted", MACHINE_STATUS)
    assert sensor.is_on is True
    assert sensor.extra_state_attributes == {"fault_reason": "open circuit"}
    assert sensor.suggested_object_id == "thermocouple_faulted"


def test_pressure_sensor_faulted_is_off_and_omits_empty_reason():
    sensor = _machine_binary_sensor("pressure_sensor_faulted", MACHINE_STATUS)
    assert sensor.is_on is False
    assert sensor.extra_state_attributes == {}


def test_relay_binary_sensors_reflect_raw_state():
    assert _machine_binary_sensor("boiler_state", MACHINE_STATUS).is_on is True
    assert _machine_binary_sensor("valve_state", MACHINE_STATUS).is_on is False
    assert _machine_binary_sensor("steam_valve_state", MACHINE_STATUS).is_on is True
    assert _machine_binary_sensor("valve_b_state", MACHINE_STATUS).is_on is False
    assert _machine_binary_sensor("steam_boiler_relay_state", MACHINE_STATUS).is_on is True


def test_relay_binary_sensors_have_no_reason_attribute():
    sensor = _machine_binary_sensor("boiler_state", MACHINE_STATUS)
    assert sensor.extra_state_attributes == {}


def test_machine_binary_sensors_unavailable_when_coordinator_data_empty():
    for key in (d.key for d in MACHINE_BINARY_SENSORS):
        sensor = _machine_binary_sensor(key, {})
        assert sensor.available is False
        assert sensor.is_on is None
