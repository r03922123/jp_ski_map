import socket
from collections.abc import Iterator

import pytest

from hakuba_api.common import ratelimit
from hakuba_api.snow.router import clear_cache


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> Iterator[None]:
    """Every test starts with full buckets; limits are tested in tests/test_ratelimit.py."""
    ratelimit.LIMITS.reset()
    yield
    ratelimit.LIMITS.reset()


@pytest.fixture(autouse=True)
def fresh_snow_cache() -> Iterator[None]:
    """Snow answers, the last good report and a remembered failure outlive a request, and are
    keyed by the fetcher's id, which a later test's fetcher can reuse: start every test clean."""
    clear_cache()
    yield
    clear_cache()


@pytest.fixture(autouse=True)
def no_network(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """SPEC.md: no live network in the default run. A call nobody faked fails its test at
    once, instead of reaching a real service and passing or failing with that service's
    mood. An AssertionError, so no `except httpx.HTTPError` in the code swallows it. The
    name lookup is refused too: it would leave the machine, and when the name doesn't
    resolve the code under test would handle that as an ordinary upstream failure."""
    if request.node.get_closest_marker("live"):
        return

    def refuse(target: object, *_args: object, **_kwargs: object) -> None:
        raise AssertionError(f"this test tried to reach {target}: fake it with respx")

    def refuse_connect(_self: socket.socket, address: object) -> None:
        refuse(address)

    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setattr(socket.socket, "connect", refuse_connect)
