"""Tests for config_flow.py's URL/host validation logic."""

from custom_components.gaggiuino_profiler.const import DOMAIN


async def test_invalid_scheme_rejected(hass, aioclient_mock) -> None:
    """A URL without an http(s) scheme is rejected before any network call."""
    aioclient_mock.get("http://localhost:8099/api/status", status=500)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}, data=None
    )
    assert result["type"] == "form"

    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": "ftp://example.com"}
    )
    assert result2["type"] == "form"
    assert result2["errors"] == {"url": "invalid_url"}


async def test_missing_scheme_rejected(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://localhost:8099/api/status", status=500)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}, data=None
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": "not-a-url"}
    )
    assert result2["type"] == "form"
    assert result2["errors"] == {"url": "invalid_url"}


async def test_valid_url_but_unreachable_reports_cannot_connect(
    hass, aioclient_mock
) -> None:
    """A well-formed URL that doesn't respond is a cannot_connect error, not
    silently accepted."""
    aioclient_mock.get("http://localhost:8099/api/status", status=500)
    aioclient_mock.get("http://glp.example.com/api/status", status=500)

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}, data=None
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": "http://glp.example.com"}
    )
    assert result2["type"] == "form"
    assert result2["errors"] == {"url": "cannot_connect"}


async def test_valid_reachable_url_creates_entry(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://localhost:8099/api/status", status=500)
    aioclient_mock.get("http://glp.example.com/api/status", json={"ok": True})

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}, data=None
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": "http://glp.example.com"}
    )
    assert result2["type"] == "create_entry"
    assert result2["data"]["url"] == "http://glp.example.com"


async def test_trailing_slash_is_stripped(hass, aioclient_mock) -> None:
    aioclient_mock.get("http://localhost:8099/api/status", status=500)
    aioclient_mock.get("http://glp.example.com/api/status", json={"ok": True})

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}, data=None
    )
    result2 = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"url": "http://glp.example.com/"}
    )
    assert result2["type"] == "create_entry"
    assert result2["data"]["url"] == "http://glp.example.com"
