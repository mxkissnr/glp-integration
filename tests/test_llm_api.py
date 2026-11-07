"""Tests for the read-only Assist tools (#343).

The integration registers one LLM API per config entry with
`homeassistant.helpers.llm`, so a conversation agent can answer questions
about shots, maintenance and the machine. Every tool only reads the data the
coordinators hold: no HTTP request, no service call, no state change.
"""
import json
from datetime import UTC, datetime
from unittest import mock

from homeassistant.core import Context
from homeassistant.helpers import llm
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler import llm_api
from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints

URL = "http://glp.example.com"
URL2 = "http://glp-dev.example.com"

TOOL_NAMES = ["glp_last_shot", "glp_shots_today", "glp_maintenance_due", "glp_machine_status"]


def _now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _status() -> dict:
    return {
        "shotCount": 120,
        "machineReachable": True,
        "lastSync": _now().isoformat(),
        "machines": [
            {"id": 1, "name": "Gaggiuino", "type": "gaggiuino", "isDefault": True, "enabled": True,
             "reachable": True, "on": True},
            {"id": 2, "name": "Kitchen GaggiMate", "type": "gaggimate", "isDefault": False, "enabled": True,
             "reachable": False, "on": False},
        ],
    }


def _shots() -> list:
    return [
        {
            "id": 42,
            "timestamp": int(_now().timestamp()),
            "profileName": "Adaptive",
            "annotation": {
                "dose": 18,
                "rating": 4,
                "coffee": "Ethiopia Guji",
                "grinder": "Niche",
                "grindSetting": 12,
            },
            "datapoints": {
                "pressure": [80, 90, 100],
                "timeInShot": [0, 280],
                "shotWeight": [0, 360],
            },
            "score": 87,
        }
    ]


def _maintenance() -> dict:
    return {
        "descaling": {"status": "due", "pct": 1.0, "daysSince": 40, "shotsSince": 200,
                      "lastDate": "2026-09-01", "threshold_shots": 100, "threshold_days": 30},
        "backflush": {"status": "soon", "pct": 0.85, "daysSince": 8, "shotsSince": 40,
                      "lastDate": "2026-10-30", "threshold_shots": 50, "threshold_days": 10},
        "gaskets": {"status": "never", "pct": 0, "daysSince": None, "shotsSince": 0, "lastDate": None},
        "grinder_3": {"grinderName": "Niche", "status": "ok", "daysSince": 3, "shotsSince": 10,
                      "lastDate": "2026-11-04", "pct": 0.1},
    }


async def _setup(hass, aioclient_mock, *, url: str = URL, title: str = "Stable", **overrides) -> MockConfigEntry:
    payloads = {
        "status": _status(),
        "shots": _shots(),
        "maintenance": _maintenance(),
        "preheat": {"ready": True, "temp": 93.1, "targetTemp": 93},
        "live_data": {"isLive": False},
        "machine_status": {"available": True, "waterLevel": 64},
    }
    payloads.update(overrides)
    mock_all_coordinator_endpoints(aioclient_mock, url, **payloads)
    entry = MockConfigEntry(domain=DOMAIN, title=title, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _snapshot_states(hass) -> list:
    return [(state.entity_id, state.state, dict(state.attributes)) for state in hass.states.async_all()]


def _llm_context() -> llm.LLMContext:
    return llm.LLMContext(
        platform="test",
        context=Context(),
        language="en",
        assistant="conversation",
        device_id=None,
    )


async def _instance(hass, entry: MockConfigEntry) -> llm.APIInstance:
    return await llm.async_get_api(hass, f"{DOMAIN}-{entry.entry_id}", _llm_context())


async def _call(hass, entry: MockConfigEntry, tool_name: str):
    instance = await _instance(hass, entry)
    return await instance.async_call_tool(llm.ToolInput(tool_name=tool_name, tool_args={}))


def _data(result) -> dict:
    """The tool payload, whether the helper wrapped it in ToolResult or not."""
    return result.data if isinstance(getattr(result, "data", None), dict) else result


async def test_registers_one_api_per_entry(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    apis = {api.id: api for api in llm.async_get_apis(hass)}
    api_id = f"{DOMAIN}-{entry.entry_id}"
    assert api_id in apis
    assert apis[api_id].name == f"Gaggiuino Local Profiler ({entry.title})"

    instance = await _instance(hass, entry)
    assert sorted(tool.name for tool in instance.tools) == sorted(TOOL_NAMES)

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_last_shot(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    result = await _call(hass, entry, "glp_last_shot")

    if hasattr(llm, "ToolResult"):
        assert isinstance(result, llm.ToolResult)
        assert result.error is False
    data = _data(result)
    assert data["machine"] == "Gaggiuino"
    assert data["shot_id"] == 42
    assert data["profile"] == "Adaptive"
    assert data["duration_s"] == 28.0
    assert data["yield_g"] == 36.0
    assert data["dose_g"] == 18.0
    assert data["ratio"] == 2.0
    assert data["avg_pressure_bar"] == 9.0
    assert data["rating"] == 4
    assert data["coffee"] == "Ethiopia Guji"
    assert data["grinder"] == "Niche"
    assert data["score"] == 87
    assert data["grind_setting"] == 12
    assert data["time"] is not None
    assert data["app_reachable"] is True
    assert json.dumps(data)

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_shots_today(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    data = _data(await _call(hass, entry, "glp_shots_today"))

    assert data["machine"] == "Gaggiuino"
    assert data["shots_today"] == 1
    assert data["shot_count_total"] == 120
    assert data["last_shot_time"] is not None
    assert json.dumps(data)

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_maintenance_due(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    data = _data(await _call(hass, entry, "glp_maintenance_due"))

    assert data["machine"] == "Gaggiuino"
    assert data["due"] == ["descaling"]
    assert data["due_soon"] == ["backflush"]
    assert data["never_done"] == ["gaskets"]
    assert data["tasks"]["descaling"]["progress_pct"] == 100
    assert data["tasks"]["descaling"]["threshold_shots"] == 100
    assert data["tasks"]["descaling"]["threshold_days"] == 30
    assert data["tasks"]["backflush"]["progress_pct"] == 85
    assert data["tasks"]["gaskets"]["status"] == "never"
    assert data["grinders"]["Niche"]["status"] == "ok"
    assert data["grinders"]["Niche"]["days_since"] == 3
    assert json.dumps(data)

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_machine_status(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)

    data = _data(await _call(hass, entry, "glp_machine_status"))

    assert data["machine"] == "Gaggiuino"
    assert data["status"] == "online"
    assert data["reachable"] is True
    assert data["preheat_ready"] is True
    assert data["temperature_c"] == 93.1
    assert data["target_temperature_c"] == 93
    assert data["brewing"] is False
    assert data["water_level_pct"] == 64
    assert data["app_reachable"] is True
    assert len(data["machines"]) == 2
    assert data["machines"][0]["default"] is True
    assert json.dumps(data)

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_empty_app(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock, shots=[], maintenance={})

    last_shot = _data(await _call(hass, entry, "glp_last_shot"))
    assert last_shot["message"] == "No shot has been recorded yet."

    maintenance = _data(await _call(hass, entry, "glp_maintenance_due"))
    assert maintenance["tasks"] == {}
    assert maintenance["grinders"] == {}
    assert maintenance["due"] == []
    assert maintenance["due_soon"] == []
    assert maintenance["never_done"] == []

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_missing_optional_fields(hass, strict_aioclient_mock) -> None:
    """An app without a machine registry and without scores must not break a tool."""
    entry = await _setup(
        hass,
        strict_aioclient_mock,
        status={"shotCount": 1, "machineReachable": True},
        shots=[{"id": 7, "timestamp": int(datetime.now(UTC).timestamp())}],
        maintenance={"grinder_5": {"grinderName": "Handmill", "status": "ok"}},
    )

    last_shot = _data(await _call(hass, entry, "glp_last_shot"))
    assert last_shot["machine"] is None
    assert last_shot["score"] is None
    assert last_shot["grind_setting"] is None
    assert last_shot["time"] is not None
    assert json.dumps(last_shot)

    maintenance = _data(await _call(hass, entry, "glp_maintenance_due"))
    assert maintenance["tasks"] == {}
    assert maintenance["grinders"]["Handmill"]["progress_pct"] is None
    assert json.dumps(maintenance)

    status = _data(await _call(hass, entry, "glp_machine_status"))
    assert status["machines"] == []
    assert status["last_sync"] is None
    assert status["ready_by"] is None
    assert json.dumps(status)

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_stale_data_reports_unreachable(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)
    entry.runtime_data.data.last_update_success = False

    for tool_name in TOOL_NAMES:
        assert _data(await _call(hass, entry, tool_name))["app_reachable"] is False

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_tools_are_read_only(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)
    instance = await _instance(hass, entry)

    # ToolAnnotations only exists from 2026.10; the minimum HA has no annotations.
    if hasattr(llm, "ToolAnnotations"):
        for tool in instance.tools:
            assert tool.annotations == llm.ToolAnnotations(
                read_only=True, destructive=False, idempotent=True, open_world=False
            )

    # Stop the pollers, including an already scheduled tick, so the snapshots
    # below cannot be crossed by a refresh.
    for coordinator in (entry.runtime_data.data, entry.runtime_data.live, entry.runtime_data.machine):
        coordinator.update_interval = None
        coordinator._async_unsub_refresh()

    before_calls = len(strict_aioclient_mock.mock_calls)
    before_states = _snapshot_states(hass)

    with mock.patch.object(
        type(hass.services), "async_call", side_effect=AssertionError("no service call expected")
    ):
        for tool_name in TOOL_NAMES:
            await instance.async_call_tool(llm.ToolInput(tool_name=tool_name, tool_args={}))

    # The live coordinator may reconnect to its SSE stream; every other
    # request would be the tool reaching the app, which must never happen.
    new_calls = strict_aioclient_mock.mock_calls[before_calls:]
    offenders = [call for call in new_calls if not str(call[1]).endswith("/api/events")]
    assert offenders == []
    assert _snapshot_states(hass) == before_states

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_unload_and_reload(hass, strict_aioclient_mock) -> None:
    entry = await _setup(hass, strict_aioclient_mock)
    api_id = f"{DOMAIN}-{entry.entry_id}"

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert api_id not in [api.id for api in llm.async_get_apis(hass)]

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert api_id in [api.id for api in llm.async_get_apis(hass)]

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_two_entries_coexist(hass, strict_aioclient_mock) -> None:
    first = await _setup(hass, strict_aioclient_mock, url=URL, title="Stable")
    second = await _setup(hass, strict_aioclient_mock, url=URL2, title="DEV")

    first_id = f"{DOMAIN}-{first.entry_id}"
    second_id = f"{DOMAIN}-{second.entry_id}"
    assert first_id in [api.id for api in llm.async_get_apis(hass)]
    assert second_id in [api.id for api in llm.async_get_apis(hass)]

    await hass.config_entries.async_unload(first.entry_id)
    await hass.async_block_till_done()
    assert first_id not in [api.id for api in llm.async_get_apis(hass)]
    assert second_id in [api.id for api in llm.async_get_apis(hass)]
    assert _data(await _call(hass, second, "glp_shots_today"))["shots_today"] == 1

    await hass.config_entries.async_unload(second.entry_id)
    await hass.async_block_till_done()


async def test_plain_dict_on_older_home_assistant(hass, strict_aioclient_mock, monkeypatch) -> None:
    entry = await _setup(hass, strict_aioclient_mock)
    monkeypatch.setattr(llm_api, "_TOOL_RESULT", None)

    tool = llm_api.GlpShotsTodayTool(entry)
    data = await tool.async_call(
        hass,
        llm.ToolInput(tool_name="glp_shots_today", tool_args={}),
        _llm_context(),
    )

    assert isinstance(data, dict)
    assert data["shots_today"] == 1

    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
