"""GLP REST API proxy — exposes /api/glp/orders/*, /api/glp/shots/* and
/api/glp/library/beans-info so the GLP cards can reach the add-on without
going through HA ingress."""
import aiohttp
from aiohttp.web import Request, Response

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

_TIMEOUT = aiohttp.ClientTimeout(total=10)


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
    """Proxy for /api/glp/orders/{rest} → add-on /api/orders/{rest}."""
    url = "/api/glp/orders/{rest:.+}"
    name = "api:glp:orders:sub"
    requires_auth = True

    async def get(self, request: Request, rest: str) -> Response:
        return await _proxy(request, "GET", f"api/orders/{rest}")

    async def post(self, request: Request, rest: str) -> Response:
        return await _proxy(request, "POST", f"api/orders/{rest}")

    async def delete(self, request: Request, rest: str) -> Response:
        return await _proxy(request, "DELETE", f"api/orders/{rest}")


class GlpShotsSubView(HomeAssistantView):
    """Proxy for /api/glp/shots/{rest} → add-on /api/shots/{rest}."""
    url = "/api/glp/shots/{rest:.+}"
    name = "api:glp:shots:sub"
    requires_auth = True

    async def get(self, request: Request, rest: str) -> Response:
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
