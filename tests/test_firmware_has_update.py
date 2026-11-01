"""Tests for GlpMachineFirmwareUpdate.has_update (#325).

Home Assistant 2026.11 lets an update entity say whether an update is
available instead of deriving it from a version comparison. Gaggiuino and
GaggiMate release tags are not reliably comparable as versions, so the machine
firmware entity reports the app's own `updateAvailable` flag instead.
"""
from unittest.mock import MagicMock

from custom_components.gaggiuino_profiler.update import GlpMachineFirmwareUpdate


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": "http://glp.local:8099"}
    return entry


def _make_entity(data):
    coordinator = MagicMock()
    coordinator.data = data
    return GlpMachineFirmwareUpdate(coordinator, _make_entry())


def test_has_update_true_when_app_reports_an_update():
    entity = _make_entity({
        "firmware_installed": "v2.0.0-rc3+abc",
        "firmware_latest": "nightly-20261030",
        "firmware_update_available": True,
    })
    assert entity.has_update is True


def test_has_update_false_for_differing_but_incomparable_versions():
    # The version strings differ, so a plain comparison would claim an update;
    # the app's flag says otherwise and wins.
    entity = _make_entity({
        "firmware_installed": "v2.0.0-rc3+abc",
        "firmware_latest": "nightly-20261030",
        "firmware_update_available": False,
    })
    assert entity.has_update is False


def test_has_update_does_not_raise_without_coordinator_data():
    entity = _make_entity(None)
    assert entity.has_update is False


def test_has_update_falls_back_when_flag_is_missing():
    entity = _make_entity({"firmware_installed": "7889b7d"})
    assert entity.has_update is False


def test_has_update_ignores_version_strings_when_flag_is_set():
    entity = _make_entity({
        "firmware_installed": "a1b2c3d",
        "firmware_latest": "a1b2c3d",
        "firmware_update_available": True,
    })
    assert entity.has_update is True
