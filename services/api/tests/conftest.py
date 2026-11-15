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
