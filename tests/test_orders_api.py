"""Regression tests for the orders proxy admin-check added in a prior
security round: GlpOrdersSubView.post/delete must reject non-admin callers,
GlpOrdersSubView.get must stay open to any authenticated user."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from custom_components.gaggiuino_profiler.orders_api import (
    GlpOrdersSubView,
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
