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


def _mock_all_coordinator_endpoints(aioclient_mock, url: str, status_json: dict) -> None:
    aioclient_mock.get(f"{url}/api/status", json=status_json)
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json={"temp": 93.5, "targetTemp": 94.0})
    aioclient_mock.get(f"{url}/api/machine/profiles", json={})
    aioclient_mock.get(f"{url}/api/menu", json=[])
    aioclient_mock.get(f"{url}/api/version", json={})
    aioclient_mock.get(f"{url}/api/live/data", json={})
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": False})


async def _machine_status(hass, aioclient_mock, status_json: dict) -> str:
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url, status_json)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get("sensor.gaggiuino_local_profiler_machine_status")
    assert state is not None
    return state.state


async def test_machine_status_error_when_unreachable_without_sync_error(hass, aioclient_mock) -> None:
    """#667: a pure reachability flip (machine off, add-on link itself still
    fine) must alone flip the dot to "error" -- previously stayed "online"
    forever until lastSyncError also happened to change."""
    assert await _machine_status(hass, aioclient_mock, {"machineReachable": False, "lastSyncError": None}) == "error"


async def test_machine_status_online_when_reachable_without_sync_error(hass, aioclient_mock) -> None:
    assert await _machine_status(hass, aioclient_mock, {"machineReachable": True, "lastSyncError": None}) == "online"


async def test_machine_status_error_when_reachable_but_sync_error(hass, aioclient_mock) -> None:
    """lastSyncError still triggers "error" even while the machine itself is
    reachable -- the add-on's own sync-link health is unchanged as a signal,
    just no longer the only one."""
    assert (
        await _machine_status(hass, aioclient_mock, {"machineReachable": True, "lastSyncError": "boom"}) == "error"
    )


async def test_machine_status_online_when_reachable_key_absent(hass, aioclient_mock) -> None:
    """Backward compat: an add-on version predating #106 (no
    "machineReachable" key at all, i.e. None) must not be misread as
    "unreachable" -- falls back to the old lastSyncError-only behavior."""
    assert await _machine_status(hass, aioclient_mock, {"lastSyncError": None}) == "online"
