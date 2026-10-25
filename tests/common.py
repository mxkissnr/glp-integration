"""Shared helpers for the integration test suite.

Every coordinator swallows transport errors (`except Exception` in
coordinator.py, settings_coordinator.py, machine_coordinator.py and
live_coordinator.py), so a test that forgets to mock an endpoint still
passes: aioclient_mock's assertion for the unmatched URL is swallowed and
the coordinator silently falls back to its default. `record_unmatched_requests`
makes those swallowed assertions visible, and `mock_all_coordinator_endpoints`
registers the whole endpoint set the four coordinators poll on first refresh,
so a full `async_setup_entry` needs a single call.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest import mock

import pytest

SETTINGS_CATEGORIES = ("boiler", "display", "led", "scales", "system")

# Every endpoint the four coordinators request on first refresh. The last
# three are the ones whose failures the production code deliberately ignores
# (settings proxy missing on non-Gaggiuino machines, firmware endpoint 502s,
# SSE stream down) -- they must be mocked all the same, otherwise the request
# is exactly the kind of never-mocked call `record_unmatched_requests` exists
# to expose.
_FIXED_ENDPOINTS = (
    "status",
    "token",
    "shots",
    "maintenance",
    "preheat",
    "profiles",
    "menu",
    "version",
    "firmware_version",
    "live_data",
    "machine_status",
    "machine_live",
    "settings",
    "events",
)


def mock_all_coordinator_endpoints(
    aioclient_mock,
    url: str,
    *,
    status: Any = None,
    token: Any = None,
    shots: Any = None,
    maintenance: Any = None,
    preheat: Any = None,
    profiles: Any = None,
    menu: Any = None,
    version: Any = None,
    firmware_version: Any = None,
    live_data: Any = None,
    machine_status: Any = None,
    machine_live: Any = None,
    settings: dict[str, Any] | None = None,
    events: Any = None,
    skip: tuple[str, ...] = (),
) -> None:
    """Mock every endpoint the coordinators poll, with optional overrides.

    Each keyword replaces the JSON body of the endpoint named after it
    (`machine_status={"available": True}`), `settings` maps a settings
    category to its payload (`settings={"boiler": {...}}`), and `skip` names
    endpoints to leave unmocked -- for tests that assert what happens when an
    endpoint is missing.

    `None` means "use the default", which is what the endpoint returns on a
    machine with no data: an empty object/list, a token of `test-token`, an
    unavailable machine and an already-finished SSE stream (so the live
    coordinator's background task does not retry against an unmocked URL for
    the rest of the test).
    """
    unknown = set(skip) - set(_FIXED_ENDPOINTS)
    if unknown:
        raise ValueError(f"unknown endpoint(s) in skip: {sorted(unknown)}")

    payloads: dict[str, Any] = {
        "status": {} if status is None else status,
        "token": {"apiToken": "test-token"} if token is None else token,
        "shots": [] if shots is None else shots,
        "maintenance": {} if maintenance is None else maintenance,
        "preheat": {} if preheat is None else preheat,
        "profiles": {} if profiles is None else profiles,
        "menu": [] if menu is None else menu,
        "version": {} if version is None else version,
        "firmware_version": {} if firmware_version is None else firmware_version,
        "live_data": {} if live_data is None else live_data,
        "machine_status": {"available": False} if machine_status is None else machine_status,
        "machine_live": {} if machine_live is None else machine_live,
        "settings": {} if settings is None else settings,
        "events": "" if events is None else events,
    }

    registrations: list[tuple[str, str, str, dict[str, Any]]] = [
        ("status", "get", f"{url}/api/status", {"json": payloads["status"]}),
        ("token", "get", f"{url}/api/token", {"json": payloads["token"]}),
        ("shots", "get", f"{url}/shots.json?limit=10", {"json": payloads["shots"]}),
        ("shots", "get", f"{url}/shots.json", {"json": payloads["shots"]}),
        ("maintenance", "get", f"{url}/api/maintenance", {"json": payloads["maintenance"]}),
        ("preheat", "get", f"{url}/api/preheat", {"json": payloads["preheat"]}),
        ("profiles", "get", f"{url}/api/machine/profiles", {"json": payloads["profiles"]}),
        ("menu", "get", f"{url}/api/menu", {"json": payloads["menu"]}),
        ("version", "get", f"{url}/api/version", {"json": payloads["version"]}),
        (
            "firmware_version",
            "get",
            f"{url}/api/machine/firmware/version",
            {"json": payloads["firmware_version"]},
        ),
        ("live_data", "get", f"{url}/api/live/data", {"json": payloads["live_data"]}),
        ("machine_status", "get", f"{url}/api/machine/status", {"json": payloads["machine_status"]}),
        ("machine_live", "get", f"{url}/api/machine/live", {"json": payloads["machine_live"]}),
        ("events", "get", f"{url}/api/events", {"text": payloads["events"]}),
    ]
    for category in SETTINGS_CATEGORIES:
        registrations.append(
            (
                "settings",
                "get",
                f"{url}/api/machine/settings?category={category}",
                {"json": payloads["settings"].get(category, {})},
            )
        )

    for endpoint, method, target, kwargs in registrations:
        if endpoint in skip:
            continue
        getattr(aioclient_mock, method)(target, **kwargs)


@contextmanager
def record_unmatched_requests(aioclient_mock) -> Iterator[list[str]]:
    """Record every request aioclient_mock could not match.

    Yields the list of "METHOD url" strings; it fills up while the block runs.
    Requests still raise for the caller exactly as before -- the point is to
    see the ones the production code swallows.
    """
    unmatched: list[str] = []
    mocker_class = type(aioclient_mock)
    original = mocker_class.match_request

    async def recording_match_request(self, method, url, **kwargs):
        try:
            return await original(self, method, url, **kwargs)
        except AssertionError:
            unmatched.append(f"{str(method).upper()} {url}")
            raise

    with mock.patch.object(mocker_class, "match_request", recording_match_request):
        yield unmatched


def format_unmatched_requests(unmatched: list[str]) -> str:
    """One line per distinct unmatched request, in the order they happened."""
    distinct = list(dict.fromkeys(unmatched))
    return "Test reached endpoint(s) it did not mock:\n" + "\n".join(f"  {request}" for request in distinct)


def fail_on_unmatched_requests(unmatched: list[str]) -> None:
    """Fail the test if any request went unmatched. No-op otherwise."""
    if unmatched:
        pytest.fail(format_unmatched_requests(unmatched), pytrace=False)
