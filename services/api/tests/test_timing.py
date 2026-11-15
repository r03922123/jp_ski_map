"""Server-Timing: how long each real upstream call took, per request."""

import json
import logging
import re
from collections.abc import Iterator
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common import timing
from hakuba_api.common.timing import timed
from hakuba_api.main import app
from hakuba_api.snow.openmeteo import OPEN_METEO_URL
from hakuba_api.snow.router import clear_cache

FIXTURE = Path(__file__).parent / "fixtures" / "openmeteo" / "winter_week.json"


@pytest.fixture(autouse=True)
def fresh_cache() -> Iterator[None]:
    clear_cache()
    yield
    clear_cache()


def entries(header: str) -> dict[str, float]:
    return {name: float(ms) for name, ms in re.findall(r"([\w-]+);dur=([\d.]+)", header)}


def test_every_response_carries_its_total_time() -> None:
    response = TestClient(app).get("/api/health")

    assert list(entries(response.headers["server-timing"])) == ["total"]


def test_an_upstream_call_made_in_the_endpoints_thread_is_listed() -> None:
    with respx.mock() as openmeteo:
        openmeteo.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        first = TestClient(app).get("/api/snow")
        cached = TestClient(app).get("/api/snow")

    took = entries(first.headers["server-timing"])
    assert list(took) == ["open-meteo", "total"]
    assert took["open-meteo"] <= took["total"]
    # a cache hit called nothing, and says so
    assert list(entries(cached.headers["server-timing"])) == ["total"]


def test_the_header_never_carries_the_query_text() -> None:
    response = TestClient(app).get("/api/places/suggest", params={"q": "secret-hotel-name"})

    assert "secret" not in response.headers["server-timing"]


def test_a_failed_call_is_still_timed() -> None:
    with respx.mock() as openmeteo:
        openmeteo.get(OPEN_METEO_URL).respond(503)
        response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert "open-meteo" in entries(response.headers["server-timing"])


def test_a_slow_request_is_logged_with_its_breakdown_and_no_query(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(timing, "SLOW_MS", 0.0)  # every request counts as slow
    with caplog.at_level(logging.WARNING, logger=timing.__name__):
        TestClient(app).get("/api/places/suggest", params={"q": "secret-hotel-name"})

    (record,) = caplog.records
    message = record.getMessage()
    assert "GET /api/places/suggest" in message and "status=200" in message
    assert "secret" not in message


def test_a_fast_successful_request_is_not_logged(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING, logger=timing.__name__):
        TestClient(app).get("/api/health")

    assert caplog.records == []


def test_timed_outside_a_request_does_nothing() -> None:
    with timed("valhalla"):  # scripts and tests call the clients with no request around
        pass
