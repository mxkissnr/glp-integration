"""Tests for #90: the GLP Shot Card is bundled inside this repo (HACS policy
for a card with a hard dependency on our services) and auto-registered as a
Lovelace resource on setup, so no manual dashboard resource config is needed."""
import asyncio

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN
from tests.common import mock_all_coordinator_endpoints


def _extra_js_urls(hass) -> set[str]:
    """The frontend's registered extra JS/module URLs. HA keeps them in a
    `UrlManager` on `hass.data[DATA_EXTRA_MODULE_URL]` -- its `.urls` is a
    frozenset in current core, a plain set in older versions."""
    manager = hass.data[DATA_EXTRA_MODULE_URL]
    return set(getattr(manager, "urls", manager))


def _www_get_route_count(hass) -> int:
    """GET routes on the /{DOMAIN}/www path. One async_register_static_paths
    call installs exactly two (aiohttp's StaticResource route + the explicit
    GET fallback route); a second, un-deduped registration would double it."""
    return sum(
        1
        for route in hass.http.app.router.routes()
        if route.method == "GET" and getattr(route.resource, "canonical", None) == f"/{DOMAIN}/www"
    )


async def test_card_registered_as_extra_js_url(hass, strict_aioclient_mock) -> None:
    url = "http://glp.example.com"
    mock_all_coordinator_endpoints(strict_aioclient_mock, url)
    entry = MockConfigEntry(domain=DOMAIN, data={"url": url})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    # The static path serving the real files, which is the part that would
    # break if the www/ folder or path drifted...
    resolved = hass.http.app.router
    assert any(
        route.resource.canonical.startswith(f"/{DOMAIN}/www")
        for route in resolved.routes()
        if getattr(route.resource, "canonical", None)
    )

    # ...and the actual registration that makes HA load the cards: without
    # this entry the file is served but never added to any dashboard.
    extra_js = _extra_js_urls(hass)
    card_urls = {url for url in extra_js if url.startswith(f"/{DOMAIN}/www/glp-card.js")}
    assert len(card_urls) == 1, f"glp-card.js missing from frontend extra JS urls: {sorted(extra_js)}"
    assert next(iter(card_urls)).split("?")[0] == f"/{DOMAIN}/www/glp-card.js"

    # Cancel the entry's background SSE task before the cleanup fixture runs.
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_frontend_registration_is_idempotent_across_entries(hass, strict_aioclient_mock) -> None:
    url1, url2 = "http://glp1.example.com", "http://glp2.example.com"
    mock_all_coordinator_endpoints(strict_aioclient_mock, url1)
    mock_all_coordinator_endpoints(strict_aioclient_mock, url2)

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

    for entry in (entry1, entry2):
        assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


async def test_concurrent_entry_setups_register_www_path_once(hass, strict_aioclient_mock) -> None:
    # #193: two config entries (stable + DEV app) set up concurrently must not
    # race on the shared /{DOMAIN}/www static path -- the loser used to hit
    # aiohttp's "already registered" RuntimeError and fail its whole setup.
    url1, url2 = "http://glp1.example.com", "http://glp2.example.com"
    mock_all_coordinator_endpoints(strict_aioclient_mock, url1)
    mock_all_coordinator_endpoints(strict_aioclient_mock, url2)

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

    # Cancel the entries' background SSE tasks before the cleanup fixture runs.
    for entry in (entry1, entry2):
        assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
