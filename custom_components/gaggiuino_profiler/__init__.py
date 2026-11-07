import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime

import aiohttp
import voluptuous as vol
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util

from .auth import GlpAuth
from .const import CONF_SCAN_INTERVAL, DOMAIN, SCAN_INTERVAL_SECONDS
from .coordinator import CONF_INSTALL_ID, GlpDataCoordinator
from .live_coordinator import GlpLiveCoordinator
from .machine_coordinator import GlpMachineCoordinator
from .orders_api import GlpBeansInfoView, GlpOrdersSubView, GlpOrdersView, GlpShotsSubView
from .settings_coordinator import GlpSettingsCoordinator

_LOGGER = logging.getLogger(__name__)

# light/number/switch/button (#109): write-capable control entities backed by
# the new GlpSettingsCoordinator below (light/number/switch) or the existing
# data/machine coordinators (button, select's new operation-mode/release-
# channel entries).
PLATFORMS = ["sensor", "binary_sensor", "select", "update", "light", "number", "switch", "button", "event", "image"]


@dataclass
class GlpRuntimeData:
    """Coordinators and shared ids for one config entry."""

    data: GlpDataCoordinator
    live: GlpLiveCoordinator
    machine: GlpMachineCoordinator
    settings: GlpSettingsCoordinator
    parent_device_id: str | None


GlpConfigEntry = ConfigEntry[GlpRuntimeData]


def _first_loaded_runtime_data(hass: HomeAssistant) -> GlpRuntimeData | None:
    """Runtime data of the first loaded entry, for the domain-wide services.

    Not `hass.config_entries.async_loaded_entries()`, which only exists from
    HA 2024.10 -- hacs.json still allows 2024.7.
    """
    for candidate in hass.config_entries.async_entries(DOMAIN):
        if candidate.state is not ConfigEntryState.LOADED:
            continue
        runtime_data = getattr(candidate, "runtime_data", None)
        if isinstance(runtime_data, GlpRuntimeData):
            return runtime_data
    return None


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
    """#48/#317/#234: appends ?machineId=<id> when the service call specifies one.
    maintenance_done honours it -- the app's /api/maintenance/*/done route
    reads machineId and falls back to the default machine when it is absent.
    backup and set_ready_by forward it too, but the app currently ignores it
    on /api/backup and /api/preheat/ready-by and acts on the default machine there."""
    machine = call.data.get("machine")
    return f"?machineId={machine}" if machine else ""


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Register the HTTP proxy views and the bundled Lovelace cards, once.

    #193: with two config entries (the stable app plus the DEV / Go-Preview
    one) HA runs their `async_setup_entry` concurrently. The old code checked a
    `hass.data` flag and only set it *after* several `await`s, so both entries
    could pass the check, and the second `async_register_static_paths` for the
    shared `/{DOMAIN}/www` path hit aiohttp's "already registered" RuntimeError
    -- failing that whole entry's setup and taking its cards/entities down
    until a retry or restart. Now the flag is claimed synchronously before any
    `await` (so the second caller returns immediately), and the static-path
    registration is wrapped defensively for a stale route surviving a
    full-integration reload within one HA session.
    """
    if hass.data.get(f"{DOMAIN}_frontend_registered"):
        return
    hass.data[f"{DOMAIN}_frontend_registered"] = True

    hass.http.register_view(GlpOrdersView())
    hass.http.register_view(GlpOrdersSubView())
    hass.http.register_view(GlpShotsSubView())
    hass.http.register_view(GlpBeansInfoView())

    # #90: the cards ship inside this repo per HACS policy -- hard dependency on
    # our services (set_ready_by/maintenance_done) and entity naming.
    integration = await async_get_integration(hass, DOMAIN)
    www_path = os.path.join(os.path.dirname(__file__), "www")
    try:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(f"/{DOMAIN}/www", www_path, cache_headers=False)]
        )
    except RuntimeError:
        # Path already registered (e.g. a stale route from a full-integration
        # reload within the same HA session). The existing route still serves
        # the same files -- nothing to do.
        _LOGGER.debug("GLP www static path already registered")
    add_extra_js_url(hass, f"/{DOMAIN}/www/glp-card.js?v={integration.version}")
    add_extra_js_url(hass, f"/{DOMAIN}/www/glp-order-card.js?v={integration.version}")


async def async_setup_entry(hass: HomeAssistant, entry: GlpConfigEntry) -> bool:
    await _async_register_frontend(hass)

    # Register the maintenance_done service once (idempotent)
    if not hass.services.has_service(DOMAIN, "maintenance_done"):
        async def _handle_maintenance_done(call: ServiceCall) -> None:
            task = call.data["task"]
            if not _MAINTENANCE_TASK_RE.fullmatch(task):
                raise ServiceValidationError(
                    translation_domain=DOMAIN,
                    translation_key="invalid_maintenance_task",
                    translation_placeholders={"task": task},
                )
            runtime_data = _first_loaded_runtime_data(hass)
            coord: GlpDataCoordinator | None = runtime_data.data if runtime_data else None
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
            runtime_data = _first_loaded_runtime_data(hass)
            coord: GlpDataCoordinator | None = runtime_data.data if runtime_data else None
            if coord is None:
                _LOGGER.error("backup: no GLP coordinator available")
                return
            backup_dir  = hass.config.path("glp_backups")
            filename    = f"glp-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
            backup_path = os.path.join(backup_dir, filename)
            tmp_path    = f"{backup_path}.tmp"

            def _prepare_backup_file() -> None:
                os.makedirs(backup_dir, exist_ok=True)
                with open(tmp_path, "wb"):
                    pass

            def _write_backup_chunk(chunk: bytes) -> None:
                with open(tmp_path, "ab") as f:
                    f.write(chunk)

            def _drop_backup_tmp() -> None:
                try:
                    os.remove(tmp_path)
                except FileNotFoundError:
                    pass

            def _count_backup_shots() -> int:
                with open(backup_path, encoding="utf-8") as f:
                    return len(json.load(f).get("shots", []))

            try:
                async with coord._session.get(
                    f"{coord._url}/api/backup{_machine_query_suffix(call)}",
                    headers=await coord.auth.headers(),
                    # Streaming: no overall body deadline, only socket-level
                    # timeouts, so a large backup on a slow Pi cannot time out.
                    timeout=aiohttp.ClientTimeout(total=None, sock_connect=10, sock_read=60),
                ) as r:
                    r.raise_for_status()
                    await hass.async_add_executor_job(_prepare_backup_file)
                    try:
                        async for chunk in r.content.iter_chunked(64 * 1024):
                            await hass.async_add_executor_job(_write_backup_chunk, chunk)
                        await hass.async_add_executor_job(os.replace, tmp_path, backup_path)
                    except Exception:
                        await hass.async_add_executor_job(_drop_backup_tmp)
                        raise
            except Exception as err:
                _LOGGER.error("backup failed: %s", err)
                raise

            shots = await hass.async_add_executor_job(_count_backup_shots)

            hass.bus.async_fire(
                f"{DOMAIN}_backup_created",
                {
                    "path":  backup_path,
                    "shots": shots,
                },
            )

        hass.services.async_register(DOMAIN, "backup", _handle_backup, schema=BACKUP_SCHEMA)

    # Register the set_ready_by service once (idempotent)
    if not hass.services.has_service(DOMAIN, "set_ready_by"):
        async def _handle_set_ready_by(call: ServiceCall) -> None:
            runtime_data = _first_loaded_runtime_data(hass)
            coord: GlpDataCoordinator | None = runtime_data.data if runtime_data else None
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
                        reason = (
                            (body or {}).get("error") or (body or {}).get("message")
                            if isinstance(body, dict) else None
                        )
                        if reason:
                            raise HomeAssistantError(
                                translation_domain=DOMAIN,
                                translation_key="ready_by_rejected",
                                translation_placeholders={"reason": str(reason)},
                            )
                        raise HomeAssistantError(
                            translation_domain=DOMAIN,
                            translation_key="ready_by_rejected_no_reason",
                        )
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
    # #363: lets a later discovery recognise this app under another address.
    # Written before the update listener below is added, so it causes no reload.
    install_id = coordinator.data.get("install_id")
    if install_id and entry.data.get(CONF_INSTALL_ID) != install_id:
        hass.config_entries.async_update_entry(
            entry, data={**entry.data, CONF_INSTALL_ID: install_id}
        )
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

    # #322: the additional-machine entities register their devices as children of
    # the default-machine device, which therefore has to exist before the
    # platforms add any entity. Same values as GlpEntity's DeviceInfo, so this
    # call and the entities' own registration agree on one device.
    main_device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        name="Gaggiuino Local Profiler",
        manufacturer="Gaggiuino",
        model="Local Profiler",
    )

    entry.runtime_data = GlpRuntimeData(
        data=coordinator,
        live=live_coordinator,
        machine=machine_coordinator,
        settings=settings_coordinator,
        parent_device_id=main_device.id,
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    # #191: keep the default-machine device's "Visit" link pointed at the
    # machine's own web UI and its firmware version shown, sourced from the
    # data coordinator. Done centrally here (not per-entity DeviceInfo) because
    # both values are dynamic and shared across entities from three coordinators
    # -- racing them through DeviceInfo gives a non-deterministic result.
    # The same listener also drops the devices of machines the app has deleted
    # (part of #341), so the first run doubles as cleanup after a downtime.
    _async_update_devices(hass, entry, coordinator)
    entry.async_on_unload(
        coordinator.async_add_listener(
            lambda: _async_update_devices(hass, entry, coordinator)
        )
    )
    return True


@callback
def _async_update_devices(
    hass: HomeAssistant, entry: ConfigEntry, coordinator: GlpDataCoordinator
) -> None:
    _async_sync_device_metadata(hass, entry, coordinator)
    _async_remove_stale_machine_devices(hass, entry, coordinator)


def _additional_machine_id(entry: ConfigEntry, device: dr.DeviceEntry) -> int | None:
    """The machine id of an additional-machine device, else None.

    Only those devices carry an identifier `<entry_id>_<int>` (#48); the GLP
    device is `<entry_id>` and the group devices are `<entry_id>_group_<name>`.
    """
    prefix = f"{entry.entry_id}_"
    for domain, identifier in device.identifiers:
        if domain != DOMAIN or not identifier.startswith(prefix):
            continue
        rest = identifier.removeprefix(prefix)
        # isdigit() also accepts superscripts ("\u00b2") that int() rejects.
        if rest.isascii() and rest.isdigit():
            return int(rest)
    return None


def _listed_machine_ids(data: dict | None) -> set[int] | None:
    """Ids of the machines the app currently lists, or None if the list is
    not complete.

    `GET /api/status` returns `machines` from the app's registry and includes
    the default machine when the read succeeds; on a registry read error the
    app sends no list at all. A list without the default machine therefore
    cannot be trusted to be complete, and an id missing from it must not be
    treated as deleted.
    """
    machines = [m for m in (data or {}).get("machines") or [] if isinstance(m, dict)]
    if not any(m.get("isDefault") for m in machines):
        return None
    return {m["id"] for m in machines if m.get("id") is not None}


@callback
def _async_remove_stale_machine_devices(
    hass: HomeAssistant, entry: ConfigEntry, coordinator: GlpDataCoordinator
) -> None:
    """Remove the devices of machines that the app no longer lists (part of #341).

    The platforms only ever add additional-machine entities, so a machine
    deleted in the app would otherwise keep a device with two permanently
    unavailable entities.
    """
    listed = _listed_machine_ids(coordinator.data)
    if listed is None:
        return

    registry = dr.async_get(hass)
    devices = {
        device.id: device
        for device in dr.async_entries_for_config_entry(registry, entry.entry_id)
    }
    async_child_entries = getattr(dr, "async_child_entries_for_config_entry", None)
    if async_child_entries is not None:  # HA Core >= 2026.9
        for device in async_child_entries(registry, entry.entry_id):
            devices[device.id] = device

    for device in list(devices.values()):
        machine_id = _additional_machine_id(entry, device)
        if machine_id is None or machine_id in listed:
            continue
        _LOGGER.info(
            "Removing the device of machine %s, which the GLP app no longer lists",
            machine_id,
        )
        registry.async_remove_device(device.id)


async def async_remove_config_entry_device(
    hass: HomeAssistant, config_entry: GlpConfigEntry, device_entry: dr.DeviceEntry
) -> bool:
    """Whether a device can be deleted by hand (#341).

    Home Assistant calls this for the Delete button on a device page; on
    2026.9+ `device_entry` may be a child device entry, so only its
    identifiers are used. The GLP device and its Shots/Maintenance/Preheat
    devices are not deletable by hand, and neither is an additional machine
    the app still lists -- it would come straight back on the next update.
    """
    machine_id = _additional_machine_id(config_entry, device_entry)
    if machine_id is None:
        return False

    runtime_data = getattr(config_entry, "runtime_data", None)
    data = runtime_data.data.data if isinstance(runtime_data, GlpRuntimeData) else None
    machines = [m for m in (data or {}).get("machines") or [] if isinstance(m, dict)]
    return not any(m.get("id") == machine_id for m in machines)


def _async_sync_device_metadata(
    hass: HomeAssistant, entry: ConfigEntry, coordinator: GlpDataCoordinator
) -> None:
    data = coordinator.data or {}
    machine_host = data.get("machine_url")  # bare hostname, e.g. "gaggia.intern"
    firmware = data.get("firmware_installed")
    if not machine_host and not firmware:
        return

    registry = dr.async_get(hass)
    device = registry.async_get_device_by_identifier((DOMAIN, entry.entry_id), entry.entry_id)
    if device is None:
        return

    changes: dict = {}
    if machine_host:
        want_url = f"http://{machine_host}"
        if device.configuration_url != want_url:
            changes["configuration_url"] = want_url
    if firmware and device.sw_version != firmware:
        changes["sw_version"] = firmware
    if changes:
        registry.async_update_device(device.id, **changes)


async def _async_options_updated(hass: HomeAssistant, entry: GlpConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: GlpConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
