import json
import logging
import os
from datetime import datetime

import aiohttp
import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_SCAN_INTERVAL, DOMAIN, SCAN_INTERVAL_SECONDS
from .coordinator import GlpDataCoordinator
from .live_coordinator import GlpLiveCoordinator
from .machine_coordinator import GlpMachineCoordinator
from .orders_api import GlpBeansInfoView, GlpOrdersSubView, GlpOrdersView, GlpShotsSubView

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "binary_sensor", "select", "update"]

MAINTENANCE_DONE_SCHEMA = vol.Schema({vol.Required("task"): vol.All(str, vol.Length(min=1))})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Register proxy views once (idempotent across multiple config entries)
    if not hass.data.get(f"{DOMAIN}_views_registered"):
        hass.http.register_view(GlpOrdersView())
        hass.http.register_view(GlpOrdersSubView())
        hass.http.register_view(GlpShotsSubView())
        hass.http.register_view(GlpBeansInfoView())
        hass.data[f"{DOMAIN}_views_registered"] = True

    # Register the maintenance_done service once (idempotent)
    if not hass.services.has_service(DOMAIN, "maintenance_done"):
        async def _handle_maintenance_done(call: ServiceCall) -> None:
            task = call.data["task"]
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
                    f"{coord._url}/api/maintenance/{task}/done",
                    headers=coord._headers,
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
                    f"{coord._url}/api/backup",
                    headers=coord._headers,
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

        hass.services.async_register(DOMAIN, "backup", _handle_backup)

    session       = async_get_clientsession(hass)
    url           = entry.options.get("url") or entry.data["url"]
    scan_interval = entry.options.get(CONF_SCAN_INTERVAL, SCAN_INTERVAL_SECONDS)

    coordinator      = GlpDataCoordinator(hass, session, url, scan_interval)
    await coordinator.async_config_entry_first_refresh()
    live_coordinator = GlpLiveCoordinator(hass, session, url, coordinator)
    await live_coordinator.async_config_entry_first_refresh()
    machine_coordinator = GlpMachineCoordinator(hass, session, url, coordinator)
    # Machine coordinator is best-effort — don't fail setup if machine is unreachable
    try:
        await machine_coordinator.async_config_entry_first_refresh()
    except Exception:
        pass

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "data":    coordinator,
        "live":    live_coordinator,
        "machine": machine_coordinator,
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
