"""#340: the `shot` event entity mirrors the finished-shot bus event.

The bus event `gaggiuino_profiler_shot_completed` is unchanged; the entity is
an additional, state-triggerable view of the same payload. It must fire once
per new shot and never for a shot that was already known when the entity
started (first refresh, or an HA restart).
"""
import pytest
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints
from tests.test_entity_groups import _group_device

URL = "http://glp.example.com"
ENTITY_ID = "event.gaggiuino_local_profiler_shot"

HAS_CHILD_DEVICES = hasattr(dr, "ChildDeviceInfo")


def _shot(shot_id: int, dose: float | None = None, weight: list | None = None) -> dict:
    annotation = {}
    if dose is not None:
        annotation["dose"] = dose
    datapoints = {}
    if weight is not None:
        datapoints["shotWeight"] = weight
    return {"id": shot_id, "annotation": annotation, "datapoints": datapoints}


async def _setup(hass, aioclient_mock, shots: list):
    mock_all_coordinator_endpoints(aioclient_mock, URL, shots=shots)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _poll(hass, aioclient_mock, entry, shots: list) -> None:
    aioclient_mock.clear_requests()
    mock_all_coordinator_endpoints(aioclient_mock, URL, shots=shots)
    await hass.data[DOMAIN][entry.entry_id]["data"].async_refresh()
    await hass.async_block_till_done()


def _watch_entity_events(hass) -> list:
    """Every state change of the event entity that carries a new event_type.

    A coordinator refresh with an unchanged shot writes the same state and
    attributes again, which HA does not republish, so each entry here is a
    genuinely new event.
    """
    fired: list = []

    def _listener(event) -> None:
        data = event.data
        if data["entity_id"] != ENTITY_ID or data["new_state"] is None:
            return
        if data["new_state"].attributes.get("event_type") is not None:
            fired.append(data["new_state"])

    hass.bus.async_listen("state_changed", _listener)
    return fired


async def test_first_poll_fires_nothing(hass, strict_aioclient_mock) -> None:
    fired = _watch_entity_events(hass)
    await _setup(hass, strict_aioclient_mock, [_shot(1, dose=18, weight=[360])])
    assert fired == []
    assert hass.states.get(ENTITY_ID).attributes.get("event_type") is None


async def test_new_shot_fires_exactly_one_event_with_the_payload(hass, strict_aioclient_mock) -> None:
    fired = _watch_entity_events(hass)
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, dose=18, weight=[360])])

    await _poll(hass, strict_aioclient_mock, entry, [_shot(1), _shot(2, dose=18, weight=[360])])

    assert len(fired) == 1
    state = hass.states.get(ENTITY_ID)
    assert state.attributes["event_type"] == "shot_finished"
    assert state.attributes["shot_id"] == 2
    assert state.attributes["dose_g"] == 18.0
    assert state.attributes["yield_g"] == 36.0
    assert state.attributes["ratio"] == 2.0


async def test_same_shot_on_a_later_poll_does_not_fire_again(hass, strict_aioclient_mock) -> None:
    fired = _watch_entity_events(hass)
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, dose=18)])

    shots = [_shot(1), _shot(2, dose=18, weight=[360])]
    await _poll(hass, strict_aioclient_mock, entry, shots)
    assert len(fired) == 1

    await _poll(hass, strict_aioclient_mock, entry, shots)
    assert len(fired) == 1


async def test_bus_event_still_fires_alongside_the_entity(hass, strict_aioclient_mock) -> None:
    bus_events: list[dict] = []
    hass.bus.async_listen(f"{DOMAIN}_shot_completed", lambda event: bus_events.append(event.data))
    fired = _watch_entity_events(hass)
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1)])

    await _poll(hass, strict_aioclient_mock, entry, [_shot(1), _shot(2, dose=18, weight=[360])])

    assert len(bus_events) == 1
    assert bus_events[0]["shot_id"] == 2
    assert len(fired) == 1


async def test_entity_is_registered_under_the_pinned_id(hass, strict_aioclient_mock) -> None:
    await _setup(hass, strict_aioclient_mock, [_shot(1)])
    state = hass.states.get(ENTITY_ID)
    assert state is not None
    assert state.attributes["event_types"] == ["shot_finished"]


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_entity_sits_on_the_shots_child_device(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1)])

    item = er.async_get(hass).async_get(ENTITY_ID)
    assert item is not None
    assert item.unique_id == f"{entry.entry_id}_shot"
    assert item.device_id == _group_device(hass, entry, "shots").id
