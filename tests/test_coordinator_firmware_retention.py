"""#191: GlpDataCoordinator must not null out a previously known machine
firmware version when a later /api/machine/firmware/version fetch fails or
comes back without an "installed" coreVersion (the add-on 502s / drops that
field whenever the machine is unreachable, which here is most of the time).
"""
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator

URL = "http://glp.example.com"


def _mock_core(aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/status", json={})
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/shots.json", json=[])
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})


_FW_OK = {
    "installed": "15a737d",
    "latest": "61bd042",
    "updateAvailable": True,
    "releaseUrl": "https://github.com/Zer0-bit/gaggiuino/releases/tag/main-61bd042",
}


async def test_firmware_retained_when_endpoint_starts_failing(hass, aioclient_mock) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    coordinator = GlpDataCoordinator(hass, async_get_clientsession(hass), URL)

    _mock_core(aioclient_mock)
    aioclient_mock.get(f"{URL}/api/machine/firmware/version", json=_FW_OK)
    data = await coordinator._async_update_data()
    assert data["firmware_installed"] == "15a737d"
    assert data["firmware_latest"] == "61bd042"
    assert data["firmware_update_available"] is True

    # Machine goes offline -> add-on 502s the firmware endpoint.
    aioclient_mock.clear_requests()
    _mock_core(aioclient_mock)
    aioclient_mock.get(f"{URL}/api/machine/firmware/version", status=502)
    data = await coordinator._async_update_data()
    assert data["firmware_installed"] == "15a737d"
    assert data["firmware_latest"] == "61bd042"
    assert data["firmware_update_available"] is True
    assert data["firmware_release_url"] == _FW_OK["releaseUrl"]


async def test_firmware_retained_when_installed_missing_from_payload(hass, aioclient_mock) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    coordinator = GlpDataCoordinator(hass, async_get_clientsession(hass), URL)

    _mock_core(aioclient_mock)
    aioclient_mock.get(f"{URL}/api/machine/firmware/version", json=_FW_OK)
    await coordinator._async_update_data()

    aioclient_mock.clear_requests()
    _mock_core(aioclient_mock)
    aioclient_mock.get(
        f"{URL}/api/machine/firmware/version",
        json={"installed": None, "latest": None, "updateAvailable": False},
    )
    data = await coordinator._async_update_data()
    assert data["firmware_installed"] == "15a737d"
    assert data["firmware_latest"] == "61bd042"


async def test_firmware_stays_none_when_never_seen(hass, aioclient_mock) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    coordinator = GlpDataCoordinator(hass, async_get_clientsession(hass), URL)

    _mock_core(aioclient_mock)
    aioclient_mock.get(f"{URL}/api/machine/firmware/version", status=502)
    data = await coordinator._async_update_data()
    assert data["firmware_installed"] is None
    assert data["firmware_latest"] is None
    assert data["firmware_update_available"] is False
