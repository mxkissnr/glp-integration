"""Regression tests for #234: the services must send the machine id under the
query-parameter name the app actually reads -- `machineId`, not `machine`.

`maintenance_done` honours it (the app's /api/maintenance/<task>/done route
reads `machineId` and falls back to the default machine when it is absent);
`backup` and `set_ready_by` forward it too, but the app ignores it on those
routes as of app v2.0.0. The machine coordinator's /api/machine/status request
uses the same name, matching its existing /api/machine/live call. Every
assertion checks the exact query string, so a regression back to `?machine=`
fails.
"""
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.machine_coordinator import GlpMachineCoordinator

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


def _mock_all_coordinator_endpoints(aioclient_mock) -> None:
    """Mock every endpoint the coordinators poll on first refresh so
    async_setup_entry completes and the data coordinator lands in hass.data
    (the service handlers look it up from there)."""
    aioclient_mock.get(f"{URL}/api/status", json={"machines": MACHINES_ONE})
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/shots.json?limit=10", json=[])
    aioclient_mock.get(f"{URL}/shots.json", json=[])
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    aioclient_mock.get(f"{URL}/api/live/data", json={})
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": False})


async def _setup_entry(hass, aioclient_mock):
    _mock_all_coordinator_endpoints(aioclient_mock)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _calls(aioclient_mock, method: str):
    return [c for c in aioclient_mock.mock_calls if c[0].lower() == method]


async def test_maintenance_done_sends_machine_id_query_param(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{URL}/api/maintenance/descaling/done?machineId=2", json={"ok": True})

    await hass.services.async_call(
        DOMAIN, "maintenance_done", {"task": "descaling", "machine": 2}, blocking=True
    )
    await hass.async_block_till_done()

    posts = _calls(aioclient_mock, "post")
    assert len(posts) == 1
    assert str(posts[0][1]) == f"{URL}/api/maintenance/descaling/done?machineId=2"


async def test_maintenance_done_without_machine_sends_no_query(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{URL}/api/maintenance/descaling/done", json={"ok": True})

    await hass.services.async_call(DOMAIN, "maintenance_done", {"task": "descaling"}, blocking=True)
    await hass.async_block_till_done()

    posts = _calls(aioclient_mock, "post")
    assert len(posts) == 1
    assert str(posts[0][1]) == f"{URL}/api/maintenance/descaling/done"


async def test_backup_sends_machine_id_query_param(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    aioclient_mock.get(f"{URL}/api/backup?machineId=3", json={"shots": []})

    await hass.services.async_call(DOMAIN, "backup", {"machine": 3}, blocking=True)
    await hass.async_block_till_done()

    gets = [c for c in _calls(aioclient_mock, "get") if str(c[1]).startswith(f"{URL}/api/backup")]
    assert len(gets) == 1
    assert str(gets[0][1]) == f"{URL}/api/backup?machineId=3"


async def test_set_ready_by_sends_machine_id_query_param(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{URL}/api/preheat/ready-by?machineId=3", json={"ready": False})

    await hass.services.async_call(DOMAIN, "set_ready_by", {"machine": 3}, blocking=True)
    await hass.async_block_till_done()

    posts = [c for c in _calls(aioclient_mock, "post") if str(c[1]).startswith(f"{URL}/api/preheat/ready-by")]
    assert len(posts) == 1
    assert str(posts[0][1]) == f"{URL}/api/preheat/ready-by?machineId=3"


async def test_machine_coordinator_status_request_uses_machine_id(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/api/machine/status?machineId=2", json={"available": False})
    session = async_get_clientsession(hass)
    coordinator = GlpMachineCoordinator(hass, session, URL, GlpAuth(session, URL), machine_id=2)

    data = await coordinator._async_update_data()

    assert data == {}
    status_gets = [
        str(c[1]) for c in _calls(aioclient_mock, "get") if "/api/machine/status" in str(c[1])
    ]
    assert status_gets == [f"{URL}/api/machine/status?machineId=2"]
