"""Tests for #186: isFlushing/isDescaling from the app's live-snapshot payload
(gaggiuino-local-profiler#983/#902) exposed as is_flushing/is_descaling attributes
on the Brewing binary sensor, same coordinator/entity as the existing
profile_name/seq/datapoints attributes."""
from unittest.mock import MagicMock

from custom_components.gaggiuino_profiler.binary_sensor import IsBrewingSensor


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.data = {"url": "http://glp.local:8099"}
    return entry


def _brewing_sensor(data: dict | None):
    coordinator = MagicMock()
    coordinator.data = data
    return IsBrewingSensor(coordinator, _make_entry())


def test_flush_and_descale_attrs_reflect_live_snapshot():
    sensor = _brewing_sensor({"isLive": False, "isFlushing": True, "isDescaling": False})
    assert sensor.is_on is False
    assert sensor.extra_state_attributes == {"is_flushing": True, "is_descaling": False}


def test_descale_attr_true_while_descaling():
    sensor = _brewing_sensor({"isLive": False, "isFlushing": False, "isDescaling": True})
    assert sensor.extra_state_attributes == {"is_flushing": False, "is_descaling": True}


def test_flush_descale_default_false_when_absent():
    sensor = _brewing_sensor({"isLive": True})
    assert sensor.extra_state_attributes == {"is_flushing": False, "is_descaling": False}


def test_flush_descale_attrs_present_alongside_brew_datapoints():
    sensor = _brewing_sensor({
        "isLive": True,
        "isFlushing": False,
        "isDescaling": False,
        "profileName": "V60 default",
        "seq": 3,
        "datapoints": {"timeInShot": [0, 1]},
    })
    assert sensor.extra_state_attributes == {
        "is_flushing": False,
        "is_descaling": False,
        "profile_name": "V60 default",
        "seq": 3,
        "datapoints": {"timeInShot": [0, 1]},
    }


def test_extra_state_attributes_empty_when_coordinator_data_none():
    sensor = _brewing_sensor(None)
    assert sensor.extra_state_attributes == {}
