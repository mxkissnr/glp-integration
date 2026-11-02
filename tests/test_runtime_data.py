"""Tests for storing the coordinators on the config entry (#341, part 1).

`async_setup_entry` used to publish the coordinators only through
`hass.data[DOMAIN][entry_id]`; they now live on `entry.runtime_data` as a
`GlpRuntimeData` instance, which is what the read-only platforms and the
domain services read. The same tests pin the not-ready behaviour: a failing
main coordinator must leave the entry in SETUP_RETRY (HA retries) while the
deliberately best-effort machine coordinator must not block setup.
"""
from homeassistant.config_entries import ConfigEntryState
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler import GlpRuntimeData
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator
from custom_components.gaggiuino_profiler.live_coordinator import GlpLiveCoordinator
from custom_components.gaggiuino_profiler.machine_coordinator import GlpMachineCoordinator
from custom_components.gaggiuino_profiler.settings_coordinator import GlpSettingsCoordinator
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"


async def _setup_entry(hass, aioclient_mock, *, statuses=None):
    mock_all_coordinator_endpoints(aioclient_mock, URL, statuses=statuses)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_runtime_data_holds_every_coordinator(hass, strict_aioclient_mock) -> None:
    entry = await _setup_entry(hass, strict_aioclient_mock)

    runtime_data = entry.runtime_data
    assert isinstance(runtime_data, GlpRuntimeData)
    assert isinstance(runtime_data.data, GlpDataCoordinator)
    assert isinstance(runtime_data.live, GlpLiveCoordinator)
    assert isinstance(runtime_data.machine, GlpMachineCoordinator)
    assert isinstance(runtime_data.settings, GlpSettingsCoordinator)
    assert isinstance(runtime_data.parent_device_id, str)

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_main_coordinator_failure_leaves_entry_in_setup_retry(hass, strict_aioclient_mock) -> None:
    """ConfigEntryNotReady from the main coordinator -> HA retries setup."""
    mock_all_coordinator_endpoints(strict_aioclient_mock, URL, statuses={"status": 500})
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)

    assert not await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY


async def test_machine_coordinator_failure_does_not_block_setup(hass, strict_aioclient_mock) -> None:
    """The machine coordinator is best-effort: its UpdateFailed is swallowed."""
    entry = await _setup_entry(hass, strict_aioclient_mock, statuses={"machine_status": 500})

    assert entry.state is ConfigEntryState.LOADED
    assert isinstance(entry.runtime_data, GlpRuntimeData)
    assert entry.runtime_data.machine.data in (None, {})

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_maintenance_done_service_uses_runtime_data_coordinator(hass, strict_aioclient_mock) -> None:
    entry = await _setup_entry(hass, strict_aioclient_mock)
    strict_aioclient_mock.post(f"{URL}/api/maintenance/descaling/done", json={"ok": True})

    # The entry's own dict is no longer what the service reads: blank it out
    # and the call must still reach the app through entry.runtime_data.
    hass.data[DOMAIN][entry.entry_id] = {}

    await hass.services.async_call(DOMAIN, "maintenance_done", {"task": "descaling"}, blocking=True)
    await hass.async_block_till_done()

    posts = [c for c in strict_aioclient_mock.mock_calls if c[0].lower() == "post"]
    assert len(posts) == 1
    assert str(posts[0][1]) == f"{URL}/api/maintenance/descaling/done"

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
