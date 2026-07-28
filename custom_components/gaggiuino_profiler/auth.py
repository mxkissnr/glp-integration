"""GLP API token acquisition, shared by all three coordinators and the
`/api/glp/*` proxy views (#67).

Previously each coordinator fetched and cached the token itself, and every
other caller (other coordinators, select.py, orders_api.py, __init__.py's
service handlers) reached into `GlpDataCoordinator._headers` directly. That
private attribute was only populated after the data coordinator's first
successful `_async_update_data()` run, making auth acquisition an implicit
timing dependency between all three coordinators. `GlpAuth` decouples that:
it is constructed once per config entry and lazily fetches+caches the token
on first use, independent of any particular coordinator's update cycle.
"""
import ipaddress
import logging
import os
from urllib.parse import urlparse

import aiohttp

from .const import ADDON_SLUG

_LOGGER = logging.getLogger(__name__)

# Suffixes for LAN hostnames that aren't IP literals and can't be checked via
# ipaddress (mDNS-style names commonly used for the GLP host on this network).
_LOCAL_HOST_SUFFIXES = (".local", ".internal", ".intern", ".lan", ".home", ".home.arpa")

# The add-on's own hostname on the internal Supervisor container network
# (#75): Supervisor exposes installed add-ons there as
# <repo-prefix>-gaggiuino-local-profiler (underscores from the slug become
# dashes), or bare "gaggiuino-local-profiler" for a `repository: local`
# install (see config_flow.py's _addon_hostname). Trusted by exact suffix
# match to this integration's own add-on only -- not a general "looks
# internal" heuristic.
_ADDON_HOSTNAME = ADDON_SLUG.replace("_", "-")
_ADDON_HOSTNAME_SUFFIX = f"-{_ADDON_HOSTNAME}"


def _is_trusted_host(url: str) -> bool:
    """Only send the privileged Supervisor token (see below) to a host that's
    clearly local/LAN — never to an arbitrary configured URL. `url` is
    admin-configured (config_flow only validates the scheme), so without this
    a misconfigured or malicious URL would otherwise get the Supervisor token
    handed to it directly. Best-effort string/IP-literal check, not a DNS
    resolution — keeps this synchronous and side-effect-free."""
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return False
    if not host:
        return False
    host = host.lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        pass  # not an IP literal — fall through to the suffix checks
    if host.endswith(_LOCAL_HOST_SUFFIXES):
        return True
    return host == _ADDON_HOSTNAME or host.endswith(_ADDON_HOSTNAME_SUFFIX)


class GlpAuth:
    """Lazily fetches and caches the GLP `X-GLP-Token` auth header.

    Constructed once per config entry and shared across all three
    coordinators and the `/api/glp/*` proxy views (see `__init__.py`), so
    the token is fetched independently of any particular coordinator's
    update cycle and only ever requested once per HA runtime (cached for
    the lifetime of this object).
    """

    def __init__(self, session: aiohttp.ClientSession, url: str) -> None:
        self._session = session
        self._url = url.rstrip("/")
        self._cached_headers: dict[str, str] = {}

    async def headers(self) -> dict[str, str]:
        """Return the cached `X-GLP-Token` header, fetching it first if
        this is the first call or the previous fetch didn't yield a token."""
        if not self._cached_headers:
            await self._fetch()
        return self._cached_headers

    async def _fetch(self) -> None:
        # Fetch the GLP API token once. Send the HA Supervisor token in the
        # Authorization header so the add-on can verify via the Supervisor
        # API, even when the request does not arrive from a private IP —
        # but only to a host we recognize as local/LAN (see
        # _is_trusted_host): self._url is admin-configured and only
        # scheme-validated by config_flow, so an untrusted host must never
        # receive this privileged token.
        try:
            token_req_headers: dict[str, str] = {}
            supervisor_token = os.environ.get("SUPERVISOR_TOKEN")
            if supervisor_token and _is_trusted_host(self._url):
                token_req_headers["Authorization"] = f"Bearer {supervisor_token}"
            async with self._session.get(
                f"{self._url}/api/token",
                headers=token_req_headers,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as tr:
                if tr.status < 400:
                    td = await tr.json()
                    if td.get("apiToken"):
                        self._cached_headers = {"X-GLP-Token": td["apiToken"]}
                else:
                    _LOGGER.warning(
                        "GLP /api/token returned %s — check add-on logs for denied IP",
                        tr.status,
                    )
        except Exception as token_err:
            _LOGGER.warning("GLP token fetch failed: %s", token_err)
