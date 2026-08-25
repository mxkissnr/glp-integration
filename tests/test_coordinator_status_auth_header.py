"""Regression test for #170: the /api/status request must carry the
X-GLP-Token auth header like every other endpoint _async_update_data() calls
-- otherwise the add-on's /api/status route omits its whole `sensitive`
response object (switch_entity, machineUrl, lastSyncError, ...), and
switch_entity never reaches the machine_status sensor's attributes.
"""
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator

URL = "http://glp.example.com"


async def test_status_request_carries_auth_token_header(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/api/status", json={"switchEntity": "switch.espresso_plug"})
    aioclient_mock.get(f"{URL}/shots.json", json=[])
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    aioclient_mock.get(f"{URL}/api/live/data", json={})
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": False})

    session = async_get_clientsession(hass)
    coordinator = GlpDataCoordinator(hass, session, URL)
    data = await coordinator._async_update_data()

    status_calls = [c for c in aioclient_mock.mock_calls if str(c[1]).endswith("/api/status")]
    assert len(status_calls) == 1
    assert status_calls[0][3].get("X-GLP-Token") == "test-token"

    # end-to-end: switch_entity actually reaches coordinator.data, which is
    # only possible if the add-on saw the request as authenticated.
    assert data["switch_entity"] == "switch.espresso_plug"
