"""Global fixtures for the glp-integration test suite."""
import pytest

from tests.common import fail_on_unmatched_requests, record_unmatched_requests

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture
def strict_aioclient_mock(aioclient_mock):
    """Fail the test if it reaches an endpoint it did not mock.

    The coordinators catch every exception, so an unmocked URL only shows up
    as a coordinator quietly falling back to its default. This fixture records
    those swallowed aioclient_mock assertions and fails at teardown, naming the
    method and URL of each one.

    Opt-in for now; it becomes autouse once every test file mocks its
    endpoints through `tests.common.mock_all_coordinator_endpoints`.
    """
    with record_unmatched_requests(aioclient_mock) as unmatched:
        yield aioclient_mock
    fail_on_unmatched_requests(unmatched)
