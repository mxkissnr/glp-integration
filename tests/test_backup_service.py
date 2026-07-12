"""Tests for the gaggiuino_profiler.backup service (#46) — exports a full
GLP backup via the add-on's existing GET /api/backup endpoint and writes it
to <config>/glp_backups/, firing gaggiuino_profiler_backup_created so
automations (e.g. mobile notify, pre-update backups) can react."""
import json
import os

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

BACKUP_PAYLOAD = {
    "glp_backup": True,
    "version": "1.99.0",
    "created": "2026-07-12T00:00:00Z",
    "shots": [{"id": 1}, {"id": 2}],
    "annotations": {},
    "coffee_library": [],
    "blocklist": [],
    "trash": [],
}


def _mock_all_coordinator_endpoints(aioclient_mock, url: str) -> None:
    """Mock every endpoint the three coordinators poll on first refresh so
    async_setup_entry completes and the coordinator lands in hass.data —
    the backup service handler looks it up from there, same as
    maintenance_done."""
    aioclient_mock.get(f"{url}/api/status", json={})
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json={})
    aioclient_mock.get(f"{url}/api/machine/profiles", json={})
    aioclient_mock.get(f"{url}/api/menu", json=[])
    aioclient_mock.get(f"{url}/api/version", json={})
    aioclient_mock.get(f"{url}/api/live/data", json={})
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": False})


async def _setup_entry(hass, aioclient_mock):
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


async def test_backup_writes_file_and_fires_event(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.get(f"{url}/api/backup", json=BACKUP_PAYLOAD)

    events = []
    hass.bus.async_listen(f"{DOMAIN}_backup_created", lambda e: events.append(e))

    assert hass.services.has_service(DOMAIN, "backup")
    await hass.services.async_call(DOMAIN, "backup", {}, blocking=True)
    await hass.async_block_till_done()

    assert len(events) == 1
    path = events[0].data["path"]
    assert events[0].data["shots"] == 2
    assert os.path.isfile(path)
    with open(path, encoding="utf-8") as f:
        written = json.load(f)
    assert written == BACKUP_PAYLOAD

    backup_dir = hass.config.path("glp_backups")
    assert os.path.dirname(path) == backup_dir


async def test_backup_failure_does_not_fire_event(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.get(f"{url}/api/backup", status=500)

    events = []
    hass.bus.async_listen(f"{DOMAIN}_backup_created", lambda e: events.append(e))

    with pytest.raises(Exception):
        await hass.services.async_call(DOMAIN, "backup", {}, blocking=True)
    await hass.async_block_till_done()

    assert events == []
