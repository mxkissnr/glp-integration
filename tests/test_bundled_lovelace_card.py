"""Tests for #90: the GLP Shot Card is bundled inside this repo (HACS policy
for a card with a hard dependency on our services) and auto-registered as a
Lovelace resource on setup, so no manual dashboard resource config is needed."""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.gaggiuino_profiler.const import DOMAIN


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
