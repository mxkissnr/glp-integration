"""#191: the default-machine device's "Visit" link should open the machine's
own web UI (http://<machineHostname>) rather than the add-on, and the device
should carry the machine firmware coreVersion as sw_version. Both are applied
centrally from the data coordinator (_async_sync_device_metadata), not raced
through per-entity DeviceInfo.
"""
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

URL = "http://glp.example.com"

_FW = {"installed": "15a737d", "latest": "61bd042", "updateAvailable": True,
       "releaseUrl": "https://github.com/Zer0-bit/gaggiuino/releases/tag/main-61bd042"}


def _mock_endpoints(aioclient_mock, *, status_json: dict, firmware=_FW) -> None:
    aioclient_mock.get(f"{URL}/api/status", json=status_json)
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/shots.json", json=[])
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json={})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    aioclient_mock.get(f"{URL}/api/live/data", json={})
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": False})
    if firmware is None:
        aioclient_mock.get(f"{URL}/api/machine/firmware/version", status=502)
    else:
        aioclient_mock.get(f"{URL}/api/machine/firmware/version", json=firmware)


async def _setup(hass, aioclient_mock, status_json, firmware=_FW):
    _mock_endpoints(aioclient_mock, status_json=status_json, firmware=firmware)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _device(hass, entry):
    return dr.async_get(hass).async_get_device(identifiers={(DOMAIN, entry.entry_id)})


async def test_visit_link_points_at_machine_web_ui(hass, aioclient_mock) -> None:
    entry = await _setup(hass, aioclient_mock, {"machineHostname": "gaggia.intern"})
    assert _device(hass, entry).configuration_url == "http://gaggia.intern"


async def test_sw_version_is_machine_firmware(hass, aioclient_mock) -> None:
    entry = await _setup(hass, aioclient_mock, {"machineHostname": "gaggia.intern"})
    assert _device(hass, entry).sw_version == "15a737d"


async def test_falls_back_to_addon_url_when_machine_hostname_unknown(hass, aioclient_mock) -> None:
    entry = await _setup(hass, aioclient_mock, {}, firmware=None)
    assert _device(hass, entry).configuration_url == URL
    assert _device(hass, entry).sw_version is None


async def test_metadata_updated_on_later_coordinator_refresh(hass, aioclient_mock) -> None:
    # Machine unreachable at setup -> no hostname / firmware yet.
    entry = await _setup(hass, aioclient_mock, {}, firmware=None)
    assert _device(hass, entry).configuration_url == URL

    aioclient_mock.clear_requests()
    _mock_endpoints(aioclient_mock, status_json={"machineHostname": "gaggia.intern"})
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    await coordinator.async_refresh()
    await hass.async_block_till_done()

    assert _device(hass, entry).configuration_url == "http://gaggia.intern"
    assert _device(hass, entry).sw_version == "15a737d"
