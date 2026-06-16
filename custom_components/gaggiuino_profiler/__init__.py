from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_SCAN_INTERVAL, DOMAIN, SCAN_INTERVAL_SECONDS
from .coordinator import GlpDataCoordinator
from .live_coordinator import GlpLiveCoordinator
from .machine_coordinator import GlpMachineCoordinator
from .orders_api import GlpOrdersSubView, GlpOrdersView, GlpShotsSubView

PLATFORMS = ["sensor", "binary_sensor", "select"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Register proxy views once (idempotent across multiple config entries)
    if not hass.data.get(f"{DOMAIN}_views_registered"):
        hass.http.register_view(GlpOrdersView())
        hass.http.register_view(GlpOrdersSubView())
        hass.http.register_view(GlpShotsSubView())
        hass.data[f"{DOMAIN}_views_registered"] = True

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
