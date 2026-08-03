"""Regression tests for the #109 review fix: the Gaggiuino REST API returns
some settings fields as real JSON booleans and others as the JSON *strings*
"true"/"false" (live-verified against gaggiuino/gaggiuino.github.io's
docs/rest-api/rest-api.md) -- boiler.brewDeltaState/dreamSteamState,
display.lcdDarkMode, scales.forcePredictive/hwScalesEnabled/btScalesEnabled,
led.state/disco.

`bool("false")` is `True` in Python (non-empty string), so a naive `bool(...)`
cast on one of these fields reported permanently ON regardless of the actual
value -- exactly the failure a test using real Python True/False mock data
would never catch. These tests build settings payloads with the string
representation on purpose."""
from unittest.mock import MagicMock

from custom_components.gaggiuino_profiler.gaggiuino_bool import (
    coerce_gaggiuino_bool,
    encode_gaggiuino_bool,
)
from custom_components.gaggiuino_profiler.light import GlpLedLight
from custom_components.gaggiuino_profiler.switch import SWITCHES, GlpMachineSwitch


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": "http://glp.local:8099"}
    return entry


# ── coerce_gaggiuino_bool ─────────────────────────────────────────────────


def test_coerce_real_bool_passes_through():
    assert coerce_gaggiuino_bool(True) is True
    assert coerce_gaggiuino_bool(False) is False


def test_coerce_string_false_is_false_not_truthy():
    # The bug: bool("false") is True in plain Python.
    assert coerce_gaggiuino_bool("false") is False


def test_coerce_string_true_is_true():
    assert coerce_gaggiuino_bool("true") is True


def test_coerce_is_case_and_whitespace_insensitive():
    assert coerce_gaggiuino_bool("FALSE") is False
    assert coerce_gaggiuino_bool(" True ") is True


def test_coerce_unrecognized_value_is_none():
    assert coerce_gaggiuino_bool(None) is None
    assert coerce_gaggiuino_bool("") is None
    assert coerce_gaggiuino_bool(123) is None


# ── encode_gaggiuino_bool ──────────────────────────────────────────────────


def test_encode_matches_string_representation_when_like_is_string():
    assert encode_gaggiuino_bool(True, like="false") == "true"
    assert encode_gaggiuino_bool(False, like="true") == "false"


def test_encode_stays_real_bool_when_like_is_bool_or_missing():
    assert encode_gaggiuino_bool(True, like=False) is True
    assert encode_gaggiuino_bool(False, like=None) is False


# ── GlpMachineSwitch.is_on with string-typed settings fields ──────────────


def _switch(key: str, settings: dict):
    coordinator = MagicMock()
    coordinator.data = {"scales": settings, "boiler": settings, "display": settings}
    description = next(d for d in SWITCHES if d.key == key)
    return GlpMachineSwitch(coordinator, _make_entry(), description)


def test_switch_is_on_false_for_string_false_field():
    switch = _switch("bt_scales_enabled", {"btScalesEnabled": "false"})
    assert switch.is_on is False


def test_switch_is_on_true_for_string_true_field():
    switch = _switch("hw_scales_enabled", {"hwScalesEnabled": "true"})
    assert switch.is_on is True


def test_switch_is_on_still_works_for_real_bool_field():
    switch = _switch("lcd_close_on_brew_off", {"lcdCloseOnBrewOff": False})
    assert switch.is_on is False


# ── GlpLedLight.is_on/effect with string-typed settings fields ────────────


def _led_light(settings: dict):
    coordinator = MagicMock()
    coordinator.data = {"led": settings}
    return GlpLedLight(coordinator, _make_entry())


def test_led_is_on_false_for_string_false_state():
    light = _led_light({"state": "false", "disco": "false"})
    assert light.is_on is False


def test_led_is_on_true_for_string_true_state():
    light = _led_light({"state": "true", "disco": "false"})
    assert light.is_on is True


def test_led_effect_none_for_string_false_disco():
    light = _led_light({"state": "true", "disco": "false"})
    assert light.effect == "None"


def test_led_effect_disco_for_string_true_disco():
    light = _led_light({"state": "true", "disco": "true"})
    assert light.effect == "Disco"
