"""#342: the `last_shot_chart` image entity serves the app's shot chart.

The picture is the app's own render (`GET /api/shots/{id}/chart.png`, app
#1851). The integration keeps it in memory per shot id, because the image
proxy and every open dashboard call `async_image()` again and again while the
app redraws on each request and allows 30 renders per minute per IP.

The chart is fetched only when somebody asks for it -- never during setup or
polling -- and a 404 (older app without the route, or a deleted shot) makes
the entity unavailable until the next shot.
"""
from datetime import UTC, datetime

import pytest
from homeassistant.components.image import async_get_image
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints
from tests.test_entity_groups import HAS_CHILD_DEVICES, _group_device

URL = "http://glp.example.com"
ENTITY_ID = "image.gaggiuino_local_profiler_last_shot_chart"
PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 16

# The timestamps the app stores, in Unix seconds.
TS_1 = 1_700_000_000
TS_2 = 1_700_000_600


def _shot(shot_id: int, timestamp: int) -> dict:
    return {"id": shot_id, "timestamp": timestamp, "annotation": {}, "datapoints": {}}


def _state_of(shot_timestamp: int) -> str:
    return datetime.fromtimestamp(shot_timestamp, UTC).isoformat()


def _mock_chart(aioclient_mock, shot_id: int, **kwargs) -> None:
    kwargs.setdefault("content", PNG)
    kwargs.setdefault("headers", {"Content-Type": "image/png"})
    aioclient_mock.get(f"{URL}/api/shots/{shot_id}/chart.png", **kwargs)


def _chart_calls(aioclient_mock) -> list:
    return [call for call in aioclient_mock.mock_calls if "/chart.png" in str(call[1])]


async def _setup(hass, aioclient_mock, shots: list, **endpoints):
    mock_all_coordinator_endpoints(aioclient_mock, URL, shots=shots, **endpoints)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _poll(hass, aioclient_mock, entry, shots: list, **endpoints) -> None:
    aioclient_mock.clear_requests()
    mock_all_coordinator_endpoints(aioclient_mock, URL, shots=shots, **endpoints)
    await entry.runtime_data.data.async_refresh()
    await hass.async_block_till_done()


async def test_entity_exists_with_the_pinned_id_and_the_last_shot_as_state(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1), _shot(2, TS_2)])

    state = hass.states.get(ENTITY_ID)
    assert state is not None
    assert state.state == _state_of(TS_2)

    item = er.async_get(hass).async_get(ENTITY_ID)
    assert item.translation_key == "last_shot_chart"
    assert item.unique_id == f"{entry.entry_id}_last_shot_chart"


@pytest.mark.skipif(not HAS_CHILD_DEVICES, reason="HA Core < 2026.9 has no child devices")
async def test_entity_sits_on_the_shots_child_device(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])

    item = er.async_get(hass).async_get(ENTITY_ID)
    assert item.device_id == _group_device(hass, entry, "shots").id


async def test_setup_and_polling_never_request_the_chart(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])
    assert _chart_calls(strict_aioclient_mock) == []

    await _poll(hass, strict_aioclient_mock, entry, [_shot(1, TS_1)])
    assert _chart_calls(strict_aioclient_mock) == []


async def test_async_get_image_returns_the_apps_png_and_caches_it(hass, strict_aioclient_mock) -> None:
    _mock_chart(strict_aioclient_mock, 2)
    await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1), _shot(2, TS_2)])

    image = await async_get_image(hass, ENTITY_ID)

    assert image.content_type == "image/png"
    assert image.content == PNG
    calls = _chart_calls(strict_aioclient_mock)
    assert len(calls) == 1
    assert calls[0][1].query["lang"] == "en"
    assert calls[0][3]["X-GLP-Token"] == "test-token"

    # The same shot is never rendered twice: the in-memory picture answers.
    await async_get_image(hass, ENTITY_ID)
    assert len(_chart_calls(strict_aioclient_mock)) == 1


async def test_state_moves_only_with_the_last_shot(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])
    assert hass.states.get(ENTITY_ID).state == _state_of(TS_1)

    await _poll(hass, strict_aioclient_mock, entry, [_shot(1, TS_1)])
    assert hass.states.get(ENTITY_ID).state == _state_of(TS_1)

    await _poll(hass, strict_aioclient_mock, entry, [_shot(1, TS_1), _shot(2, TS_2)])
    assert hass.states.get(ENTITY_ID).state == _state_of(TS_2)

    _mock_chart(strict_aioclient_mock, 2)
    await async_get_image(hass, ENTITY_ID)
    assert [call[1].path for call in _chart_calls(strict_aioclient_mock)] == ["/api/shots/2/chart.png"]


async def test_404_makes_the_entity_unavailable_until_the_next_shot(hass, strict_aioclient_mock) -> None:
    """An older app has no chart route; a deleted shot answers 404 as well."""
    _mock_chart(strict_aioclient_mock, 1, status=404)
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, ENTITY_ID)

    assert hass.states.get(ENTITY_ID).state == "unavailable"
    # Unavailable means no more requests for the same shot.
    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, ENTITY_ID)
    assert len(_chart_calls(strict_aioclient_mock)) == 1

    await _poll(hass, strict_aioclient_mock, entry, [_shot(1, TS_1), _shot(2, TS_2)])
    assert hass.states.get(ENTITY_ID).state == _state_of(TS_2)

    _mock_chart(strict_aioclient_mock, 2)
    image = await async_get_image(hass, ENTITY_ID)
    assert image.content == PNG


async def test_non_image_content_type_yields_no_picture_but_keeps_the_entity_available(
    hass, strict_aioclient_mock
) -> None:
    _mock_chart(strict_aioclient_mock, 1, content=b"<html></html>", headers={"Content-Type": "text/html"})
    await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, ENTITY_ID)

    assert hass.states.get(ENTITY_ID).state == _state_of(TS_1)


async def test_server_error_keeps_the_entity_available_and_is_retried(hass, strict_aioclient_mock) -> None:
    _mock_chart(strict_aioclient_mock, 1, status=500)
    await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, ENTITY_ID)
    assert hass.states.get(ENTITY_ID).state == _state_of(TS_1)

    # 429/500 are transient, so the next call asks the app again.
    strict_aioclient_mock.clear_requests()
    _mock_chart(strict_aioclient_mock, 1)
    image = await async_get_image(hass, ENTITY_ID)
    assert image.content == PNG


async def test_rejected_token_is_dropped(hass, strict_aioclient_mock) -> None:
    _mock_chart(strict_aioclient_mock, 1, status=401)
    entry = await _setup(hass, strict_aioclient_mock, [_shot(1, TS_1)])

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, ENTITY_ID)

    assert entry.runtime_data.data.auth._cached_headers == {}


async def test_no_shots_means_no_picture_and_no_request(hass, strict_aioclient_mock) -> None:
    await _setup(hass, strict_aioclient_mock, [])

    assert hass.states.get(ENTITY_ID).state == "unavailable"
    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, ENTITY_ID)
    assert _chart_calls(strict_aioclient_mock) == []
