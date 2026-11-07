"""Read-only LLM tools for Home Assistant's Assist (#343).

Assist cannot use the GLP app's own MCP server: the `mcp` client integration
only takes a URL plus OAuth, it cannot send the static `X-GLP-Token` header
the app's MCP endpoint requires. So the integration registers its own LLM API
with `homeassistant.helpers.llm` instead. The tools never call the app: they
read the data the three coordinators already hold, they take no arguments and
they cannot change anything.

One API per config entry, following HA core's own `mcp` integration: two GLP
apps (stable and DEV) show up as two separate entries in the conversation
agent's "Control Home Assistant" selection, so the user picks which app the
agent may read.

Compatibility across the supported Home Assistant versions (2026.8 minimum,
2026.10 in the test pin):

* `llm.ToolResult` and `llm.ToolAnnotations` only exist from 2026.10. On
  2026.8/2026.9 `APIInstance.async_call_tool` returns whatever the tool
  returns, so the tools must return a plain dict there. `_result()` picks the
  right shape at import time.
* The tools take no arguments, so they keep the base class `parameters`
  default (`vol.Schema({})` on 2026.8/2026.9, `probatio.Schema({})` on
  2026.10+) and never import either library.
* `Tool.integration` is new in 2026.10; setting it keeps `APIInstance` from
  logging a deprecation on every tool for this custom integration.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import llm
from homeassistant.util import dt as dt_util

from .const import DOMAIN

if TYPE_CHECKING:
    from . import GlpRuntimeData

# 2026.10+ only; on 2026.8/2026.9 a tool has to return the plain dict.
_TOOL_RESULT = getattr(llm, "ToolResult", None)

# 2026.10+ only. The tools only read coordinator data: no writes, no world
# access, so an agent can safely call them without confirmation.
_READ_ONLY = (
    llm.ToolAnnotations(read_only=True, destructive=False, idempotent=True, open_world=False)
    if hasattr(llm, "ToolAnnotations")
    else None
)

MAINTENANCE_TASKS = ("descaling", "backflush", "grouphead", "gaskets", "waterfilter")


def _result(data: dict) -> Any:
    """Wrap tool data in `ToolResult` where the helper has it, else pass it through."""
    return _TOOL_RESULT(data=data) if _TOOL_RESULT is not None else data


def _iso(value: Any) -> str | None:
    """Aware datetime as a local ISO string -- tool data must be JSON-serialisable."""
    return dt_util.as_local(value).isoformat() if value is not None else None


def _pct(value: Any) -> int | None:
    return round(value * 100) if isinstance(value, (int, float)) else None


def _default_machine_name(data: dict) -> str | None:
    for machine in data.get("machines") or []:
        if machine.get("isDefault"):
            return machine.get("name")
    return None


class GlpTool(llm.Tool):
    """Base class for a tool that only reads one config entry's coordinator data."""

    integration = DOMAIN

    def __init__(self, entry: ConfigEntry) -> None:
        self._entry = entry
        if _READ_ONLY is not None:
            self.annotations = _READ_ONLY

    async def async_call(self, hass: HomeAssistant, tool_input: llm.ToolInput, llm_context: llm.LLMContext) -> Any:
        runtime = self._entry.runtime_data
        return _result({**self._build(runtime), "app_reachable": runtime.data.last_update_success})

    def _build(self, runtime: GlpRuntimeData) -> dict:
        raise NotImplementedError


class GlpLastShotTool(GlpTool):
    """The most recent espresso shot."""

    name = "glp_last_shot"
    description = (
        "Details of the last espresso shot the GLP app recorded: when it was pulled, the profile, "
        "duration, yield, dose, ratio, average pressure, score and the manual star rating. "
        "Use it when the user asks how the last shot was or what they brewed."
    )

    def _build(self, runtime: GlpRuntimeData) -> dict:
        data = runtime.data.data
        shot_id = data.get("last_shot_id")
        if shot_id is None:
            return {"message": "No shot has been recorded yet.", "machine": _default_machine_name(data)}

        recent = data.get("recent_shots") or []
        newest = recent[0] if recent else None
        if newest is None or newest.get("id") != shot_id:
            newest = {}

        return {
            "machine": _default_machine_name(data),
            "shot_id": shot_id,
            "time": _iso(data.get("last_shot_date")),
            "profile": data.get("last_shot_profile"),
            "duration_s": data.get("last_shot_duration"),
            "yield_g": data.get("last_shot_weight"),
            "dose_g": data.get("last_shot_dose"),
            "ratio": data.get("last_shot_ratio"),
            "avg_pressure_bar": data.get("last_shot_pressure"),
            "rating": data.get("last_shot_rating"),
            "coffee": data.get("last_shot_coffee"),
            "grinder": data.get("last_shot_grinder"),
            "score": newest.get("score"),
            "drink_type": newest.get("drink_type"),
            "grind_setting": newest.get("grind"),
        }


class GlpShotsTodayTool(GlpTool):
    """The shot count for today."""

    name = "glp_shots_today"
    description = (
        "How many shots were pulled today and how many in total, plus the time of the last shot. "
        "Use it when the user asks about today's shot count or their coffee consumption."
    )

    def _build(self, runtime: GlpRuntimeData) -> dict:
        data = runtime.data.data
        return {
            "machine": _default_machine_name(data),
            "shots_today": data.get("shots_today"),
            "shot_count_total": data.get("shot_count"),
            "last_shot_time": _iso(data.get("last_shot_date")),
        }


class GlpMaintenanceTool(GlpTool):
    """Maintenance status of the machine and the grinders."""

    name = "glp_maintenance_due"
    description = (
        "Maintenance status: which tasks are due, soon due or never done. Covers descaling, "
        "backflush, group head, gaskets and water filter, plus the cleaning tasks of the grinders. "
        "The status values are 'due' (threshold reached), 'soon' (at least 80 percent of the "
        "threshold) and 'never' (never marked done). Use it when the user asks about cleaning or "
        "maintenance."
    )

    def _build(self, runtime: GlpRuntimeData) -> dict:
        data = runtime.data.data

        tasks: dict[str, dict] = {}
        grinders: dict[str, dict] = {}
        for task in MAINTENANCE_TASKS:
            raw = data.get(f"maint_{task}") or {}
            if not raw:
                continue
            tasks[task] = {
                "status": raw.get("status"),
                "days_since": raw.get("daysSince"),
                "shots_since": raw.get("shotsSince"),
                "last_date": raw.get("lastDate"),
                "progress_pct": _pct(raw.get("pct")),
                "threshold_shots": raw.get("threshold_shots"),
                "threshold_days": raw.get("threshold_days"),
            }

        for name, detail in (data.get("grinder_maintenance_details") or {}).items():
            grinders[name] = {
                "status": detail.get("status"),
                "days_since": detail.get("days_since"),
                "shots_since": detail.get("shots_since"),
                "last_date": detail.get("last_date"),
                "progress_pct": _pct(detail.get("pct")),
            }

        statuses = {name: detail.get("status") for name, detail in {**tasks, **grinders}.items()}
        return {
            "machine": _default_machine_name(data),
            "tasks": tasks,
            "grinders": grinders,
            "due": sorted(name for name, status in statuses.items() if status == "due"),
            "due_soon": sorted(name for name, status in statuses.items() if status == "soon"),
            "never_done": sorted(name for name, status in statuses.items() if status == "never"),
        }


class GlpMachineStatusTool(GlpTool):
    """Reachability, preheat state and live values of the machine."""

    name = "glp_machine_status"
    description = (
        "Whether the espresso machine is reachable, heated up, brewing, how warm it is and which "
        "profile is active, plus the water level and the list of configured machines. Use it when "
        "the user asks if the machine is ready or what it is doing right now."
    )

    def _build(self, runtime: GlpRuntimeData) -> dict:
        data = runtime.data.data
        live = runtime.live.data or {}
        machine = runtime.machine.data or {}
        return {
            "machine": _default_machine_name(data),
            "status": data.get("machine_status"),
            "reachable": data.get("machine_reachable"),
            "standby": data.get("machine_standby"),
            "preheat_ready": data.get("preheat_ready"),
            "preheat_remaining_s": data.get("preheat_remaining"),
            "temperature_c": data.get("machine_temperature"),
            "target_temperature_c": data.get("machine_target_temperature"),
            "ready_by": _iso(data.get("preheat_ready_by_target_at")),
            "active_profile": data.get("current_profile"),
            "brewing": bool(live.get("isLive")),
            "water_level_pct": machine.get("waterLevel"),
            "last_sync": _iso(data.get("last_sync")),
            "firmware": data.get("firmware_installed"),
            "machines": [
                {
                    "id": m.get("id"),
                    "name": m.get("name"),
                    "type": m.get("type"),
                    "default": m.get("isDefault"),
                    "enabled": m.get("enabled"),
                    "reachable": m.get("reachable"),
                    "on": m.get("on"),
                }
                for m in data.get("machines") or []
            ],
        }


@dataclass(kw_only=True)
class GlpLlmApi(llm.API):
    """The GLP tools of one config entry."""

    entry: ConfigEntry

    async def async_get_api_instance(self, llm_context: llm.LLMContext) -> llm.APIInstance:
        return llm.APIInstance(
            api=self,
            api_prompt=(
                "These tools read the shot, maintenance and machine data of the GLP app "
                f"'{self.entry.title}'. They cannot change anything. Times are local. Shot and "
                "maintenance data describe the default machine."
            ),
            llm_context=llm_context,
            tools=[
                GlpLastShotTool(self.entry),
                GlpShotsTodayTool(self.entry),
                GlpMaintenanceTool(self.entry),
                GlpMachineStatusTool(self.entry),
            ],
        )


@callback
def async_register_llm_api(hass: HomeAssistant, entry: ConfigEntry) -> Callable[[], None]:
    """Register this entry's LLM API; the returned callback unregisters it."""
    api = GlpLlmApi(
        hass=hass,
        id=f"{DOMAIN}-{entry.entry_id}",
        name=f"Gaggiuino Local Profiler ({entry.title})",
        entry=entry,
    )
    return llm.async_register_api(hass, api)
