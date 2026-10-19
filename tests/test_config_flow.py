"""Tests for config_flow.py's URL/host validation logic."""

import json
from pathlib import Path

from pytest_homeassistant_custom_component.common import MockConfigEntry

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


async def test_auto_discovery_already_configured_aborts(hass, aioclient_mock) -> None:
    """An already configured auto-discovered URL aborts instead of showing the
    manual form (regression: AbortFlow was swallowed by the probe's except)."""
    url = "http://localhost:8099"
    MockConfigEntry(domain=DOMAIN, data={"url": url}, unique_id=url).add_to_hass(hass)
    aioclient_mock.get(f"{url}/api/status", json={"ok": True})

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}, data=None
    )

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"


async def test_options_flow_rejects_unreachable_new_url(hass, aioclient_mock) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": "http://glp.example.com"})
    entry.add_to_hass(hass)
    aioclient_mock.get("http://new.example.com/api/status", status=500)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == "form"

    result2 = await hass.config_entries.options.async_configure(
        result["flow_id"], {"url": "http://new.example.com", "scan_interval": 30}
    )

    assert result2["type"] == "form"
    assert result2["errors"] == {"url": "cannot_connect"}


async def test_options_flow_saves_reachable_new_url(hass, aioclient_mock) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={"url": "http://glp.example.com"})
    entry.add_to_hass(hass)
    aioclient_mock.get("http://new.example.com/api/status", json={"ok": True})

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result2 = await hass.config_entries.options.async_configure(
        result["flow_id"], {"url": "http://new.example.com", "scan_interval": 30}
    )

    assert result2["type"] == "create_entry"
    assert result2["data"]["url"] == "http://new.example.com"


def test_every_translation_has_invalid_url() -> None:
    translations = (
        Path(__file__).resolve().parents[1]
        / "custom_components"
        / "gaggiuino_profiler"
        / "translations"
    )
    files = sorted(translations.glob("*.json"))
    assert files

    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["config"]["error"]["invalid_url"], path.name
        assert "error" not in data["options"]["step"]["init"], path.name
        assert data["options"]["error"]["invalid_url"], path.name
        assert data["options"]["error"]["cannot_connect"], path.name
