"""Tests for #90: the GLP Shot Card is bundled inside this repo (HACS policy
for a card with a hard dependency on our services) and auto-registered as a
Lovelace resource on setup, so no manual dashboard resource config is needed."""
import asyncio

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN


def _www_get_route_count(hass) -> int:
    """GET routes on the /{DOMAIN}/www path. One async_register_static_paths
    call installs exactly two (aiohttp's StaticResource route + the explicit
    GET fallback route); a second, un-deduped registration would double it."""
    return sum(
        1
        for route in hass.http.app.router.routes()
        if route.method == "GET" and getattr(route.resource, "canonical", None) == f"/{DOMAIN}/www"
    )


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
    aioclient_mock.get(f"{url}/api/machine/status", json={"available": False})


async def test_card_registered_as_extra_js_url(hass, aioclient_mock) -> None:
    url = "http://glp.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    # HA stores extra JS urls under frontend's own data key; assert indirectly
    # via the registered static path serving the real file instead, which is
    # the part that would actually break if the www/ folder or path drifted.
    resolved = hass.http.app.router
    assert any(
        route.resource.canonical.startswith(f"/{DOMAIN}/www")
        for route in resolved.routes()
        if getattr(route.resource, "canonical", None)
    )


async def test_frontend_registration_is_idempotent_across_entries(hass, aioclient_mock) -> None:
    url1, url2 = "http://glp1.example.com", "http://glp2.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url1)
    _mock_all_coordinator_endpoints(aioclient_mock, url2)

    entry1 = MockConfigEntry(domain=DOMAIN, data={"url": url1})
    entry1.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry1.entry_id)
    await hass.async_block_till_done()

    entry2 = MockConfigEntry(domain=DOMAIN, data={"url": url2})
    entry2.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry2.entry_id)
    await hass.async_block_till_done()

    assert hass.data.get(f"{DOMAIN}_frontend_registered") is True
    assert _www_get_route_count(hass) == 2


async def test_concurrent_entry_setups_register_www_path_once(hass, aioclient_mock) -> None:
    # #193: two config entries (stable + DEV app) set up concurrently must not
    # race on the shared /{DOMAIN}/www static path -- the loser used to hit
    # aiohttp's "already registered" RuntimeError and fail its whole setup.
    url1, url2 = "http://glp1.example.com", "http://glp2.example.com"
    _mock_all_coordinator_endpoints(aioclient_mock, url1)
    _mock_all_coordinator_endpoints(aioclient_mock, url2)

    entry1 = MockConfigEntry(domain=DOMAIN, data={"url": url1})
    entry2 = MockConfigEntry(domain=DOMAIN, data={"url": url2})
    entry1.add_to_hass(hass)
    entry2.add_to_hass(hass)

    results = await asyncio.gather(
        hass.config_entries.async_setup(entry1.entry_id),
        hass.config_entries.async_setup(entry2.entry_id),
    )
    await hass.async_block_till_done()

    assert results == [True, True]
    assert _www_get_route_count(hass) == 2
    assert hass.data.get(f"{DOMAIN}_frontend_registered") is True
