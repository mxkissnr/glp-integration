"""GLP REST API proxy — exposes /api/glp/orders/*, /api/glp/shots/* and
/api/glp/library/beans-info so the GLP cards can reach the add-on without
going through HA ingress."""
import logging
import re

import aiohttp
from aiohttp.web import Request, Response
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

_TIMEOUT = aiohttp.ClientTimeout(total=10)
_LOGGER = logging.getLogger(__name__)

# A single path segment — order ids (`ord_<ts>_<rand>`) and shot ids (numeric
# row ids) both fit this shape. No '.', '/', or '\\' can appear here, which is
# what closes the traversal hole (#65): aiohttp decodes `rest` before it
# reaches us, so a check against the decoded string is sufficient — there is
# no second encoding layer left to normalise away.
_SAFE_ID = r"[A-Za-z0-9_-]+"

# Allowlists below are drawn from the *actual* callers of the HA proxy —
# glp-order-card.js's `_fetch()` and glp-lovelace-card.js's `_fetchOrders`/
# `_orderAction` (both zero-config `/api/glp/*` paths) — not from the add-on's
# full REST surface. The add-on exposes more (milk-stock, notify-mapping,
# stats, order/menu DELETE, ...) but those are only ever called by the
# add-on's own bundled UI via a direct fetch, never through this integration,
# so they are intentionally left out. See PR description for the source line
# of each entry.
_ORDERS_GET_ALLOW = frozenset({"menu", "settings", "queue-eta", "active-beans", "mine"})
_ORDERS_POST_ALLOW_RE = re.compile(rf"^{_SAFE_ID}/(?:accept|complete|decline)$")
# No verified HA-proxy caller uses DELETE today (menu/history management only
# happens in the add-on's own UI) — left empty on purpose rather than guessed.
_ORDERS_DELETE_ALLOW: frozenset[str] = frozenset()
_SHOTS_GET_ALLOW_RE = re.compile(rf"^{_SAFE_ID}$")


def _forbidden_unless_admin(request: Request) -> Response | None:
    """Return a 403 Response if the caller is not an HA admin, else None."""
    hass_user = request.get("hass_user")
    if hass_user is None or not hass_user.is_admin:
        return Response(status=403, text="admin required")
    return None


def _rejected(view_name: str, method: str) -> Response:
    """Log a warning without the attacker-controlled path and return 400."""
    _LOGGER.warning("Rejected %s %s request: disallowed sub-path", method, view_name)
    return Response(status=400)


def _coordinator(hass: HomeAssistant):
    for entry_data in hass.data.get(DOMAIN, {}).values():
        if isinstance(entry_data, dict):
            c = entry_data.get("data")
            if c is not None:
                return c
    return None


async def _proxy(request: Request, method: str, addon_path: str) -> Response:
    hass: HomeAssistant = request.app["hass"]
    c = _coordinator(hass)
    if c is None:
        return Response(status=503, text="GLP integration not configured")

    url = f"{c._url}/{addon_path}"
    if request.query_string:
        url += f"?{request.query_string}"

    headers = dict(c._headers)
    hass_user = request.get("hass_user")
    if hass_user:
        headers["X-GLP-HA-User-ID"] = str(hass_user.id)
    data = None
    if method in ("POST", "PUT"):
        data = await request.read()
        headers["Content-Type"] = request.headers.get("Content-Type", "application/json")

    session = async_get_clientsession(hass)
    try:
        async with session.request(method, url, headers=headers, data=data, timeout=_TIMEOUT) as r:
            body = await r.read()
            return Response(status=r.status, body=body, content_type="application/json")
    except Exception:
        return Response(status=503, text="GLP add-on unreachable")


class GlpOrdersView(HomeAssistantView):
    """Proxy for /api/glp/orders → app /api/orders (GET list, POST place)."""
    url = "/api/glp/orders"
    name = "api:glp:orders:root"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        qs = request.query_string
        return await _proxy(request, "GET", "api/orders" + (f"?{qs}" if qs else ""))

    async def post(self, request: Request) -> Response:
        return await _proxy(request, "POST", "api/orders")


class GlpOrdersSubView(HomeAssistantView):
    """Proxy for /api/glp/orders/{rest} → add-on /api/orders/{rest}.

    GET stays open to any authenticated user (menu/settings/queue-eta/
    active-beans/mine info needed by the customer-facing Order Card).
    POST covers the barista's accept/complete/decline actions from the
    Lovelace card and requires HA admin. `rest` is checked against a fixed
    allowlist on every method (#65) — see the module-level comment above
    _ORDERS_GET_ALLOW for how it was derived. DELETE has no allowlisted
    path today since no HA-proxy caller uses it (see _ORDERS_DELETE_ALLOW).
    """
    url = "/api/glp/orders/{rest:.+}"
    name = "api:glp:orders:sub"
    requires_auth = True

    async def get(self, request: Request, rest: str) -> Response:
        if rest not in _ORDERS_GET_ALLOW:
            return _rejected(self.name, "GET")
        return await _proxy(request, "GET", f"api/orders/{rest}")

    async def post(self, request: Request, rest: str) -> Response:
        forbidden = _forbidden_unless_admin(request)
        if forbidden:
            return forbidden
        if not _ORDERS_POST_ALLOW_RE.fullmatch(rest):
            return _rejected(self.name, "POST")
        return await _proxy(request, "POST", f"api/orders/{rest}")

    async def delete(self, request: Request, rest: str) -> Response:
        forbidden = _forbidden_unless_admin(request)
        if forbidden:
            return forbidden
        if rest not in _ORDERS_DELETE_ALLOW:
            return _rejected(self.name, "DELETE")
        return await _proxy(request, "DELETE", f"api/orders/{rest}")


class GlpShotsSubView(HomeAssistantView):
    """Proxy for /api/glp/shots/{rest} → add-on /api/shots/{rest}."""
    url = "/api/glp/shots/{rest:.+}"
    name = "api:glp:shots:sub"
    requires_auth = True

    async def get(self, request: Request, rest: str) -> Response:
        if not _SHOTS_GET_ALLOW_RE.fullmatch(rest):
            return _rejected(self.name, "GET")
        return await _proxy(request, "GET", f"api/shots/{rest}")


class GlpBeansInfoView(HomeAssistantView):
    """Read-only proxy for /api/glp/library/beans-info → add-on bean metadata.

    Deliberately a fixed path (no {rest} wildcard) so the library API surface
    exposed through HA stays limited to this one GET.
    """
    url = "/api/glp/library/beans-info"
    name = "api:glp:library:beans-info"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        return await _proxy(request, "GET", "api/library/beans-info")
