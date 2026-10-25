"""#191: the default-machine device's "Visit" link should open the machine's
own web UI (http://<machineHostname>) rather than the add-on, and the device
should carry the machine firmware coreVersion as sw_version. Both are applied
centrally from the data coordinator (_async_sync_device_metadata), not raced
through per-entity DeviceInfo.
"""
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"

_FW = {"installed": "15a737d", "latest": "61bd042", "updateAvailable": True,
       "releaseUrl": "https://github.com/Zer0-bit/gaggiuino/releases/tag/main-61bd042"}


async def _setup(hass, strict_aioclient_mock, status_json, firmware=_FW):
    # The add-on 502s the firmware endpoint while the machine is unreachable.
    firmware_args = (
        {"statuses": {"firmware_version": 502}} if firmware is None else {"firmware_version": firmware}
    )
    mock_all_coordinator_endpoints(strict_aioclient_mock, URL, status=status_json, **firmware_args)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _device(hass, entry):
    return dr.async_get(hass).async_get_device_by_identifier((DOMAIN, entry.entry_id), entry.entry_id)


async def test_visit_link_points_at_machine_web_ui(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, {"machineHostname": "gaggia.intern"})
    assert _device(hass, entry).configuration_url == "http://gaggia.intern"


async def test_sw_version_is_machine_firmware(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, {"machineHostname": "gaggia.intern"})
    assert _device(hass, entry).sw_version == "15a737d"


async def test_falls_back_to_addon_url_when_machine_hostname_unknown(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, {}, firmware=None)
    assert _device(hass, entry).configuration_url == URL
    assert _device(hass, entry).sw_version is None


async def test_metadata_updated_on_later_coordinator_refresh(hass, strict_aioclient_mock) -> None:
    # Machine unreachable at setup -> no hostname / firmware yet.
    entry = await _setup(hass, strict_aioclient_mock, {}, firmware=None)
    assert _device(hass, entry).configuration_url == URL

    strict_aioclient_mock.clear_requests()
    mock_all_coordinator_endpoints(
        strict_aioclient_mock, URL, status={"machineHostname": "gaggia.intern"}, firmware_version=_FW
    )
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    await coordinator.async_refresh()
    await hass.async_block_till_done()

    assert _device(hass, entry).configuration_url == "http://gaggia.intern"
    assert _device(hass, entry).sw_version == "15a737d"
