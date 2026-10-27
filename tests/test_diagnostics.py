"""Diagnostics downloads get pasted into public issue reports, so the export
must not carry addresses, entity ids, tokens or user-entered names.

Two angles: every key listed in TO_REDACT is redacted wherever it appears
(top level, inside the options dict, inside the nested machine registry), and
the non-sensitive values that make the file useful for troubleshooting come
through untouched.
"""
from types import SimpleNamespace

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.diagnostics import (
    TO_REDACT,
    async_get_config_entry_diagnostics,
)
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"
REDACTED = "**REDACTED**"
ENTRY_ID = "entry-1"


async def _diagnostics(coordinator_data, entry_data=None, options=None):
    """Call the real diagnostics handler with a real config entry."""
    hass = SimpleNamespace(
        data={DOMAIN: {ENTRY_ID: {"data": SimpleNamespace(data=coordinator_data)}}}
    )
    entry = MockConfigEntry(
        domain=DOMAIN,
        entry_id=ENTRY_ID,
        data=entry_data if entry_data is not None else {"url": URL},
        options=options or {},
    )
    return await async_get_config_entry_diagnostics(hass, entry)


@pytest.mark.parametrize("key", sorted(TO_REDACT))
async def test_every_to_redact_key_is_redacted(key) -> None:
    coordinator_data = {k: f"secret-{k}" for k in TO_REDACT if k != "url"}
    data = await _diagnostics(coordinator_data, entry_data={"url": "secret-url"})

    if key == "url":
        # In the export the config entry URL is the only `url` value.
        assert data["config_entry"]["url"] == REDACTED
    else:
        assert data["coordinator_data"][key] == REDACTED


async def test_options_are_redacted() -> None:
    data = await _diagnostics({}, options={"url": "http://private.example.com:8123"})

    assert data["config_entry"]["options"]["url"] == REDACTED


async def test_nested_machine_registry_is_redacted() -> None:
    """Machine names and addresses live inside a list of dicts."""
    data = await _diagnostics(
        {
            "machines": [
                {"id": 1, "name": "Kitchen GaggiMate", "isDefault": True},
                {"id": 2, "name": "Office", "isDefault": False},
            ]
        }
    )

    assert data["coordinator_data"]["machines"] == REDACTED


async def test_recent_shot_names_are_redacted() -> None:
    data = await _diagnostics(
        {
            "recent_shots": [
                {"id": 7, "coffee": "Bob's house blend", "grinder": "Bob's Niche", "rating": 4}
            ],
            "grinder_maintenance_details": {"Bob's Niche": {"status": "ok", "shots_since": 3}},
        }
    )

    coordinator = data["coordinator_data"]
    shot = coordinator["recent_shots"][0]
    assert shot["coffee"] == REDACTED
    assert shot["grinder"] == REDACTED
    # Its dict keys are the grinder names themselves, so the whole map goes.
    assert coordinator["grinder_maintenance_details"] == REDACTED
    # The measurements that make the file useful survive.
    assert shot["id"] == 7
    assert shot["rating"] == 4


async def test_non_sensitive_values_survive() -> None:
    data = await _diagnostics(
        {"shot_count": 1234, "shots_today": 3, "machine_status": "online"}
    )

    coordinator = data["coordinator_data"]
    assert coordinator["shot_count"] == 1234
    assert coordinator["shots_today"] == 3
    assert coordinator["machine_status"] == "online"


async def test_real_entry_export_redacts_addresses_and_entity_ids(
    hass, strict_aioclient_mock
) -> None:
    """End to end: the coordinator fills the export and the URL is hidden."""
    mock_all_coordinator_endpoints(
        strict_aioclient_mock,
        URL,
        status={
            "shotCount": 99,
            "machineHostname": "gaggia.local",
            "switchEntity": "switch.kitchen_gaggia",
            "machines": [{"id": 1, "name": "Gaggiuino", "isDefault": True}],
        },
    )
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL}, options={"scan_interval": 45})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    data = await async_get_config_entry_diagnostics(hass, entry)

    assert data["config_entry"]["url"] == REDACTED
    assert data["config_entry"]["options"]["scan_interval"] == 45
    coordinator = data["coordinator_data"]
    assert coordinator["machine_url"] == REDACTED
    assert coordinator["switch_entity"] == REDACTED
    assert coordinator["machines"] == REDACTED
    assert coordinator["shot_count"] == 99
