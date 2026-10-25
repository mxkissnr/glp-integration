"""Regression test for #667: the machine_status sensor -- whose "online"/
"error" state drives the status dot in both the Lovelace card and the Order
card -- never reflected the physical Gaggiuino machine's reachability, only
the add-on's own sync-link health (lastSyncError). That decoupling was a
deliberate #106 design decision at the time, but the app repo's own status
dot (public-src/components/status.js) was changed two days later by #655 to
treat machineReachable === false as its strongest, highest-priority signal,
falling back to lastSyncError only when reachability is true/unknown -- and
that change was never mirrored into this integration's machine_status
computation (coordinator.py), so the HA dashboard's dot silently drifted out
of sync with the app's own dot and never updated on a pure reachability flip
(machine powered off/on) without a full page reload.

machine_status's *availability* (this test file doesn't touch that) remains
governed by the separate requires_machine_reachable mechanism, used only by
the two live machine-value sensors from #106 -- see
test_machine_reachable_availability.py.
"""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

PREHEAT_PAYLOAD = {"temp": 93.5, "targetTemp": 94.0}


async def _machine_status(hass, strict_aioclient_mock, status_json: dict) -> str:
    url = "http://glp.example.com"
    mock_all_coordinator_endpoints(
        strict_aioclient_mock, url, status=status_json, preheat=PREHEAT_PAYLOAD
    )
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get("sensor.gaggiuino_local_profiler_machine_status")
    assert state is not None
    return state.state


async def test_machine_status_error_when_unreachable_without_sync_error(hass, strict_aioclient_mock) -> None:
    """#667: a pure reachability flip (machine off, add-on link itself still
    fine) must alone flip the dot to "error" -- previously stayed "online"
    forever until lastSyncError also happened to change."""
    status = await _machine_status(
        hass, strict_aioclient_mock, {"machineReachable": False, "lastSyncError": None}
    )
    assert status == "error"


async def test_machine_status_online_when_reachable_without_sync_error(hass, strict_aioclient_mock) -> None:
    status = await _machine_status(
        hass, strict_aioclient_mock, {"machineReachable": True, "lastSyncError": None}
    )
    assert status == "online"


async def test_machine_status_error_when_reachable_but_sync_error(hass, strict_aioclient_mock) -> None:
    """lastSyncError still triggers "error" even while the machine itself is
    reachable -- the add-on's own sync-link health is unchanged as a signal,
    just no longer the only one."""
    status = await _machine_status(
        hass, strict_aioclient_mock, {"machineReachable": True, "lastSyncError": "boom"}
    )
    assert status == "error"


async def test_machine_status_online_when_reachable_key_absent(hass, strict_aioclient_mock) -> None:
    """Backward compat: an add-on version predating #106 (no
    "machineReachable" key at all, i.e. None) must not be misread as
    "unreachable" -- falls back to the old lastSyncError-only behavior."""
    status = await _machine_status(hass, strict_aioclient_mock, {"lastSyncError": None})
    assert status == "online"
