"""Regression tests for the orders proxy admin checks.

The root GET (the full order list, with other people's names and notes) and
GlpOrdersSubView.post/delete are admin-only. The customer-facing paths stay
open to any authenticated user: the `mine` list and the sub-view GETs, plus
placing an order via POST on the root.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.orders_api import (
    GlpOrdersSubView,
    GlpOrdersView,
    GlpShotsSubView,
    _forbidden_unless_admin,
)


class _FakeUser:
    def __init__(self, is_admin: bool) -> None:
        self.is_admin = is_admin
        self.id = "fake-user-id"


def _fake_request(hass_user):
    request = {"hass_user": hass_user}
    return request


def test_forbidden_unless_admin_blocks_non_admin() -> None:
    response = _forbidden_unless_admin(_fake_request(_FakeUser(is_admin=False)))
    assert response is not None
    assert response.status == 403


def test_forbidden_unless_admin_blocks_missing_user() -> None:
    response = _forbidden_unless_admin(_fake_request(None))
    assert response is not None
    assert response.status == 403


def test_forbidden_unless_admin_allows_admin() -> None:
    response = _forbidden_unless_admin(_fake_request(_FakeUser(is_admin=True)))
    assert response is None


@pytest.mark.asyncio
async def test_orders_root_get_rejected_for_non_admin(monkeypatch) -> None:
    view = GlpOrdersView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.get(request)

    assert response.status == 403
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
async def test_orders_root_get_allowed_for_admin(monkeypatch) -> None:
    view = GlpOrdersView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=True))
    response = await view.get(request)

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "GET", "api/orders")


@pytest.mark.asyncio
async def test_orders_root_post_placed_by_non_admin(monkeypatch) -> None:
    """Placing an order is the customer's action: no admin gate on POST."""
    view = GlpOrdersView()
    sentinel = MagicMock(status=201)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.post(request)

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "POST", "api/orders")


@pytest.mark.asyncio
async def test_orders_mine_allowed_for_non_admin(monkeypatch) -> None:
    """The Order Card's own order list must keep working for customers."""
    view = GlpOrdersSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.get(request, "mine")

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "GET", "api/orders/mine")


@pytest.mark.asyncio
async def test_post_rejected_for_non_admin(monkeypatch) -> None:
    view = GlpOrdersSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.post(request, "menu")

    assert response.status == 403
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
async def test_delete_rejected_for_non_admin(monkeypatch) -> None:
    view = GlpOrdersSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.delete(request, "history")

    assert response.status == 403
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
async def test_post_allowed_for_admin(monkeypatch) -> None:
    # "abc123/accept" rather than "menu": #65 restricts POST `rest` to the
    # order-action allowlist (accept/complete/decline) — "menu" POST is a
    # real add-on endpoint but never called through this HA proxy, only via
    # the add-on's own bundled UI (see orders_api.py's allowlist comment).
    view = GlpOrdersSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=True))
    response = await view.post(request, "abc123/accept")

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "POST", "api/orders/abc123/accept")


@pytest.mark.asyncio
async def test_get_allowed_for_non_admin(monkeypatch) -> None:
    """GET must stay open to any authenticated user (no admin gate)."""
    view = GlpOrdersSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.get(request, "menu")

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "GET", "api/orders/menu")


class _FakeUpstreamResponse:
    def __init__(self, status: int = 200, body: bytes = b"{}") -> None:
        self.status = status
        self._body = body

    async def read(self) -> bytes:
        return self._body

    async def __aenter__(self) -> "_FakeUpstreamResponse":
        return self

    async def __aexit__(self, *exc_info) -> bool:
        return False


class _FakeSession:
    def __init__(self) -> None:
        self.requests: list[tuple[str, str]] = []

    def request(self, method, url, **kwargs):
        self.requests.append((method, url))
        return _FakeUpstreamResponse()


@pytest.mark.asyncio
async def test_orders_root_get_appends_query_string_exactly_once(monkeypatch) -> None:
    """GET /api/glp/orders?status=pending must proxy to `.../api/orders?status=pending`.

    Regression for the double-append: passing `request.query_string` in the view
    *and* letting `_proxy()` append it produced `api/orders?status=pending?status=pending`.
    Asserting the exact upstream URL catches that at the only place it matters.
    """
    coordinator = MagicMock()
    coordinator._url = "http://glp-addon.local:8080"
    coordinator.auth.headers = AsyncMock(return_value={})

    hass = MagicMock()
    hass.data = {DOMAIN: {"entry": {"data": coordinator}}}

    session = _FakeSession()
    monkeypatch.setattr(
        "custom_components.gaggiuino_profiler.orders_api.async_get_clientsession",
        lambda _hass: session,
    )

    request = MagicMock()
    request.app = {"hass": hass}
    request.query_string = "status=pending"
    request.get.return_value = _FakeUser(is_admin=True)

    response = await GlpOrdersView().get(request)

    assert response.status == 200
    assert session.requests == [("GET", "http://glp-addon.local:8080/api/orders?status=pending")]


@pytest.mark.asyncio
async def test_shots_rejected_for_non_numeric_id(monkeypatch) -> None:
    view = GlpShotsSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    response = await view.get(_fake_request(_FakeUser(is_admin=False)), "defaults")

    assert response.status == 400
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", ["123", "last"])
async def test_shots_allowed_for_numeric_id_and_last(monkeypatch, rest) -> None:
    view = GlpShotsSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.get(request, rest)

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "GET", f"api/shots/{rest}")
