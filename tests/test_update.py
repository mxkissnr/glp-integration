"""Tests for GlpUpdateEntity — reverted the self-install path added for the
in-app add-on update button (see mxkissnr/gaggiuino-local-profiler#514/#515).
That required the add-on to hold the Supervisor "manager" role just to
duplicate functionality HA's own native per-add-on Supervisor update entity
already provides. Dropped in favor of relying on that entity; this one goes
back to being a read-only version display (installed/latest/release_url),
which is still the only update signal available on non-Supervisor (plain
Docker) installs — self-install was never possible there either (GLP's
/api/update always returned 503 outside HA). See mxkissnr/gaggiuino-local-
profiler#516 and this repo's #54."""
from unittest.mock import MagicMock

from homeassistant.components.update import UpdateEntityFeature

from custom_components.gaggiuino_profiler.update import GlpUpdateEntity


def _make_entry():
    entry = MagicMock()
    entry.entry_id = "test_entry"
    entry.options = {}
    entry.data = {"url": "http://glp.local:8099"}
    return entry


_DEFAULT_DATA = {
    "version_current": "2.18.2",
    "version_latest": "2.19.0",
    "version_release_url": "https://github.com/mxkissnr/gaggiuino-local-profiler/releases/latest",
}
_UNSET = object()


def _make_update_entity(data=_UNSET):
    coordinator = MagicMock()
    coordinator.data = _DEFAULT_DATA if data is _UNSET else data
    entity = GlpUpdateEntity(coordinator, _make_entry())
    return entity, coordinator


def test_no_install_feature_supported():
    entity, _coordinator = _make_update_entity()
    assert entity.supported_features == UpdateEntityFeature(0)


def test_has_no_async_install_method():
    # Guards against the capability quietly coming back — the base
    # UpdateEntity.async_install would otherwise call self.install(), which
    # raises NotImplementedError; overriding it again re-adds the self-update
    # path this entity intentionally no longer has.
    assert "async_install" not in GlpUpdateEntity.__dict__


def test_installed_version_reads_from_coordinator():
    entity, _coordinator = _make_update_entity()
    assert entity.installed_version == "2.18.2"


def test_latest_version_reads_from_coordinator():
    entity, _coordinator = _make_update_entity()
    assert entity.latest_version == "2.19.0"


def test_release_url_reads_from_coordinator():
    entity, _coordinator = _make_update_entity()
    assert entity.release_url == "https://github.com/mxkissnr/gaggiuino-local-profiler/releases/latest"


def test_version_fields_are_none_when_coordinator_has_no_data():
    entity, _coordinator = _make_update_entity(data=None)
    assert entity.installed_version is None
    assert entity.latest_version is None
    assert entity.release_url is None
