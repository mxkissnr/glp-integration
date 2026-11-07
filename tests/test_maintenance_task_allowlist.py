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
from tests.common import mock_all_coordinator_endpoints

TRAVERSAL_TASKS = [
    "../../etc/passwd",
    "descaling/../../evil",
    "../token",
    "/etc/passwd",
    "grinder_left/../../evil",
    "descaling ",  # trailing whitespace -- not one of the 6 documented shapes
]

VALID_TASKS = ["descaling", "backflush", "grouphead", "gaskets", "waterfilter", "grinder_left"]


async def _setup_entry(hass, aioclient_mock):
    url = "http://glp.example.com"
    mock_all_coordinator_endpoints(aioclient_mock, url)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


@pytest.mark.parametrize("task", TRAVERSAL_TASKS)
async def test_maintenance_done_rejects_disallowed_task(hass, strict_aioclient_mock, task) -> None:
    entry, url = await _setup_entry(hass, strict_aioclient_mock)
    # No /api/maintenance/.../done mock registered -- if the handler ever
    # reached the HTTP call with a disallowed task, aioclient_mock would
    # raise for the unmocked URL, failing the test for a different reason
    # than the one under test.

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "maintenance_done", {"task": task}, blocking=True
        )


def _post_calls_to(aioclient_mock, path: str):
    return [
        call for call in aioclient_mock.mock_calls
        if call[0].lower() == "post" and str(call[1]).split("?")[0].endswith(path)
    ]


@pytest.mark.parametrize("task", VALID_TASKS)
async def test_maintenance_done_allows_documented_task(hass, strict_aioclient_mock, task) -> None:
    entry, url = await _setup_entry(hass, strict_aioclient_mock)
    strict_aioclient_mock.post(f"{url}/api/maintenance/{task}/done", json={})

    await hass.services.async_call(DOMAIN, "maintenance_done", {"task": task}, blocking=True)
    await hass.async_block_till_done()

    # The service must POST exactly once, to the documented task's own
    # endpoint -- asserting a call count would also be satisfied by the
    # coordinator polling done during setup.
    calls = _post_calls_to(strict_aioclient_mock, f"/api/maintenance/{task}/done")
    assert len(calls) == 1
    _, called_url, body, _ = calls[0]
    assert str(called_url) == f"{url}/api/maintenance/{task}/done"
    assert body is None  # a plain trigger POST, no payload
