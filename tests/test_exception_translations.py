"""#341: the errors the integration raises carry translation keys.

Home Assistant's `exception-translations` quality-scale rule wants every
`HomeAssistantError` / `ServiceValidationError` raised with a
`translation_domain`, a `translation_key` that exists under `exceptions` in
`translations/<lang>.json`, and no positional message, so the frontend shows
the text in the user's language.

`str(err)` is built lazily from the cached English translations, so it only
yields the filled-in text once an entry of the integration is set up. The
tests below therefore assert on `translation_key` / `translation_placeholders`
and only compare the rendered text where the entry is set up.
"""
import ast
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from unittest import mock

import aiohttp
import pytest
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.auth import GlpAuth
from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.settings_coordinator import GlpSettingsCoordinator
from tests.common import mock_all_coordinator_endpoints

COMPONENT_DIR = Path(__file__).resolve().parent.parent / "custom_components" / "gaggiuino_profiler"
URL = "http://glp.example.com"
READY_BY_TARGET_AT_MS = 1806566400000  # 2027-03-01T00:00:00Z (epoch-ms)

EXCEPTION_CLASSES = {"HomeAssistantError", "ServiceValidationError"}
PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")


def _english_exceptions() -> dict:
    return json.loads((COMPONENT_DIR / "translations" / "en.json").read_text())["exceptions"]


def _raise_calls():
    for path in sorted(COMPONENT_DIR.glob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id in EXCEPTION_CLASSES
            ):
                yield path, node


def test_every_raise_uses_a_translation_key() -> None:
    exceptions = _english_exceptions()
    used: set[str] = set()

    for path, call in _raise_calls():
        where = (path.name, call.lineno)
        # A positional message would win over the translation in the frontend.
        assert not call.args, where
        keywords = {kw.arg: kw.value for kw in call.keywords if kw.arg}
        domain = keywords.get("translation_domain")
        assert isinstance(domain, ast.Name) and domain.id == "DOMAIN", where
        key_node = keywords.get("translation_key")
        assert isinstance(key_node, ast.Constant) and isinstance(key_node.value, str), where
        key = key_node.value
        assert key in exceptions, (path.name, key)
        used.add(key)

        placeholders = keywords.get("translation_placeholders")
        if isinstance(placeholders, ast.Dict):
            names = {
                placeholder.value
                for placeholder in placeholders.keys
                if isinstance(placeholder, ast.Constant)
            }
            assert names == set(PLACEHOLDER_RE.findall(exceptions[key]["message"])), (path.name, key)

    # No dead texts in en.json and no key the code invents.
    assert used == set(exceptions)


async def _setup_entry(hass, aioclient_mock):
    mock_all_coordinator_endpoints(aioclient_mock, URL)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": URL})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_invalid_maintenance_task_raises_a_translated_validation_error(
    hass, strict_aioclient_mock
) -> None:
    await _setup_entry(hass, strict_aioclient_mock)

    with pytest.raises(ServiceValidationError) as exc_info:
        await hass.services.async_call(
            DOMAIN, "maintenance_done", {"task": "../evil"}, blocking=True
        )

    err = exc_info.value
    assert err.translation_key == "invalid_maintenance_task"
    assert err.translation_placeholders == {"task": "../evil"}


async def test_rejected_ready_by_time_carries_the_reason(hass, strict_aioclient_mock) -> None:
    await _setup_entry(hass, strict_aioclient_mock)
    strict_aioclient_mock.post(
        f"{URL}/api/preheat/ready-by",
        status=400,
        json={"error": "switch_entity not configured"},
    )

    target_time = datetime.fromtimestamp(READY_BY_TARGET_AT_MS / 1000, tz=UTC)
    with pytest.raises(HomeAssistantError) as exc_info:
        await hass.services.async_call(
            DOMAIN, "set_ready_by", {"target_time": target_time}, blocking=True
        )

    err = exc_info.value
    assert err.translation_key == "ready_by_rejected"
    assert err.translation_placeholders == {"reason": "switch_entity not configured"}
    # The entry is set up, so the English text is available and filled in.
    assert str(err) == "The GLP app rejected the ready-by time: switch_entity not configured"


async def test_rejected_ready_by_time_without_a_reason_uses_the_generic_text(
    hass, strict_aioclient_mock
) -> None:
    await _setup_entry(hass, strict_aioclient_mock)
    strict_aioclient_mock.post(f"{URL}/api/preheat/ready-by", status=400, json={})

    target_time = datetime.fromtimestamp(READY_BY_TARGET_AT_MS / 1000, tz=UTC)
    with pytest.raises(HomeAssistantError) as exc_info:
        await hass.services.async_call(
            DOMAIN, "set_ready_by", {"target_time": target_time}, blocking=True
        )

    assert exc_info.value.translation_key == "ready_by_rejected_no_reason"


def _make_coordinator(hass) -> GlpSettingsCoordinator:
    session = async_get_clientsession(hass)
    return GlpSettingsCoordinator(hass, session, URL, GlpAuth(session, URL))


async def test_unavailable_settings_category_raises_a_translated_error(hass, aioclient_mock) -> None:
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "tok-123"})
    aioclient_mock.get(f"{URL}/api/machine/settings?category=boiler", status=502)

    with pytest.raises(HomeAssistantError) as exc_info:
        await _make_coordinator(hass).async_fetch_category("boiler")

    err = exc_info.value
    assert err.translation_key == "settings_unavailable"
    assert err.translation_placeholders == {"category": "boiler"}


async def test_unreachable_settings_category_raises_a_translated_error(hass, aioclient_mock) -> None:
    coordinator = _make_coordinator(hass)

    with mock.patch.object(
        coordinator.auth, "headers", mock.AsyncMock(side_effect=aiohttp.ClientError("boom"))
    ):
        with pytest.raises(HomeAssistantError) as exc_info:
            await coordinator.async_fetch_category("boiler")

    err = exc_info.value
    assert err.translation_key == "settings_unreachable"
    assert err.translation_placeholders == {"category": "boiler", "error": "boom"}
