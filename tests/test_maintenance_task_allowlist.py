"""Regression tests for the gaggiuino_profiler.maintenance_done service's
`task` parameter: it is interpolated straight into
/api/maintenance/{task}/done, so it needs the same allowlist treatment as
orders_api.py's _SAFE_ID (fixed for path traversal in #65). services.yaml
documents exactly 6 valid shapes (5 fixed names + grinder_<id>) but exposes
the field as free text in the UI, so nothing upstream of the service handler
constrained it before this fix."""
import pytest
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

TRAVERSAL_TASKS = [
    "../../etc/passwd",
    "descaling/../../evil",
    "../token",
    "/etc/passwd",
    "grinder_left/../../evil",
    "descaling ",  # trailing whitespace -- not one of the 6 documented shapes
]

VALID_TASKS = ["descaling", "backflush", "grouphead", "gaskets", "waterfilter", "grinder_left"]


def _mock_all_coordinator_endpoints(aioclient_mock, url: str) -> None:
    """Mock every endpoint the three coordinators poll on first refresh so
    async_setup_entry completes and the coordinator lands in hass.data --
    same fixture as test_backup_service.py's _setup_entry."""
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


@pytest.mark.parametrize("task", TRAVERSAL_TASKS)
async def test_maintenance_done_rejects_disallowed_task(hass, aioclient_mock, task) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    # No /api/maintenance/.../done mock registered -- if the handler ever
    # reached the HTTP call with a disallowed task, aioclient_mock would
    # raise for the unmocked URL, failing the test for a different reason
    # than the one under test.

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "maintenance_done", {"task": task}, blocking=True
        )


@pytest.mark.parametrize("task", VALID_TASKS)
async def test_maintenance_done_allows_documented_task(hass, aioclient_mock, task) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/maintenance/{task}/done", json={})

    await hass.services.async_call(DOMAIN, "maintenance_done", {"task": task}, blocking=True)
    await hass.async_block_till_done()

    assert aioclient_mock.call_count >= 1
