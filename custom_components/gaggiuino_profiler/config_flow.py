from __future__ import annotations

import os
from urllib.parse import urlparse

import aiohttp
import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_SCAN_INTERVAL, DEFAULT_URL, DOMAIN, SCAN_INTERVAL_SECONDS

_SUPERVISOR_URL = "http://supervisor"
_ADDON_SLUG     = "gaggiuino_local_profiler"


def _matches_addon_slug(slug: str) -> bool:
    """Supervisor prefixes the installed slug with a repository identifier
    (`local_`, `core_`, or the 8-char sha1 of the repo URL for a custom
    repository like ours), so the bare config.yaml slug never appears
    verbatim except for the unlikely `repository: local` case."""
    return slug == _ADDON_SLUG or slug.endswith(f"_{_ADDON_SLUG}")


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
            # The detail endpoint also exposes `hostname`/`dns` directly,
            # which would let a future #75 reach the add-on over the
            # internal container network without hardcoding "localhost".
            # The `/addons` list endpoint used above does NOT carry those
            # fields, only this per-addon detail endpoint does.
            network = data.get("network") or {}
            # network = {"8099/tcp": <host_port_int_or_null>, ...}
            return next(
                (v for v in network.values() if isinstance(v, int)),
                None,
            )
    except Exception:
        return None


async def _auto_discover_url(session: aiohttp.ClientSession) -> str:
    """Return the GLP URL derived from the Supervisor port mapping.

    Falls back to DEFAULT_URL when Supervisor is not available or the
    port cannot be read (e.g. non-HA-OS installs).
    """
    port = await _supervisor_port(session)
    return f"http://localhost:{port}" if port else DEFAULT_URL


class GlpConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        # On first entry (no form submitted yet): auto-discover the URL from
        # the Supervisor port mapping and silently probe the app. If reachable,
        # create the entry without any user input.
        if user_input is None:
            session     = async_get_clientsession(self.hass)
            auto_url    = await _auto_discover_url(session)
            try:
                async with session.get(
                    f"{auto_url}/api/status",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    r.raise_for_status()
                await self.async_set_unique_id(auto_url)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"GLP ({auto_url.removeprefix('http://')})",
                    data={"url": auto_url},
                )
            except Exception:
                pass  # fall through to manual form

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
        if user_input is not None:
            if urlparse(user_input["url"].rstrip("/")).scheme not in ("http", "https"):
                errors["url"] = "invalid_url"
            else:
                return self.async_create_entry(data=user_input)

        current_interval = self._entry.options.get(CONF_SCAN_INTERVAL, SCAN_INTERVAL_SECONDS)
        current_url      = self._entry.options.get("url") or self._entry.data.get("url", DEFAULT_URL)

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
