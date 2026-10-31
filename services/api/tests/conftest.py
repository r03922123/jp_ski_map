from collections.abc import Iterator

import pytest

from hakuba_api.common import ratelimit


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> Iterator[None]:
    """Every test starts with full buckets; limits are tested in tests/test_ratelimit.py."""
    ratelimit.LIMITS.reset()
    yield
    ratelimit.LIMITS.reset()
