"""Tests for GlpMachineFirmwareUpdate (#125, Phase 2 of gaggiuino-local-
profiler#620) -- unlike GlpUpdateEntity (app self-update, deliberately
install-less, see test_update.py), this entity supports INSTALL by proxying
to the machine's own OTA endpoint, so it needs its own async_install
coverage."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.components.update import UpdateEntityFeature

from custom_components.gaggiuino_profiler.update import GlpMachineFirmwareUpdate


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": "http://glp.local:8099"}
    return entry


_DEFAULT_DATA = {
    "firmware_installed": "7889b7d",
    "firmware_latest": "a1b2c3d",
    "firmware_update_available": True,
    "firmware_release_url": "https://github.com/Zer0-bit/gaggiuino/releases/tag/main-a1b2c3d",
}
_UNSET = object()


def _make_entity(data=_UNSET):
    coordinator = MagicMock()
    coordinator.data = _DEFAULT_DATA if data is _UNSET else data
    coordinator.auth.headers = AsyncMock(return_value={"X-GLP-Token": "test-token"})
    coordinator.async_request_refresh = AsyncMock()
    entity = GlpMachineFirmwareUpdate(coordinator, _make_entry())
    entity.hass = MagicMock()
    return entity, coordinator


def test_install_feature_supported():
    entity, _coordinator = _make_entity()
    assert entity.supported_features == UpdateEntityFeature.INSTALL


def test_progress_feature_not_supported():
    # Deliberate -- the machine's own /api/firmware/progress response shape
    # is unverified (never exercised by any GLP frontend code). See the
    # entity's docstring.
    entity, _coordinator = _make_entity()
    assert not (entity.supported_features & UpdateEntityFeature.PROGRESS)


def test_installed_version_reads_from_coordinator():
    entity, _coordinator = _make_entity()
    assert entity.installed_version == "7889b7d"


def test_latest_version_reads_from_coordinator():
    entity, _coordinator = _make_entity()
    assert entity.latest_version == "a1b2c3d"


def test_release_url_reads_from_coordinator():
    entity, _coordinator = _make_entity()
    assert entity.release_url == "https://github.com/Zer0-bit/gaggiuino/releases/tag/main-a1b2c3d"


def test_version_fields_are_none_when_coordinator_has_no_data():
    entity, _coordinator = _make_entity(data=None)
    assert entity.installed_version is None
    assert entity.latest_version is None
    assert entity.release_url is None


def test_suggested_object_id_is_stable_key_not_display_name():
    # Precedent: v1.22.1 entity_id collision (#62/#63) -- every entity must
    # derive suggested_object_id from a stable key, never HA's automatic
    # display-name slugification.
    entity, _coordinator = _make_entity()
    assert entity.suggested_object_id == "machine_firmware"


@pytest.mark.asyncio
async def test_async_install_posts_to_firmware_update_endpoint_and_refreshes():
    entity, coordinator = _make_entity()
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_post_cm = MagicMock()
    mock_post_cm.__aenter__ = AsyncMock(return_value=mock_response)
    mock_post_cm.__aexit__ = AsyncMock(return_value=False)
    mock_session = MagicMock()
    mock_session.post = MagicMock(return_value=mock_post_cm)

    with patch(
        "custom_components.gaggiuino_profiler.update.async_get_clientsession",
        return_value=mock_session,
    ):
        await entity.async_install(version=None, backup=False)

    mock_session.post.assert_called_once()
    call_args = mock_session.post.call_args
    assert call_args.args[0] == "http://glp.local:8099/api/machine/firmware/update"
    assert call_args.kwargs["headers"] == {"X-GLP-Token": "test-token"}
    coordinator.async_request_refresh.assert_awaited_once()


@pytest.mark.asyncio
async def test_async_install_raises_and_logs_on_failure():
    entity, coordinator = _make_entity()
    mock_session = MagicMock()
    mock_session.post = MagicMock(side_effect=RuntimeError("connection refused"))

    with (
        patch(
            "custom_components.gaggiuino_profiler.update.async_get_clientsession",
            return_value=mock_session,
        ),
        pytest.raises(RuntimeError),
    ):
        await entity.async_install(version=None, backup=False)

    coordinator.async_request_refresh.assert_not_awaited()
