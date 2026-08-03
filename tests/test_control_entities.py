"""Tests for #109: write-capable control entities (light/number/switch/
button + operation-mode/release-channel select) added on top of the new
GlpSettingsCoordinator (GET /api/machine/settings?category=<c>, 30 s) and
the machine_coordinator's extended GET /api/machine/live merge
(sysState.operationMode/coreVersion/timeAlive).

Follows the same full-hass + aioclient_mock pattern as
test_ready_by_service.py: set up a real config entry, mock every endpoint
the four coordinators poll, then assert entity state and (for writes) the
exact POST url/body recorded on aioclient_mock.mock_calls.
"""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN

LED_SETTINGS = {"state": True, "color": {"R": 10, "G": 20, "B": 30}, "disco": False, "tof": {"min": 5, "max": 50}}
BOILER_SETTINGS = {
    "steamSetPoint": 145, "offsetTemp": 1.5, "hpwr": 800,
    "mainDivider": 2, "brewDivider": 2, "startupHeatDelta": 5,
    "brewDeltaState": True, "dreamSteamState": False,
}
DISPLAY_SETTINGS = {
    "lcdBrightness": 80, "lcdSleep": 300, "lcdGoHome": 10,
    "lcdDarkMode": False, "lcdCloseOnBrewOff": True, "simpleUI": False,
}
SCALES_SETTINGS = {"forcePredictive": True, "hwScalesEnabled": True, "btScalesEnabled": False}
SYSTEM_SETTINGS = {"releaseChannel": 1}


def _mock_all_coordinator_endpoints(aioclient_mock, url: str) -> None:
    aioclient_mock.get(f"{url}/api/status", json={})
    aioclient_mock.get(f"{url}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{url}/shots.json", json=[])
    aioclient_mock.get(f"{url}/api/maintenance", json={})
    aioclient_mock.get(f"{url}/api/preheat", json={})
    aioclient_mock.get(f"{url}/api/machine/profiles", json={})
    aioclient_mock.get(f"{url}/api/menu", json=[])
    aioclient_mock.get(f"{url}/api/version", json={})
    aioclient_mock.get(f"{url}/api/live/data", json={})
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": True, "profileName": "Adaptive"})
    aioclient_mock.get(
        f"{url}/api/machine/live",
        json={"sensorSnap": None, "sysState": {"operationMode": 4, "coreVersion": "1.2.3", "timeAlive": 1000}},
    )
    aioclient_mock.get(f"{url}/api/machine/settings?category=boiler", json=BOILER_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=display", json=DISPLAY_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=led", json=LED_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=scales", json=SCALES_SETTINGS)
    aioclient_mock.get(f"{url}/api/machine/settings?category=system", json=SYSTEM_SETTINGS)


async def _setup_entry(hass, aioclient_mock):
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, url


def _post_calls(aioclient_mock):
    return [c for c in aioclient_mock.mock_calls if c[0].lower() == "post"]


# ── light.py ────────────────────────────────────────────────────────────


async def test_led_light_reads_state_and_color(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    state = hass.states.get("light.gaggiuino_local_profiler_led")
    assert state is not None
    assert state.state == "on"
    assert state.attributes["rgb_color"] == (10, 20, 30)
    assert state.attributes["effect"] == "None"


async def test_led_light_turn_on_posts_full_category_payload(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/settings/led", json={"success": True})

    await hass.services.async_call(
        "light", "turn_on",
        {"entity_id": "light.gaggiuino_local_profiler_led", "rgb_color": [255, 0, 128]},
        blocking=True,
    )
    await hass.async_block_till_done()

    calls = _post_calls(aioclient_mock)
    assert len(calls) == 1
    _, called_url, body, _ = calls[0]
    assert str(called_url).endswith("/api/machine/settings/led")
    assert body["state"] is True
    assert body["color"] == {"R": 255, "G": 0, "B": 128}
    assert body["disco"] is False  # unrelated existing field preserved


async def test_led_light_turn_off_preserves_color(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/settings/led", json={"success": True})

    await hass.services.async_call(
        "light", "turn_off", {"entity_id": "light.gaggiuino_local_profiler_led"}, blocking=True
    )
    await hass.async_block_till_done()

    _, _, body, _ = _post_calls(aioclient_mock)[0]
    assert body["state"] is False
    assert body["color"] == {"R": 10, "G": 20, "B": 30}


# ── number.py ───────────────────────────────────────────────────────────


async def test_number_reads_flat_and_nested_values(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    steam = hass.states.get("number.gaggiuino_local_profiler_steam_set_point")
    assert steam is not None and steam.state == "145"
    tof_min = hass.states.get("number.gaggiuino_local_profiler_led_tof_min")
    assert tof_min is not None and tof_min.state == "5"


async def test_number_set_value_merges_into_flat_boiler_field(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/settings/boiler", json={"success": True})

    await hass.services.async_call(
        "number", "set_value",
        {"entity_id": "number.gaggiuino_local_profiler_steam_set_point", "value": 150},
        blocking=True,
    )
    await hass.async_block_till_done()

    _, called_url, body, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/settings/boiler")
    assert body["steamSetPoint"] == 150
    assert body["mainDivider"] == 2  # sibling field preserved


async def test_number_set_value_merges_into_nested_led_field(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/settings/led", json={"success": True})

    await hass.services.async_call(
        "number", "set_value",
        {"entity_id": "number.gaggiuino_local_profiler_led_tof_min", "value": 15},
        blocking=True,
    )
    await hass.async_block_till_done()

    _, called_url, body, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/settings/led")
    assert body["tof"] == {"min": 15, "max": 50}
    assert body["state"] is True  # sibling top-level field preserved


# ── switch.py ───────────────────────────────────────────────────────────


async def test_switch_reads_state(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    assert hass.states.get("switch.gaggiuino_local_profiler_brew_delta_state").state == "on"
    assert hass.states.get("switch.gaggiuino_local_profiler_dream_steam_state").state == "off"


async def test_switch_turn_on_merges_into_category_payload(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/settings/scales", json={"success": True})

    await hass.services.async_call(
        "switch", "turn_on",
        {"entity_id": "switch.gaggiuino_local_profiler_bt_scales_enabled"},
        blocking=True,
    )
    await hass.async_block_till_done()

    _, called_url, body, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/settings/scales")
    assert body["btScalesEnabled"] is True
    assert body["hwScalesEnabled"] is True  # sibling field preserved


# ── button.py ───────────────────────────────────────────────────────────


async def test_tare_button_posts_to_tare_endpoint(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/tare", json={"ok": True})

    await hass.services.async_call(
        "button", "press", {"entity_id": "button.gaggiuino_local_profiler_tare_scale"}, blocking=True
    )
    await hass.async_block_till_done()

    _, called_url, _, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/tare")


async def test_save_settings_button_posts_to_settings_save(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/settings/save", json={"ok": True})

    await hass.services.async_call(
        "button", "press", {"entity_id": "button.gaggiuino_local_profiler_save_settings"}, blocking=True
    )
    await hass.async_block_till_done()

    _, called_url, _, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/settings/save")


async def test_save_active_profile_button_posts_to_profile_save(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/profile/save", json={"ok": True})

    await hass.services.async_call(
        "button", "press", {"entity_id": "button.gaggiuino_local_profiler_save_active_profile"}, blocking=True
    )
    await hass.async_block_till_done()

    _, called_url, _, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/profile/save")


# ── select.py: GlpOperationModeSelect / GlpReleaseChannelSelect ──────────


async def test_operation_mode_select_options_exclude_brew_manual(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    state = hass.states.get("select.gaggiuino_local_profiler_operation_mode")
    assert state is not None
    assert "BREW_MANUAL" not in state.attributes["options"]
    assert set(state.attributes["options"]) == {
        "BREW_AUTO", "FLUSH", "DESCALE", "STEAM", "FLUSH_AUTO", "HOT_WATER", "HOME",
    }


async def test_operation_mode_select_current_option_from_live_sys_state(hass, aioclient_mock) -> None:
    await _setup_entry(hass, aioclient_mock)
    # sysState.operationMode == 4 in the mocked /api/machine/live -> STEAM
    state = hass.states.get("select.gaggiuino_local_profiler_operation_mode")
    assert state.state == "STEAM"


async def test_operation_mode_select_posts_mode_and_refreshes(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    aioclient_mock.post(f"{url}/api/machine/opmode", json={"ok": True})

    await hass.services.async_call(
        "select", "select_option",
        {"entity_id": "select.gaggiuino_local_profiler_operation_mode", "option": "FLUSH"},
        blocking=True,
    )
    await hass.async_block_till_done()

    _, called_url, body, _ = _post_calls(aioclient_mock)[0]
    assert str(called_url).endswith("/api/machine/opmode")
    assert body == {"mode": "FLUSH"}


async def test_release_channel_select_reads_and_writes(hass, aioclient_mock) -> None:
    entry, url = await _setup_entry(hass, aioclient_mock)
    state = hass.states.get("select.gaggiuino_local_profiler_release_channel")
    assert state is not None
    assert state.state == "test"  # releaseChannel: 1 in SYSTEM_SETTINGS

    aioclient_mock.post(f"{url}/api/machine/settings/system", json={"success": True})
    await hass.services.async_call(
        "select", "select_option",
        {"entity_id": "select.gaggiuino_local_profiler_release_channel", "option": "debug"},
        blocking=True,
    )
    await hass.async_block_till_done()

    post_calls = _post_calls(aioclient_mock)
    _, called_url, body, _ = post_calls[-1]
    assert str(called_url).endswith("/api/machine/settings/system")
    assert body["releaseChannel"] == 2
