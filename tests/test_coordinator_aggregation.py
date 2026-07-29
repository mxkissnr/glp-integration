"""Tests for GlpDataCoordinator._async_update_data()'s core aggregation
logic (#69) -- previously only exercised incidentally by other test files
that happen to trigger the same code path, with no test asserting on the
aggregation itself: recent-shot downsampling, ratio/yield computation, and
graceful defaulting when a secondary endpoint (maintenance/preheat/
profiles/menu/version) fails while /api/status and /shots.json succeed.
"""
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from custom_components.gaggiuino_profiler.coordinator import GlpDataCoordinator, _ds

URL = "http://glp.example.com"


def _mock_all(
    aioclient_mock,
    *,
    status=None,
    shots=None,
    maintenance=None,
    maintenance_status=200,
    preheat=None,
    profiles=None,
    menu=None,
    menu_status=200,
    version=None,
    version_status=200,
) -> None:
    aioclient_mock.get(f"{URL}/api/status", json=status or {})
    aioclient_mock.get(f"{URL}/api/token", json={"apiToken": "test-token"})
    aioclient_mock.get(f"{URL}/shots.json", json=shots or [])
    if maintenance_status < 400:
        aioclient_mock.get(f"{URL}/api/maintenance", json=maintenance or {})
    else:
        aioclient_mock.get(f"{URL}/api/maintenance", status=maintenance_status)
    aioclient_mock.get(f"{URL}/api/preheat", json=preheat or {})
    aioclient_mock.get(f"{URL}/api/machine/profiles", json=profiles or {})
    if menu_status < 400:
        aioclient_mock.get(f"{URL}/api/menu", json=menu or [])
    else:
        aioclient_mock.get(f"{URL}/api/menu", status=menu_status)
    if version_status < 400:
        aioclient_mock.get(f"{URL}/api/version", json=version or {})
    else:
        aioclient_mock.get(f"{URL}/api/version", status=version_status)
    aioclient_mock.get(f"{URL}/api/live/data", json={})
    aioclient_mock.get(f"{URL}/api/machine/status", json={"available": False})


async def _refresh(hass, **kwargs) -> dict:
    session = async_get_clientsession(hass)
    coordinator = GlpDataCoordinator(hass, session, URL)
    return await coordinator._async_update_data()


def _shot(shot_id=1, dose=None, weight=None, pressure=None, timestamp=None, bean_id=None, **extra) -> dict:
    ann = {}
    if dose is not None:
        ann["dose"] = dose
    if bean_id is not None:
        ann["beanId"] = bean_id
    dp = {}
    if weight is not None:
        dp["shotWeight"] = weight
    if pressure is not None:
        dp["pressure"] = pressure
    shot = {"id": shot_id, "annotation": ann, "datapoints": dp}
    if timestamp is not None:
        shot["timestamp"] = timestamp
    shot.update(extra)
    return shot


async def test_ratio_and_yield_computed_from_last_shot(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot(dose=18, weight=[360])])
    data = await _refresh(hass)
    assert data["last_shot_weight"] == 36.0
    assert data["last_shot_dose"] == 18.0
    assert data["last_shot_ratio"] == 2.0


async def test_no_ratio_without_dose(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot(weight=[360])])
    data = await _refresh(hass)
    assert data["last_shot_weight"] == 36.0
    assert data["last_shot_dose"] is None
    assert data["last_shot_ratio"] is None


async def test_avg_pressure_computed_from_datapoints(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot(pressure=[80, 90, 100])])
    data = await _refresh(hass)
    assert data["last_shot_pressure"] == 9.0  # avg(80,90,100)/10 = 9.0


async def test_empty_shots_list_yields_no_last_shot_fields(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[])
    data = await _refresh(hass)
    assert data["last_shot_id"] is None
    assert data["last_shot_weight"] is None
    assert data["last_shot_ratio"] is None
    assert data["recent_shots"] == []


async def test_maintenance_endpoint_failure_defaults_gracefully(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot()], maintenance_status=500)
    data = await _refresh(hass)
    assert data["maint_descaling"] == {}
    assert data["grinder_maintenance_status"] is None
    assert data["grinder_maintenance_details"] == {}


async def test_menu_endpoint_failure_defaults_to_empty_drink_lookup(hass, aioclient_mock) -> None:
    _mock_all(
        aioclient_mock,
        shots=[_shot(drinkType="latte")],
        menu_status=500,
    )
    data = await _refresh(hass)
    assert data["recent_shots"][0]["drink_type"] is None


async def test_version_endpoint_failure_defaults_gracefully(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot()], version_status=500)
    data = await _refresh(hass)
    assert data["version_current"] is None
    assert data["version_latest"] is None
    assert data["version_update_available"] is False


async def test_grinder_maintenance_status_is_the_worst_across_grinders(hass, aioclient_mock) -> None:
    _mock_all(
        aioclient_mock,
        shots=[_shot()],
        maintenance={
            "grinder_1": {"status": "ok", "grinderName": "Niche"},
            "grinder_2": {"status": "due", "grinderName": "DF64"},
            "grinder_3": {"status": "soon", "grinderName": "K6"},
        },
    )
    data = await _refresh(hass)
    assert data["grinder_maintenance_status"] == "due"
    assert set(data["grinder_maintenance_details"]) == {"Niche", "DF64", "K6"}


async def test_recent_shots_curves_are_downsampled_to_40_points(hass, aioclient_mock) -> None:
    long_pressure = list(range(100))
    _mock_all(aioclient_mock, shots=[_shot(pressure=long_pressure)])
    data = await _refresh(hass)
    dp = data["recent_shots"][0]["dp"]
    assert len(dp["p"]) <= 40
    assert dp["p"][-1] == long_pressure[-1]  # _ds always keeps the last point


def test_ds_keeps_short_arrays_unchanged() -> None:
    short = [1, 2, 3]
    assert _ds(short) == short


def test_ds_downsamples_and_keeps_last_point() -> None:
    long_arr = list(range(200))
    result = _ds(long_arr, n=40)
    assert len(result) == 40
    assert result[-1] == 199
    assert result[0] == 0


async def test_recent_shots_threads_bean_id_from_annotation(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot(bean_id="bean-42")])
    data = await _refresh(hass)
    assert data["recent_shots"][0]["beanId"] == "bean-42"


async def test_recent_shots_bean_id_is_none_without_annotation_field(hass, aioclient_mock) -> None:
    _mock_all(aioclient_mock, shots=[_shot()])
    data = await _refresh(hass)
    assert data["recent_shots"][0]["beanId"] is None


async def test_shot_completed_event_fires_on_new_last_shot(hass, aioclient_mock) -> None:
    events: list[dict] = []
    hass.bus.async_listen(f"{DOMAIN}_shot_completed", lambda event: events.append(event.data))

    url = URL
    _mock_all(aioclient_mock, shots=[_shot(shot_id=1, dose=18, weight=[360])])
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert events == []  # first refresh never fires -- no prior shot to compare against

    aioclient_mock.clear_requests()
    _mock_all(aioclient_mock, shots=[_shot(shot_id=1), _shot(shot_id=2, dose=18, weight=[360])])
    coordinator = hass.data[DOMAIN][entry.entry_id]["data"]
    await coordinator.async_refresh()
    await hass.async_block_till_done()

    assert len(events) == 1
    assert events[0]["shot_id"] == 2
    assert events[0]["dose_g"] == 18.0
    assert events[0]["yield_g"] == 36.0
    assert events[0]["ratio"] == 2.0
