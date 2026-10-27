"""Global fixtures for the glp-integration test suite."""
import pytest

from tests.common import fail_on_unmatched_requests, record_unmatched_requests

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture(autouse=True)
def _fail_on_unmatched_requests(request):
    """Fail the test if it reaches an endpoint it did not mock.

    Runs for every test that takes aioclient_mock, directly or through
    strict_aioclient_mock. The coordinators catch every exception, so an
    unmocked URL only shows up as a coordinator quietly falling back to its
    default: this fixture records those swallowed aioclient_mock assertions
    and fails at teardown, naming the method and URL of each one.

    Autouse, so a new test file cannot silently lose the guard by forgetting
    the fixture argument. Tests that do not use aioclient_mock at all are left
    alone -- pulling the fixture in would install the client-session mock for
    them too. `@pytest.mark.allow_unmatched_requests` opts a single test out;
    only the guard's own tests in test_strict_aioclient_mock.py need that.
    """
    if "aioclient_mock" not in request.fixturenames or request.node.get_closest_marker(
        "allow_unmatched_requests"
    ):
        yield
        return
    aioclient_mock = request.getfixturevalue("aioclient_mock")
    with record_unmatched_requests(aioclient_mock) as unmatched:
        yield
    fail_on_unmatched_requests(unmatched)


@pytest.fixture
def strict_aioclient_mock(aioclient_mock):
    """Name the guard explicitly at the call site.

    The guard itself is autouse now, so this is an alias: test files that
    already spell out `strict_aioclient_mock` keep working unchanged.
    """
    return aioclient_mock
