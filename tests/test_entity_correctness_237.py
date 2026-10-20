"""Regression tests for #237: stable entity ids, no spurious shot_completed
events, tolerant parsing of upstream shot values, and shot-count statistics.

The entity-id checks cover every entity class that derives from GlpEntity
(plus the per-machine GlpAdditionalMachineEntity subclasses), since HA only
consults `suggested_object_id` when an entity is first registered -- a wrong
id here is silent and permanent for existing installs (#62 precedent).
"""
from unittest.mock import MagicMock

from homeassistant.components.sensor import SensorStateClass
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.binary_sensor import (
    MACHINE_BINARY_SENSORS,
    GlpAdditionalMachineReachableSensor,
    GlpMachineBinarySensor,
    IsBrewingSensor,
    MachineStandbySensor,
    PreheatReadySensor,
    SteamSwitchSensor,
)
from custom_components.gaggiuino_profiler.button import BUTTONS, GlpMachineButton
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator
from custom_components.gaggiuino_profiler.light import GlpLedLight
from custom_components.gaggiuino_profiler.number import NUMBERS, GlpMachineNumber
from custom_components.gaggiuino_profiler.select import (
    GlpOperationModeSelect,
    GlpProfileSelect,
    GlpReleaseChannelSelect,
)
from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    MAINTENANCE_SENSORS,
    SENSORS,
    GlpAdditionalMachineSensor,
    GlpGrinderMaintenanceSensor,
    GlpMachineSensor,
    GlpMaintenanceSensor,
    GlpSensor,
)
from custom_components.gaggiuino_profiler.switch import SWITCHES, GlpMachineSwitch
from custom_components.gaggiuino_profiler.update import GlpMachineFirmwareUpdate, GlpUpdateEntity

URL = "http://glp.example.com"


def _entry() -> MagicMock:
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": URL}
    return entry


def _coordinator(data: dict | None = None) -> MagicMock:
    coordinator = MagicMock()
    coordinator.data = data or {}
    return coordinator


def _all_entities() -> list:
    entry = _entry()
    data_coordinator = _coordinator()
    machine_coordinator = _coordinator()
    live_coordinator = _coordinator()
    settings_coordinator = _coordinator()
    return [
        IsBrewingSensor(live_coordinator, entry),
        PreheatReadySensor(data_coordinator, entry),
        MachineStandbySensor(data_coordinator, entry),
        SteamSwitchSensor(machine_coordinator, entry),
        *[GlpMachineBinarySensor(machine_coordinator, entry, d) for d in MACHINE_BINARY_SENSORS],
        GlpAdditionalMachineReachableSensor(data_coordinator, entry, 2, "Machine 2"),
        *[GlpSensor(data_coordinator, entry, d) for d in SENSORS],
        GlpGrinderMaintenanceSensor(data_coordinator, entry),
        *[GlpMaintenanceSensor(data_coordinator, entry, d) for d in MAINTENANCE_SENSORS],
        *[GlpMachineSensor(machine_coordinator, entry, d) for d in MACHINE_SENSORS],
        GlpAdditionalMachineSensor(data_coordinator, entry, 2, "Machine 2"),
        GlpProfileSelect(data_coordinator, machine_coordinator, entry),
        GlpOperationModeSelect(machine_coordinator, entry),
        GlpReleaseChannelSelect(settings_coordinator, entry),
        GlpUpdateEntity(data_coordinator, entry),
        GlpMachineFirmwareUpdate(data_coordinator, entry),
        *[GlpMachineButton(data_coordinator, entry, d) for d in BUTTONS],
        *[GlpMachineNumber(settings_coordinator, entry, d) for d in NUMBERS],
        *[GlpMachineSwitch(settings_coordinator, entry, d) for d in SWITCHES],
        GlpLedLight(settings_coordinator, entry),
    ]


def test_every_entity_has_a_non_empty_suggested_object_id() -> None:
    for entity in _all_entities():
        value = entity.suggested_object_id
        assert isinstance(value, str) and value, type(entity).__name__


def test_expected_suggested_object_ids() -> None:
    entities = _all_entities()
    expected = {
        IsBrewingSensor: "brewing",
        PreheatReadySensor: "preheat_ready",
        MachineStandbySensor: "machine_standby",
        SteamSwitchSensor: "steam_switch",
        GlpAdditionalMachineReachableSensor: "reachable",
        GlpProfileSelect: "profile",
        GlpUpdateEntity: "update",
    }
    by_type = {type(entity): entity for entity in entities}
    for entity_type, object_id in expected.items():
        assert by_type[entity_type].suggested_object_id == object_id


def _mock_all(aioclient_mock, *, shots: list | None = None) -> None:
    shots = shots if shots is not None else []
    aioclient_mock.get(f"{URL}/api/status", json={})
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/shots.json?limit=10", json=shots)
    aioclient_mock.get(f"{URL}/shots.json", json=shots)
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    aioclient_mock.get(f"{URL}/api/machine/firmware/version", json={})


async def test_deleting_newest_shot_fires_no_event_but_higher_id_does(hass, aioclient_mock) -> None:
    events: list[dict] = []
    hass.bus.async_listen(f"{DOMAIN}_shot_completed", lambda event: events.append(event.data))
    coordinator = GlpDataCoordinator(hass, async_get_clientsession(hass), URL)

    _mock_all(aioclient_mock, shots=[{"id": 1}, {"id": 2}])
    await coordinator._async_update_data()
    await hass.async_block_till_done()
    assert events == []  # first refresh never fires

    # Deleting the newest shot must not fire an event for the older one.
    aioclient_mock.clear_requests()
    _mock_all(aioclient_mock, shots=[{"id": 1}])
    await coordinator._async_update_data()
    await hass.async_block_till_done()
    assert events == []

    # A genuinely new shot (higher id) still fires.
    aioclient_mock.clear_requests()
    _mock_all(aioclient_mock, shots=[{"id": 1}, {"id": 2}, {"id": 3}])
    await coordinator._async_update_data()
    await hass.async_block_till_done()
    assert [event["shot_id"] for event in events] == [3]


async def test_refresh_survives_malformed_shot_values(hass, aioclient_mock) -> None:
    _mock_all(
        aioclient_mock,
        shots=[
            {
                "id": 1,
                "profile": None,
                "annotation": {"rating": "x", "dose": "abc"},
                "datapoints": {},
            }
        ],
    )
    coordinator = GlpDataCoordinator(hass, async_get_clientsession(hass), URL)

    data = await coordinator._async_update_data()

    assert data["last_shot_rating"] is None
    assert data["last_shot_dose"] is None
    assert data["last_shot_profile"] is None
    assert data["recent_shots"][0]["rating"] is None


def test_led_with_non_numeric_color_channel_has_no_rgb_color() -> None:
    coordinator = _coordinator({"led": {"color": {"R": "not-a-number", "G": 20, "B": 30}}})
    light = GlpLedLight(coordinator, _entry())

    assert light.rgb_color is None


def test_shot_count_uses_total_state_class() -> None:
    description = next(d for d in SENSORS if d.key == "shot_count")

    assert description.state_class is SensorStateClass.TOTAL
