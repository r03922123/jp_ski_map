"""The guard in conftest.py: the default run never reaches the network (SPEC.md)."""

import socket

import httpx
import pytest
from fastapi.testclient import TestClient

from hakuba_api.main import app
from hakuba_api.places import photon


def test_a_test_that_opens_a_connection_fails_loudly() -> None:
    # 192.0.2.1 is reserved for documentation (RFC 5737): never routable
    with pytest.raises(AssertionError, match="tried to reach 192.0.2.1"):
        httpx.get("http://192.0.2.1/", timeout=1)


def test_a_connection_to_a_bare_address_fails_too() -> None:
    # no name to look up, so only the refused connect stops this one
    with socket.socket() as sock, pytest.raises(AssertionError, match="tried to reach"):
        sock.connect(("192.0.2.1", 80))


def test_an_unfaked_upstream_call_fails_before_its_name_is_looked_up() -> None:
    photon.clear_cache()
    with pytest.raises(AssertionError, match="tried to reach photon.komoot.io"):
        TestClient(app).get("/api/places/suggest", params={"q": "zz-nothing"})


def test_an_unfaked_call_to_a_name_that_would_not_resolve_fails_too(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # without the guard the lookup fails, the code treats it as an outage, and the test passes
    monkeypatch.setenv("HAKUBA_SEMANTIC_URL", "http://semantic.test")
    with pytest.raises(AssertionError, match="tried to reach semantic.test"):
        TestClient(app).get("/api/places/suggest", params={"q": "zz-nothing"})
