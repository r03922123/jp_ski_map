import socket
from collections.abc import Iterator

import pytest

from hakuba_api.common import ratelimit


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> Iterator[None]:
    """Every test starts with full buckets; limits are tested in tests/test_ratelimit.py."""
    ratelimit.LIMITS.reset()
    yield
    ratelimit.LIMITS.reset()


@pytest.fixture(autouse=True)
def no_network(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """SPEC.md: no live network in the default run. A call nobody faked fails its test at
    once, instead of reaching a real service and passing or failing with that service's
    mood. An AssertionError, so no `except httpx.HTTPError` in the code swallows it."""
    if request.node.get_closest_marker("live"):
        return

    def refuse(_self: socket.socket, address: object) -> None:
        raise AssertionError(f"this test opened a connection to {address}: fake it with respx")

    monkeypatch.setattr(socket.socket, "connect", refuse)
