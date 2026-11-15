"""The guard in conftest.py: the default run never reaches the network (SPEC.md)."""

import httpx
import pytest


def test_a_test_that_opens_a_connection_fails_loudly() -> None:
    # 192.0.2.1 is reserved for documentation (RFC 5737): no DNS lookup, never routable
    with pytest.raises(AssertionError, match="opened a connection"):
        httpx.get("http://192.0.2.1/", timeout=1)
