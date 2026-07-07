"""Tests for coordinator._is_trusted_host — the guard that decides whether
the privileged HA Supervisor token is forwarded to the configured GLP host.
This is security-relevant: a permissive guard would leak the Supervisor
token to an admin-configured (and only scheme-validated) URL."""
import pytest

from custom_components.gaggiuino_profiler.coordinator import _is_trusted_host


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8099",
        "http://127.0.0.1:8099",
        "http://[::1]:8099",
        "http://10.0.0.5:8099",
        "http://192.168.1.50:8099",
        "http://172.30.32.1:8099",
        "http://gaggiuino.local:8099",
        "http://glp.internal",
        "http://glp.intern",
        "http://homeassistant.lan",
        "http://addon.home",
        "http://box.home.arpa",
        "https://GAGGIUINO.LOCAL",  # case-insensitive suffix match
    ],
)
def test_trusted_hosts(url: str) -> None:
    assert _is_trusted_host(url) is True


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://evil.example.com:8099",
        "http://8.8.8.8",
        "http://1.1.1.1:8099",
        "http://attacker.io/.local",  # suffix check is on hostname only
        "",
        "not a url",
        "http://",
    ],
)
def test_untrusted_hosts(url: str) -> None:
    assert _is_trusted_host(url) is False


def test_scheme_is_not_checked() -> None:
    """_is_trusted_host only inspects the hostname, not the scheme — the
    scheme is validated separately in config_flow. Documented here so a
    future refactor notices if this assumption changes."""
    assert _is_trusted_host("ftp://gaggiuino.local") is True
