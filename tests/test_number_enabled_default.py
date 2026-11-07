"""#341 (point 7): the rarely used technical number entities start disabled on
new installs. Home Assistant only applies `entity_registry_enabled_default`
when it creates a registry entry, so an install that already had the entity
keeps it enabled -- both paths are covered here.
"""
from __future__ import annotations

from homeassistant.helpers import entity_registry as er

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.number import NUMBERS
from tests.test_control_entities import _setup_entry

DISABLED_KEYS = frozenset({
    "offset_temp",
    "hpwr",
    "main_divider",
    "brew_divider",
    "led_tof_min",
    "led_tof_max",
})
ENABLED_KEYS = frozenset({
    "steam_set_point",
    "startup_heat_delta",
    "lcd_brightness",
    "lcd_sleep",
    "lcd_go_home",
})


def test_exactly_the_six_technical_descriptions_are_disabled_by_default() -> None:
    disabled = {d.key for d in NUMBERS if d.entity_registry_enabled_default is False}
    assert disabled == DISABLED_KEYS


async def test_fresh_install_registers_the_six_disabled(hass, strict_aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, strict_aioclient_mock)
    registry = er.async_get(hass)

    for key in DISABLED_KEYS:
        entity_id = registry.async_get_entity_id("number", DOMAIN, f"{entry.entry_id}_{key}")
        assert entity_id is not None, key
        assert registry.async_get(entity_id).disabled_by is er.RegistryEntryDisabler.INTEGRATION, key
        assert hass.states.get(entity_id) is None, key

    for key in ENABLED_KEYS:
        entity_id = registry.async_get_entity_id("number", DOMAIN, f"{entry.entry_id}_{key}")
        assert entity_id is not None, key
        assert registry.async_get(entity_id).disabled_by is None, key
        assert hass.states.get(entity_id) is not None, key


async def test_existing_install_keeps_the_six_enabled(hass, strict_aioclient_mock) -> None:
    entry, _ = await _setup_entry(hass, strict_aioclient_mock, enable=tuple(sorted(DISABLED_KEYS)))
    registry = er.async_get(hass)

    for key in DISABLED_KEYS:
        entity_id = f"number.gaggiuino_local_profiler_{key}"
        item = registry.async_get(entity_id)
        assert item is not None, key
        assert item.unique_id == f"{entry.entry_id}_{key}"
        assert item.disabled_by is None, key
        state = hass.states.get(entity_id)
        assert state is not None, key
        assert state.state != "unavailable", key
