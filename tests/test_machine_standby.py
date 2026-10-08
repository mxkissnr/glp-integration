"""Tests for #219: a GaggiMate in standby (`GET /api/preheat` reports
`standby: true`) is exposed as a `Machine Standby` binary sensor, and while it
is in standby the preheat elapsed/remaining sensors report `unknown` instead
of the app's frozen full/zero countdown. Older app versions (and Gaggiuino)
omit the key entirely, which must read as not-standby with the counters passed
through unchanged.
"""
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator

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


def _mock_all(aioclient_mock, *, preheat: dict) -> None:
    aioclient_mock.get(f"{URL}/api/status", json={"machines": MACHINES_ONE})
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/shots.json", json=[])
    aioclient_mock.get(f"{URL}/api/maintenance", json={})
    aioclient_mock.get(f"{URL}/api/preheat", json=preheat)
    aioclient_mock.get(f"{URL}/api/machine/profiles", json={})
    aioclient_mock.get(f"{URL}/api/menu", json=[])
    aioclient_mock.get(f"{URL}/api/version", json={})
    aioclient_mock.get(f"{URL}/api/live/data", json={})
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": False})


async def _refresh(hass, aioclient_mock, *, preheat: dict) -> dict:
    _mock_all(aioclient_mock, preheat=preheat)
    session = async_get_clientsession(hass)
    coordinator = GlpDataCoordinator(hass, session, URL)
    return await coordinator._async_update_data()


async def _setup_entry(hass, aioclient_mock, *, preheat: dict):
    _mock_all(aioclient_mock, preheat=preheat)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _state(hass, entry, key: str):
    registry = er.async_get(hass)
    entity_id = next(
        (e.entity_id for e in registry.entities.values() if e.unique_id == f"{entry.entry_id}_{key}"),
        None,
    )
    assert entity_id is not None, f"no entity registered for key={key}"
    return hass.states.get(entity_id)


# --- coordinator aggregation -------------------------------------------------

async def test_standby_true_sets_machine_standby_and_hides_preheat_counters(hass, aioclient_mock) -> None:
    data = await _refresh(
        hass, aioclient_mock,
        preheat={"ready": False, "elapsed": 0, "remaining": 300, "standby": True},
    )
    assert data["machine_standby"] is True
    assert data["preheat_elapsed"] is None
    assert data["preheat_remaining"] is None


async def test_standby_false_passes_preheat_counters_through(hass, aioclient_mock) -> None:
    data = await _refresh(
        hass, aioclient_mock,
        preheat={"ready": False, "elapsed": 12, "remaining": 288, "standby": False},
    )
    assert data["machine_standby"] is False
    assert data["preheat_elapsed"] == 12
    assert data["preheat_remaining"] == 288


async def test_missing_standby_key_defaults_to_false(hass, aioclient_mock) -> None:
    """Older app versions don't send `standby` at all."""
    data = await _refresh(
        hass, aioclient_mock,
        preheat={"ready": False, "elapsed": 12, "remaining": 288},
    )
    assert data["machine_standby"] is False
    assert data["preheat_elapsed"] == 12
    assert data["preheat_remaining"] == 288


# --- entities ----------------------------------------------------------------

async def test_standby_true_sensor_is_on_and_counters_unknown(hass, aioclient_mock) -> None:
    entry = await _setup_entry(
        hass, aioclient_mock,
        preheat={"ready": False, "elapsed": 0, "remaining": 300, "standby": True},
    )
    standby = _state(hass, entry, "machine_standby")
    assert standby.state == "on"
    assert standby.attributes.get("icon") == "mdi:power-sleep"
    assert "device_class" not in standby.attributes
    assert _state(hass, entry, "preheat_elapsed").state == "unknown"
    assert _state(hass, entry, "preheat_remaining").state == "unknown"


async def test_standby_false_sensor_is_off_and_counters_pass_through(hass, aioclient_mock) -> None:
    entry = await _setup_entry(
        hass, aioclient_mock,
        preheat={"ready": False, "elapsed": 12, "remaining": 288, "standby": False},
    )
    assert _state(hass, entry, "machine_standby").state == "off"
    assert _state(hass, entry, "preheat_elapsed").state == "12"
    assert _state(hass, entry, "preheat_remaining").state == "288"


async def test_missing_standby_key_sensor_is_off_and_counters_pass_through(hass, aioclient_mock) -> None:
    entry = await _setup_entry(hass, aioclient_mock, preheat={"ready": False, "elapsed": 12, "remaining": 288})
    assert _state(hass, entry, "machine_standby").state == "off"
    assert _state(hass, entry, "preheat_elapsed").state == "12"
    assert _state(hass, entry, "preheat_remaining").state == "288"
