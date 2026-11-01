from __future__ import annotations

import os
from urllib.parse import urlparse

import aiohttp
import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigEntryState,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .const import ADDON_SLUG, CONF_SCAN_INTERVAL, DEFAULT_URL, DOMAIN, SCAN_INTERVAL_SECONDS

_SUPERVISOR_URL = "http://supervisor"


def _matches_addon_slug(slug: str) -> bool:
    """Supervisor prefixes the installed slug with a repository identifier
    (`local_`, `core_`, or the 8-char sha1 of the repo URL for a custom
    repository like ours), so the bare config.yaml slug never appears
    verbatim except for the unlikely `repository: local` case."""
    return slug == ADDON_SLUG or slug.endswith(f"_{ADDON_SLUG}")


async def _resolve_addon_slug(
    session: aiohttp.ClientSession, headers: dict[str, str], timeout: aiohttp.ClientTimeout
) -> str | None:
    """Find the real Supervisor-visible slug for the GLP add-on by listing
    all installed add-ons and matching on slug suffix (see #78)."""
    async with session.get(
        f"{_SUPERVISOR_URL}/addons", headers=headers, timeout=timeout
    ) as r:
        if r.status >= 400:
            return None
        addons = (await r.json()).get("data", {}).get("addons", [])
    return next(
        (a["slug"] for a in addons if _matches_addon_slug(a.get("slug", ""))),
        None,
    )


async def _supervisor_port(session: aiohttp.ClientSession) -> int | None:
    """Ask the HA Supervisor which host port the GLP app is mapped to.

    Returns the host port integer, or None if Supervisor is unavailable
    (non-supervised install), the app is not installed, or the port can't
    be determined.
    """
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    timeout = aiohttp.ClientTimeout(total=5)
    try:
        slug = await _resolve_addon_slug(session, headers, timeout)
        if slug is None:
            return None
        async with session.get(
            f"{_SUPERVISOR_URL}/addons/{slug}/info",
            headers=headers,
            timeout=timeout,
        ) as r:
            if r.status >= 400:
                return None
            data = (await r.json()).get("data", {})
            network = data.get("network") or {}
            # network = {"8099/tcp": <host_port_int_or_null>, ...}
            return next(
                (v for v in network.values() if isinstance(v, int)),
                None,
            )
    except Exception:
        return None


def _container_port(info: dict) -> int | None:
    """Parse the container-side port out of the add-on info's `network`
    dict (keys look like `"8099/tcp"`), rather than hardcoding 8099."""
    network = info.get("network") or {}
    for key in network:
        port_str = key.split("/", 1)[0]
        if port_str.isdigit():
            return int(port_str)
    return None


def _addon_hostname(slug: str, info: dict) -> str:
    """The add-on's hostname on the internal Supervisor container network
    (#75). Prefers the `hostname` field the per-add-on detail endpoint may
    expose directly; falls back to the documented Supervisor convention of
    replacing underscores in the slug with dashes (empirically confirmed
    for well-known core add-ons, e.g. `core_mosquitto` -> `core-mosquitto`,
    the MQTT integration's own default host). Either form is only ever used
    after being probed for reachability by `_auto_discover_internal_url`
    below, never assumed blindly."""
    return info.get("hostname") or slug.replace("_", "-")


async def _auto_discover_internal_url(session: aiohttp.ClientSession) -> str | None:
    """Try to reach the add-on over the internal container network instead
    of the host port mapping (#75), so the host port can become optional.

    Returns the internal URL only after successfully probing it with
    GET /api/status -- never assumed, always verified live. Returns None on
    any failure (Supervisor unavailable, add-on not found, internal
    networking unsupported on this install type, wrong hostname guess...)
    so callers fall back to the existing host-port path unchanged.
    """
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    timeout = aiohttp.ClientTimeout(total=5)
    try:
        slug = await _resolve_addon_slug(session, headers, timeout)
        if slug is None:
            return None
        async with session.get(
            f"{_SUPERVISOR_URL}/addons/{slug}/info", headers=headers, timeout=timeout
        ) as r:
            if r.status >= 400:
                return None
            info = (await r.json()).get("data", {})
    except Exception:
        return None

    port = _container_port(info)
    if port is None:
        return None
    candidate = f"http://{_addon_hostname(slug, info)}:{port}"

    try:
        async with session.get(
            f"{candidate}/api/status", timeout=aiohttp.ClientTimeout(total=5)
        ) as r:
            if r.status >= 400:
                return None
    except Exception:
        return None

    return candidate


async def _auto_discover_url(session: aiohttp.ClientSession) -> str:
    """Return the GLP URL to try first.

    Prefers the add-on's internal container-network address if reachable
    (#75 -- makes the host port mapping optional), then falls back to the
    Supervisor host-port mapping (#78), then DEFAULT_URL for non-supervised
    installs. Existing config entries already storing a `localhost:<port>`
    URL are untouched by this -- this function only runs during initial
    setup (`async_step_user`), never against a stored entry.
    """
    internal_url = await _auto_discover_internal_url(session)
    if internal_url:
        return internal_url
    port = await _supervisor_port(session)
    return f"http://localhost:{port}" if port else DEFAULT_URL


async def _probe_status(
    session: aiohttp.ClientSession, url: str, timeout_s: int
) -> bool:
    """GET <url>/api/status; True only on a non-error response."""
    try:
        async with session.get(
            f"{url}/api/status", timeout=aiohttp.ClientTimeout(total=timeout_s)
        ) as r:
            r.raise_for_status()
    except Exception:
        return False
    return True


def _parse_discovery_info(
    config: dict | None,
) -> tuple[str, int] | None:
    """Read `{"host": str, "port": int}` out of the app's discovery payload.

    Anything else -- a missing or empty host, a port that is not a plain int
    (JSON strings, floats, booleans) or out of the 1-65535 range -- returns
    None, so the flow aborts with `invalid_discovery_info` instead of
    building a URL out of a malformed announcement.
    """
    host = (config or {}).get("host")
    port = (config or {}).get("port")
    if not isinstance(host, str) or not host.strip():
        return None
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        return None
    return host.strip(), port


def _entry_url(entry: ConfigEntry) -> str:
    """The URL an entry actually connects to (options override data, see
    async_setup_entry)."""
    return entry.options.get("url") or entry.data.get("url", "")


def _url_host(url: str) -> str | None:
    hostname = urlparse(url).hostname
    return hostname.lower() if hostname else None


class GlpConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        # On first entry (no form submitted yet): auto-discover the URL from
        # the Supervisor port mapping and silently probe the app. If reachable,
        # create the entry without any user input.
        if user_input is None:
            session = async_get_clientsession(self.hass)
            auto_url = await _auto_discover_url(session)
            if await _probe_status(session, auto_url, 5):
                await self.async_set_unique_id(auto_url)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"GLP ({auto_url.removeprefix('http://')})",
                    data={"url": auto_url},
                )
            # Probe failed: fall through to manual form.

        errors: dict[str, str] = {}
        if user_input is not None:
            url = user_input["url"].rstrip("/")
            if urlparse(url).scheme not in ("http", "https"):
                errors["url"] = "invalid_url"
            else:
                try:
                    session = async_get_clientsession(self.hass)
                    async with session.get(
                        f"{url}/api/status",
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as r:
                        r.raise_for_status()
                except Exception:
                    errors["url"] = "cannot_connect"
                else:
                    await self.async_set_unique_id(url)
                    self._abort_if_unique_id_configured()
                    return self.async_create_entry(
                        title=url.removeprefix("http://").removeprefix("https://"),
                        data={"url": url},
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("url", default=DEFAULT_URL): str}),
            errors=errors,
        )

    async def async_step_hassio(
        self, discovery_info: HassioServiceInfo
    ) -> ConfigFlowResult:
        """Handle discovery announced by the GLP app (Supervisor installs only).

        The app publishes `{"host": "<app hostname>", "port": <int>}` for the
        service `gaggiuino_profiler`; the URL is built from that payload and
        probed before it is offered, never trusted blindly. A malformed
        announcement aborts with `invalid_discovery_info`.

        Standalone Docker installs never see this step -- they keep the manual
        `async_step_user` flow unchanged.
        """
        parsed = _parse_discovery_info(discovery_info.config)
        if parsed is None:
            return self.async_abort(reason="invalid_discovery_info")
        host, port = parsed
        url = f"http://{host}:{port}"

        if not await _probe_status(async_get_clientsession(self.hass), url, 5):
            return self.async_abort(reason="cannot_connect")

        # An entry for this app already exists: a new port (the app restarted
        # with a different host-port mapping) updates it in place instead of
        # adding a second integration for the same machine.
        for entry in self._async_current_entries(include_ignore=False):
            if _url_host(_entry_url(entry)) != host.lower():
                continue
            if _entry_url(entry) != url:
                # The unique_id is the URL for both this flow and the manual
                # one, so it moves with the port -- otherwise a later manual
                # setup of the new URL would not see this entry and add a second.
                updates: dict = {"data": {**entry.data, "url": url}}
                if (
                    self.hass.config_entries.async_entry_for_domain_unique_id(DOMAIN, url)
                    is None
                ):
                    updates["unique_id"] = url
                if "url" in entry.options:
                    updates["options"] = {**entry.options, "url": url}
                self.hass.config_entries.async_update_entry(entry, **updates)
                # A loaded entry reloads through its own update listener; one
                # stuck in setup retry has no listener yet, so reload it here.
                if entry.state in (ConfigEntryState.SETUP_RETRY, ConfigEntryState.SETUP_ERROR):
                    self.hass.config_entries.async_schedule_reload(entry.entry_id)
            return self.async_abort(reason="already_configured")

        await self.async_set_unique_id(url)
        self._abort_if_unique_id_configured()

        # Kept in the flow context (not an attribute) so a discovery flow that
        # Home Assistant restores after a restart can still finish the confirm.
        self.context["glp_discovered_url"] = url
        self.context["title_placeholders"] = {"name": f"GLP ({host}:{port})"}
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        """Confirm the discovered address before creating the entry."""
        url = self.context["glp_discovered_url"]
        if user_input is not None:
            return self.async_create_entry(
                title=f"GLP ({url.removeprefix('http://')})",
                data={"url": url},
            )
        return self.async_show_form(step_id="hassio_confirm")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return GlpOptionsFlow(config_entry)


class GlpOptionsFlow(OptionsFlow):
    def __init__(self, entry: ConfigEntry) -> None:
        self._entry = entry

    async def async_step_init(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        current_interval = self._entry.options.get(CONF_SCAN_INTERVAL, SCAN_INTERVAL_SECONDS)
        current_url = self._entry.options.get("url") or self._entry.data.get("url", DEFAULT_URL)

        if user_input is not None:
            url = user_input["url"].rstrip("/")
            if urlparse(url).scheme not in ("http", "https"):
                errors["url"] = "invalid_url"
            elif url == current_url:
                return self.async_create_entry(data=user_input)
            else:
                session = async_get_clientsession(self.hass)
                if await _probe_status(session, url, 10):
                    return self.async_create_entry(data=user_input)
                errors["url"] = "cannot_connect"

        return self.async_show_form(
            step_id="init",
            errors=errors,
            data_schema=vol.Schema({
                vol.Required("url", default=current_url): str,
                vol.Required(CONF_SCAN_INTERVAL, default=current_interval): vol.All(
                    int, vol.Range(min=10, max=300)
                ),
            }),
        )
