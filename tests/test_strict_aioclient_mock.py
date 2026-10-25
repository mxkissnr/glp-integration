"""Tests for the unmocked-request guard itself (#238).

The guard exists because the coordinators swallow every exception: aioclient's
AssertionError for an unmocked URL disappears into a coordinator's
`except Exception`, so a test that forgot an endpoint still passes and asserts
against the fallback data. These tests pin the guard's own behaviour -- a run
that leaves an endpoint unmocked is reported, a fully mocked one is not.
"""
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import (
    fail_on_unmatched_requests,
    format_unmatched_requests,
    mock_all_coordinator_endpoints,
    record_unmatched_requests,
)

URL = "http://glp.example.com"


async def _setup(hass) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_guard_records_an_endpoint_the_coordinator_swallowed(hass, aioclient_mock) -> None:
    """The data coordinator treats /api/maintenance as best-effort: the
    unmocked URL raises inside it, the exception is swallowed and setup still
    succeeds. The guard must report the request all the same."""
    mock_all_coordinator_endpoints(aioclient_mock, URL, skip=("maintenance",))

    with record_unmatched_requests(aioclient_mock) as unmatched:
        await _setup(hass)

    assert unmatched == [f"GET {URL}/api/maintenance"]


async def test_guard_fails_the_test_with_the_unmatched_request(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL, skip=("maintenance",))

    with record_unmatched_requests(aioclient_mock) as unmatched:
        await _setup(hass)

    with pytest.raises(pytest.fail.Exception) as failure:
        fail_on_unmatched_requests(unmatched)

    assert f"GET {URL}/api/maintenance" in str(failure.value)


async def test_guard_stays_quiet_when_every_endpoint_is_mocked(hass, aioclient_mock) -> None:
    mock_all_coordinator_endpoints(aioclient_mock, URL)

    with record_unmatched_requests(aioclient_mock) as unmatched:
        await _setup(hass)

    assert unmatched == []
    fail_on_unmatched_requests(unmatched)  # must not raise


def test_format_unmatched_requests_lists_each_request_once() -> None:
    reported = format_unmatched_requests([f"GET {URL}/api/maintenance"] * 3)

    assert reported.count(f"GET {URL}/api/maintenance") == 1
