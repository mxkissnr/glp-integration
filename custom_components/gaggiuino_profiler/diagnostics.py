from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .coordinator import GlpDataCoordinator

# Diagnostics get pasted into public issue reports, so addresses, account
# handles and names stay out. async_redact_data matches these keys at every
# depth, which also covers the options dict and the per-machine entries
# inside the "machines" registry array. Coordinator data carries no customer
# names or order notes -- those are only served by the orders proxy and never
# reach the coordinator -- so the keys below are the whole exposure.
TO_REDACT = {
    "url",  # config entry URL and its options override
    "machine_url",  # bare machine hostname from /api/status
    "machines",  # registry: each machine's name, type and reachability
    "switch_entity",  # HA entity id of the machine's power switch
    "last_shot_coffee",  # free-text bean name from the shot annotation
    "last_shot_grinder",  # free-text grinder name
    "coffee",  # the same two names on every entry of recent_shots
    "grinder",
    # Keyed by grinder name, which redaction cannot reach: it rewrites values,
    # not dict keys.
    "grinder_maintenance_details",
    "token",
    "access_token",
    "refresh_token",
    "user_id",
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    coordinator: GlpDataCoordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    return async_redact_data(
        {
            "config_entry": {"url": entry.data.get("url"), "options": dict(entry.options)},
            "coordinator_data": {
                k: str(v) if hasattr(v, "isoformat") else v
                for k, v in (coordinator.data or {}).items()
                if k != "last_shot_id"
            },
        },
        TO_REDACT,
    )
