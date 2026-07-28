"""Regression tests for #65: path traversal in the /api/glp/orders and
/api/glp/shots proxy.

aiohttp/yarl decode percent-escapes and normalise `.`/`..` segments before a
wildcard-route handler ever sees `rest` (verified against aiohttp 3.14.1 /
yarl 1.23.0 in the issue write-up), so the attack strings below are exercised
via their *decoded* form — exactly what GlpOrdersSubView.get/post/delete and
GlpShotsSubView.get receive at runtime:

    ..%2Ftoken                -> "../token"
    ../backup                 -> "../backup"
    %2e%2e/backup              -> "../backup"
    ..%2f..%2fapi%2fbackup    -> "../../api/backup"

Every legitimate path from the new allowlist is also asserted to still reach
`_proxy` unchanged — the regression guard against an allowlist that's too
narrow and breaks the real Order Card / Lovelace Card traffic.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.gaggiuino_profiler.orders_api import (
    GlpOrdersSubView,
    GlpShotsSubView,
)


class _FakeUser:
    def __init__(self, is_admin: bool) -> None:
        self.is_admin = is_admin
        self.id = "fake-user-id"


def _fake_request(hass_user):
    return {"hass_user": hass_user}


# Decoded form of the four attack strings the issue verified against real
# aiohttp/yarl, plus a couple of extra shapes the validation must also catch.
TRAVERSAL_RESTS = [
    "../token",  # ..%2Ftoken
    "../backup",  # ../backup (raw, no encoding needed)
    "../backup",  # %2e%2e/backup (yarl normalises %2e%2e -> ..)
    "../../api/backup",  # ..%2f..%2fapi%2fbackup
    "/etc/passwd",  # leading slash
    "..\\..\\token",  # backslash variant
]


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", TRAVERSAL_RESTS)
async def test_orders_get_blocks_traversal(monkeypatch, rest) -> None:
    view = GlpOrdersSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    response = await view.get(_fake_request(_FakeUser(is_admin=False)), rest)

    assert response.status == 400
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", TRAVERSAL_RESTS)
async def test_shots_get_blocks_traversal(monkeypatch, rest) -> None:
    view = GlpShotsSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    response = await view.get(_fake_request(_FakeUser(is_admin=False)), rest)

    assert response.status == 400
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", ["../token", "../../api/backup"])
async def test_orders_post_blocks_traversal_even_for_admin(monkeypatch, rest) -> None:
    view = GlpOrdersSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    response = await view.post(_fake_request(_FakeUser(is_admin=True)), rest)

    assert response.status == 400
    proxy_mock.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", ["../token", "../../api/backup"])
async def test_orders_delete_blocks_traversal_even_for_admin(monkeypatch, rest) -> None:
    view = GlpOrdersSubView()
    proxy_mock = AsyncMock()
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    response = await view.delete(_fake_request(_FakeUser(is_admin=True)), rest)

    assert response.status == 400
    proxy_mock.assert_not_called()


# ── Regression guard: every real caller must still get through ─────────────
# Sourced from glp-order-card.js `_fetch()` call sites and glp-lovelace-card.js
# `_fetchOrders`/`_orderAction` — see orders_api.py's allowlist comment for
# the exact source lines.
ORDERS_GET_PATHS = ["menu", "settings", "queue-eta", "active-beans", "mine"]
ORDERS_POST_PATHS = [
    "ord_1690000000000_a1b2/accept",
    "ord_1690000000000_a1b2/complete",
    "ord_1690000000000_a1b2/decline",
]
SHOTS_GET_PATHS = ["last", "42"]


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", ORDERS_GET_PATHS)
async def test_orders_get_allows_real_paths(monkeypatch, rest) -> None:
    view = GlpOrdersSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.get(request, rest)

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "GET", f"api/orders/{rest}")


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", ORDERS_POST_PATHS)
async def test_orders_post_allows_real_paths(monkeypatch, rest) -> None:
    view = GlpOrdersSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=True))
    response = await view.post(request, rest)

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "POST", f"api/orders/{rest}")


@pytest.mark.asyncio
@pytest.mark.parametrize("rest", SHOTS_GET_PATHS)
async def test_shots_get_allows_real_paths(monkeypatch, rest) -> None:
    view = GlpShotsSubView()
    sentinel = MagicMock(status=200)
    proxy_mock = AsyncMock(return_value=sentinel)
    monkeypatch.setattr("custom_components.gaggiuino_profiler.orders_api._proxy", proxy_mock)

    request = _fake_request(_FakeUser(is_admin=False))
    response = await view.get(request, rest)

    assert response is sentinel
    proxy_mock.assert_awaited_once_with(request, "GET", f"api/shots/{rest}")
