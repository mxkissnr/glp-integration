"""#339: entity and device names come from the translation files.

Home Assistant translates an entity's name through `translation_key` plus
`translations/<lang>.json` (`entity.<platform>.<key>.name`) and its icon
through `icons.json` (`entity.<platform>.<key>.default`). An explicit `name`
or `_attr_name` would win over the translation key, so both have to be gone
wherever a key is set.

The entity ids must not move: every class pins `suggested_object_id` (and
grouped entities preset `entity_id`), so the German run below has to produce
the very same ids as the English one.
"""
import json
from pathlib import Path

import pytest
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import UNDEFINED
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.binary_sensor import (
    MACHINE_BINARY_SENSORS,
    GlpAdditionalMachineReachableSensor,
    GlpMachineBinarySensor,
    IsBrewingSensor,
    MachineStandbySensor,
    PreheatReadySensor,
    SteamSwitchSensor,
)
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.entity import DEVICE_GROUP_KEYS, GlpEntity
from custom_components.gaggiuino_profiler.sensor import (
    MACHINE_SENSORS,
    MAINTENANCE_SENSORS,
    SENSORS,
    GlpAdditionalMachineSensor,
    GlpGrinderMaintenanceSensor,
    GlpMaintenanceSensor,
    GlpSensor,
)
from tests.common import load_icons, mock_all_coordinator_endpoints

COMPONENT_DIR = Path(__file__).resolve().parent.parent / "custom_components" / "gaggiuino_profiler"
try:
    HAS_CHILD_DEVICES = dr.ChildDeviceEntry is not None
except AttributeError:  # HA Core < 2026.9
    HAS_CHILD_DEVICES = False

URL = "http://glp.example.com"

MACHINES_ONE = [
    {
        "id": 1,
        "name": "Gaggiuino",
        "type": "gaggiuino",
        "isDefault": True,
        "enabled": True,
        "reachable": True,
        "on": True,
    },
]

# The keys of the entity classes that are built one per instance instead of
# from a description tuple.
CLASS_KEYS = {"sensor": ("maint_grinders", "status"),
              "binary_sensor": ("is_brewing", "preheat_ready", "machine_standby", "steam_switch", "reachable")}


def _translations(language: str) -> dict:
    return json.loads((COMPONENT_DIR / "translations" / f"{language}.json").read_text())


def _description_keys() -> dict[str, set[str]]:
    return {
        "sensor": (
            {d.translation_key for d in SENSORS}
            | {d.translation_key for d in MAINTENANCE_SENSORS}
            | {d.translation_key for d in MACHINE_SENSORS}
            | set(CLASS_KEYS["sensor"])
        ),
        "binary_sensor": (
            {d.translation_key for d in MACHINE_BINARY_SENSORS} | set(CLASS_KEYS["binary_sensor"])
        ),
    }


def test_every_entity_has_a_translation_key_and_no_name_literal() -> None:
    for platform, descriptions in (
        ("sensor", (*SENSORS, *MAINTENANCE_SENSORS, *MACHINE_SENSORS)),
        ("binary_sensor", MACHINE_BINARY_SENSORS),
    ):
        for description in descriptions:
            assert description.translation_key == description.key, (platform, description.key)
            assert description.name is UNDEFINED, (platform, description.key)
            assert description.icon is None, (platform, description.key)


def test_entity_classes_have_no_name_or_icon_attributes() -> None:
    classes = (
        GlpSensor, GlpMaintenanceSensor, GlpGrinderMaintenanceSensor, GlpAdditionalMachineSensor,
        IsBrewingSensor, PreheatReadySensor, MachineStandbySensor, SteamSwitchSensor,
        GlpMachineBinarySensor, GlpAdditionalMachineReachableSensor,
    )
    for entity_class in classes:
        assert "_attr_name" not in vars(entity_class), entity_class.__name__
        assert "_attr_icon" not in vars(entity_class), entity_class.__name__


def test_every_key_is_translated_in_english_and_german() -> None:
    keys_by_platform = _description_keys()
    english, german = _translations("en"), _translations("de")
    for platform, keys in keys_by_platform.items():
        for key in keys:
            assert key, platform
            assert english["entity"][platform][key]["name"], (platform, key)
            assert german["entity"][platform][key]["name"], (platform, key)


def test_english_and_german_have_the_same_keys() -> None:
    english, german = _translations("en"), _translations("de")
    for section in ("entity", "device"):
        assert english[section].keys() == german[section].keys(), section
    for platform in english["entity"]:
        assert english["entity"][platform].keys() == german["entity"][platform].keys(), platform


def test_device_device_keys_are_translated() -> None:
    english, german = _translations("en"), _translations("de")
    assert set(DEVICE_GROUP_KEYS) == set(english["device"])
    assert set(DEVICE_GROUP_KEYS) == set(german["device"])
    for key in DEVICE_GROUP_KEYS:
        assert english["device"][key]["name"], key
        assert german["device"][key]["name"], key


def test_every_icon_belongs_to_an_entity_translation_key() -> None:
    keys_by_platform = _description_keys()
    icons = load_icons()
    for platform, entries in icons["entity"].items():
        for key, section in entries.items():
            assert key in keys_by_platform[platform], (platform, key)
            assert section["default"].startswith("mdi:"), (platform, key)


async def _setup(hass, aioclient_mock, language: str = "en-US"):
    hass.config.language = language
    mock_all_coordinator_endpoints(aioclient_mock, URL, status={"machines": MACHINES_ONE})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_english_entity_names_come_from_the_translation_file(hass, strict_aioclient_mock) -> None:
    await _setup(hass, strict_aioclient_mock)

    state = hass.states.get("sensor.gaggiuino_local_profiler_machine_status")
    assert state is not None
    assert state.attributes["friendly_name"].endswith("Machine Status")

    shot_count = hass.states.get("sensor.gaggiuino_local_profiler_shot_count")
    assert shot_count.attributes["friendly_name"].endswith("Shot Count")


async def test_german_keeps_the_entity_ids(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, language="de")

    registry = er.async_get(hass)
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_shot_count") == (
        "sensor.gaggiuino_local_profiler_shot_count"
    )
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_maint_descaling") == (
        "sensor.gaggiuino_local_profiler_maint_descaling"
    )
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_preheat_remaining") == (
        "sensor.gaggiuino_local_profiler_preheat_remaining"
    )
    assert registry.async_get_entity_id("binary_sensor", DOMAIN, f"{entry.entry_id}_preheat_ready") == (
        "binary_sensor.gaggiuino_local_profiler_preheat_ready"
    )


def test_device_info_carries_the_group_translation_key() -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL}, entry_id="test_entry")
    for group in DEVICE_GROUP_KEYS:
        for parent_device_id in ("parent_device_id", None):
            info = GlpEntity._device_info(entry, None, group, parent_device_id)
            assert info["translation_key"] == group, (group, parent_device_id)
            # A `name` would win over the translation key, so only the key is set.
            assert "name" not in info, (group, parent_device_id)


def _group_device(hass, entry, group):
    registry = dr.async_get(hass)
    identifier = (DOMAIN, f"{entry.entry_id}_group_{group}")
    if HAS_CHILD_DEVICES:
        return registry.async_get_child_device_by_identifier(identifier, entry.entry_id)
    return registry.async_get_device_by_identifier(identifier, entry.entry_id)


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_child_devices_are_named_from_their_translation_key(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    english = _translations("en")["device"]
    for group in DEVICE_GROUP_KEYS:
        device = _group_device(hass, entry, group)
        assert device is not None, group
        assert device.name == english[group]["name"], group


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_german_shows_the_german_entity_and_device_names(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, language="de")

    shot_count = hass.states.get("sensor.gaggiuino_local_profiler_shot_count")
    assert shot_count.attributes["friendly_name"].endswith("Shot-Anzahl")
    descaling = hass.states.get("sensor.gaggiuino_local_profiler_maint_descaling")
    assert descaling.attributes["friendly_name"].endswith("Entkalken")

    german = _translations("de")["device"]
    for group in DEVICE_GROUP_KEYS:
        device = _group_device(hass, entry, group)
        assert device.name == german[group]["name"], group
    # "Maintenance"/"Preheat" genuinely differ from the English literals, so
    # these two prove the device names are translated rather than hard-coded.
    assert _group_device(hass, entry, "maintenance").name == "Wartung"
    assert _group_device(hass, entry, "preheat").name == "Vorheizen"
