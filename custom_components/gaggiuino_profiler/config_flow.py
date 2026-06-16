from __future__ import annotations

import aiohttp
import voluptuous as vol
from urllib.parse import urlparse

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_SCAN_INTERVAL, DEFAULT_URL, DOMAIN, SCAN_INTERVAL_SECONDS


class GlpConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> ConfigFlowResult:
        # On first entry (no form submitted yet): try auto-discovery at localhost:8099.
        # If the GLP app is running on this HA instance we can skip the URL form entirely.
        if user_input is None:
            try:
                session = async_get_clientsession(self.hass)
                async with session.get(
                    f"{DEFAULT_URL}/api/status",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as r:
                    r.raise_for_status()
                await self.async_set_unique_id(DEFAULT_URL)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="GLP (localhost:8099)",
                    data={"url": DEFAULT_URL},
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
            description_placeholders={"default_url": DEFAULT_URL},
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
