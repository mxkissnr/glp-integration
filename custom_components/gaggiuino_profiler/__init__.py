import json
import logging
import os
import re
from datetime import datetime

import aiohttp
import voluptuous as vol
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from .auth import GlpAuth
from .const import CONF_SCAN_INTERVAL, DOMAIN, SCAN_INTERVAL_SECONDS
from .coordinator import GlpDataCoordinator
from .live_coordinator import GlpLiveCoordinator
from .machine_coordinator import GlpMachineCoordinator
from .orders_api import GlpBeansInfoView, GlpOrdersSubView, GlpOrdersView, GlpShotsSubView
from .settings_coordinator import GlpSettingsCoordinator

_LOGGER = logging.getLogger(__name__)

# light/number/switch/button (#109): write-capable control entities backed by
# the new GlpSettingsCoordinator below (light/number/switch) or the existing
# data/machine coordinators (button, select's new operation-mode/release-
# channel entries).
PLATFORMS = ["sensor", "binary_sensor", "select", "update", "light", "number", "switch", "button"]

MAINTENANCE_DONE_SCHEMA = vol.Schema({
    vol.Required("task"): vol.All(str, vol.Length(min=1)),
    vol.Optional("machine"): vol.Coerce(int),
})
# Allowlist for the `task` service field, which is interpolated straight into
# the /api/maintenance/{task}/done URL path below. Mirrors the fix for #65
# (path traversal in orders_api.py's _SAFE_ID) -- services.yaml documents
# exactly these 6 shapes (the fixed task names plus grinder_<id> for
# per-grinder cleaning entries), but its `selector: text:` leaves the field
# free-text in the UI, so nothing upstream of this check constrains it.
_MAINTENANCE_TASK_RE = re.compile(
    r"^(?:descaling|backflush|grouphead|gaskets|waterfilter|grinder_[A-Za-z0-9_-]+)$"
)
BACKUP_SCHEMA = vol.Schema({vol.Optional("machine"): vol.Coerce(int)})
SET_READY_BY_SCHEMA = vol.Schema({
    vol.Optional("target_time"): vol.Any(None, cv.datetime),
    vol.Optional("machine"): vol.Coerce(int),
})


def _machine_query_suffix(call: ServiceCall) -> str:
    """#48/#317: appends ?machine=<id> when the service call specifies one.
    The app doesn't read this parameter on /api/maintenance/*/done or
    /api/backup as of app v2.0.0 -- accepted here so the service call is
    already forward-compatible once that lands, and harmless today (an
    unrecognized query param on these routes is simply ignored)."""
    machine = call.data.get("machine")
    return f"?machine={machine}" if machine else ""


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Register proxy views once (idempotent across multiple config entries)
    if not hass.data.get(f"{DOMAIN}_views_registered"):
        hass.http.register_view(GlpOrdersView())
        hass.http.register_view(GlpOrdersSubView())
        hass.http.register_view(GlpShotsSubView())
        hass.http.register_view(GlpBeansInfoView())
        hass.data[f"{DOMAIN}_views_registered"] = True

    # Register the bundled GLP Shot Card and its Lovelace resource once
    # (idempotent across multiple config entries). #90: the card ships inside
    # this repo per HACS policy since it has a hard dependency on our services
    # (set_ready_by/maintenance_done) and entity naming.
    if not hass.data.get(f"{DOMAIN}_frontend_registered"):
        integration = await async_get_integration(hass, DOMAIN)
        www_path = os.path.join(os.path.dirname(__file__), "www")
        await hass.http.async_register_static_paths(
            [StaticPathConfig(f"/{DOMAIN}/www", www_path, cache_headers=False)]
        )
        add_extra_js_url(hass, f"/{DOMAIN}/www/glp-card.js?v={integration.version}")
        hass.data[f"{DOMAIN}_frontend_registered"] = True

    # Register the maintenance_done service once (idempotent)
    if not hass.services.has_service(DOMAIN, "maintenance_done"):
        async def _handle_maintenance_done(call: ServiceCall) -> None:
            task = call.data["task"]
            if not _MAINTENANCE_TASK_RE.fullmatch(task):
                raise ServiceValidationError(f"Invalid maintenance task: {task!r}")
            coord: GlpDataCoordinator | None = next(
                (d["data"] for d in hass.data.get(DOMAIN, {}).values()
                 if isinstance(d, dict) and "data" in d),
                None,
            )
            if coord is None:
                _LOGGER.error("maintenance_done: no GLP coordinator available")
                return
            try:
                async with coord._session.post(
                    f"{coord._url}/api/maintenance/{task}/done{_machine_query_suffix(call)}",
                    headers=await coord.auth.headers(),
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as r:
                    r.raise_for_status()
            except Exception as err:
                _LOGGER.error("maintenance_done(%s) failed: %s", task, err)
                raise
            await coord.async_request_refresh()

        hass.services.async_register(
            DOMAIN, "maintenance_done", _handle_maintenance_done, schema=MAINTENANCE_DONE_SCHEMA
        )

    # Register the backup service once (idempotent)
    if not hass.services.has_service(DOMAIN, "backup"):
        async def _handle_backup(call: ServiceCall) -> None:
            coord: GlpDataCoordinator | None = next(
                (d["data"] for d in hass.data.get(DOMAIN, {}).values()
                 if isinstance(d, dict) and "data" in d),
                None,
            )
            if coord is None:
                _LOGGER.error("backup: no GLP coordinator available")
                return
            try:
                async with coord._session.get(
                    f"{coord._url}/api/backup{_machine_query_suffix(call)}",
                    headers=await coord.auth.headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as r:
                    r.raise_for_status()
                    backup_data = await r.json()
            except Exception as err:
                _LOGGER.error("backup failed: %s", err)
                raise

            backup_dir  = hass.config.path("glp_backups")
            filename    = f"glp-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            backup_path = os.path.join(backup_dir, filename)

            def _write_backup() -> None:
                os.makedirs(backup_dir, exist_ok=True)
                with open(backup_path, "w", encoding="utf-8") as f:
                    json.dump(backup_data, f)

            await hass.async_add_executor_job(_write_backup)

            hass.bus.async_fire(
                f"{DOMAIN}_backup_created",
                {
                    "path":  backup_path,
                    "shots": len(backup_data.get("shots", [])),
                },
            )

        hass.services.async_register(DOMAIN, "backup", _handle_backup, schema=BACKUP_SCHEMA)

    # Register the set_ready_by service once (idempotent)
    if not hass.services.has_service(DOMAIN, "set_ready_by"):
        async def _handle_set_ready_by(call: ServiceCall) -> None:
            coord: GlpDataCoordinator | None = next(
                (d["data"] for d in hass.data.get(DOMAIN, {}).values()
                 if isinstance(d, dict) and "data" in d),
                None,
            )
            if coord is None:
                _LOGGER.error("set_ready_by: no GLP coordinator available")
                return
            target_time = call.data.get("target_time")
            target_at = int(dt_util.as_utc(target_time).timestamp() * 1000) if target_time else None
            try:
                async with coord._session.post(
                    f"{coord._url}/api/preheat/ready-by{_machine_query_suffix(call)}",
                    json={"targetAt": target_at},
                    headers=await coord.auth.headers(),
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as r:
                    if r.status == 400:
                        try:
                            body = await r.json(content_type=None)
                        except Exception:
                            body = None
                        message = (
                            (body or {}).get("error") or (body or {}).get("message")
                            if isinstance(body, dict) else None
                        ) or "the app rejected the request (is the preheat switch configured?)"
                        raise HomeAssistantError(f"set_ready_by failed: {message}")
                    r.raise_for_status()
            except HomeAssistantError:
                raise
            except Exception as err:
                _LOGGER.error("set_ready_by failed: %s", err)
                raise
            await coord.async_request_refresh()

        hass.services.async_register(
            DOMAIN, "set_ready_by", _handle_set_ready_by, schema=SET_READY_BY_SCHEMA
        )

    session       = async_get_clientsession(hass)
    url           = entry.options.get("url") or entry.data["url"]
    scan_interval = entry.options.get(CONF_SCAN_INTERVAL, SCAN_INTERVAL_SECONDS)

    auth             = GlpAuth(session, url)
    coordinator      = GlpDataCoordinator(hass, session, url, scan_interval, auth)
    await coordinator.async_config_entry_first_refresh()
    live_coordinator = GlpLiveCoordinator(hass, session, url, auth)
    await live_coordinator.async_config_entry_first_refresh()
    # #708/#736: SSE push (GET /api/events) is the primary path for live data,
    # the coordinator's own poll cycle is just the fallback -- see
    # live_coordinator.py. Tied to the config entry's own background-task
    # tracking so it's automatically cancelled on unload, same as any other
    # entry teardown; no explicit cleanup needed in async_unload_entry below.
    entry.async_create_background_task(
        hass, live_coordinator.async_sse_loop(), name=f"{DOMAIN}_live_sse_{entry.entry_id}"
    )
    machine_coordinator = GlpMachineCoordinator(hass, session, url, auth)
    # Machine coordinator is best-effort — don't fail setup if machine is unreachable
    try:
        await machine_coordinator.async_config_entry_first_refresh()
    except Exception:
        pass

    settings_coordinator = GlpSettingsCoordinator(hass, session, url, auth)
    # Settings coordinator is best-effort too (#109) — a machine without the
    # settings proxy (non-Gaggiuino, or unreachable) must not block setup;
    # its entities just come up unavailable, same convention as `machine`.
    try:
        await settings_coordinator.async_config_entry_first_refresh()
    except Exception:
        pass

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "data":     coordinator,
        "live":     live_coordinator,
        "machine":  machine_coordinator,
        "settings": settings_coordinator,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return ok
