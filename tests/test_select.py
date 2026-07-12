"""Tests for GlpProfileSelect (#44) — the profile picker's current_option
reads live data from the fast machine coordinator (5s), but the entity was
only wired to CoordinatorEntity[GlpDataCoordinator] (the slow, 60s data
coordinator) for its state-push subscription. That mismatch meant a profile
switch made directly on the machine's own screen was fetched correctly but
never actually pushed to Home Assistant until the next slow-coordinator
cycle. The fix subscribes async_added_to_hass to the machine coordinator's
update signal too, so it can also trigger a state write."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.gaggiuino_profiler.select import GlpProfileSelect


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": "http://glp.local:8099"}
    return entry


def _make_select():
    data_coordinator = MagicMock()
    data_coordinator.data = {"profile_options": ["Adaptive", "Sertao Decaf"], "current_profile": "Adaptive"}
    machine_coordinator = MagicMock()
    machine_coordinator.data = {"profileName": "Adaptive"}
    select = GlpProfileSelect(data_coordinator, machine_coordinator, _make_entry())
    return select, data_coordinator, machine_coordinator


@pytest.mark.asyncio
async def test_subscribes_to_machine_coordinator_for_state_updates(monkeypatch):
    select, _data_coordinator, machine_coordinator = _make_select()
    # CoordinatorEntity.async_added_to_hass touches self.hass/self.platform
    # internals we don't need for this test — stub it out and only assert
    # our own subscription logic runs on top of it.
    monkeypatch.setattr(
        "homeassistant.helpers.update_coordinator.CoordinatorEntity.async_added_to_hass",
        AsyncMock(return_value=None),
    )
    select.async_on_remove = MagicMock()

    await select.async_added_to_hass()

    machine_coordinator.async_add_listener.assert_called_once_with(select.async_write_ha_state)
    select.async_on_remove.assert_called_once()


def test_current_option_prefers_machine_coordinator_data():
    select, _data_coordinator, machine_coordinator = _make_select()
    machine_coordinator.data = {"profileName": "Sertao Decaf"}
    assert select.current_option == "Sertao Decaf"


def test_current_option_falls_back_to_data_coordinator_when_machine_data_empty():
    select, data_coordinator, machine_coordinator = _make_select()
    machine_coordinator.data = None
    data_coordinator.data = {"current_profile": "Adaptive"}
    assert select.current_option == "Adaptive"


def test_options_come_from_data_coordinator():
    select, data_coordinator, _machine_coordinator = _make_select()
    assert select.options == ["Adaptive", "Sertao Decaf"]
