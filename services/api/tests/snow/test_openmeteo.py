import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from hakuba_api.common.upstream import UpstreamError
from hakuba_api.main import app
from hakuba_api.ranking.router import get_snow_reports
from hakuba_api.snow.openmeteo import fetch_hourly
from hakuba_api.snow.router import clear_cache

FIXTURE = Path(__file__).parents[1] / "fixtures" / "openmeteo" / "winter_week.json"
POINT = (36.7, 137.85, 800)
HOURLY: dict[str, Any] = {
    "time": ["2026-01-10T00:00", "2026-01-10T01:00"],
    "snowfall": [0.5, None],
    "snow_depth": [1.2, 1.2],
    "temperature_2m": [-5.0, -6.1],
}


@pytest.fixture(autouse=True)
def fresh_cache() -> Iterator[None]:
    clear_cache()
    yield
    clear_cache()


def serve(monkeypatch: pytest.MonkeyPatch, **content: Any) -> None:
    """Open-Meteo answers 200 with `content` (json=... or text=...), no network."""

    def fake_get(url: str, **_: Any) -> httpx.Response:
        return httpx.Response(200, request=httpx.Request("GET", url), **content)

    monkeypatch.setattr(httpx, "get", fake_get)


def test_valid_response_is_returned_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture: list[dict[str, Any]] = json.loads(FIXTURE.read_text())
    serve(monkeypatch, json=fixture)

    assert fetch_hourly([POINT] * len(fixture)) == fixture


def test_single_location_object_becomes_a_list(monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, json={"hourly": HOURLY})

    assert fetch_hourly([POINT]) == [{"hourly": HOURLY}]


@pytest.mark.parametrize(
    "content",
    [
        pytest.param({"json": {"reason": "busy"}}, id="no hourly block"),
        pytest.param({"json": {"hourly": {"time": HOURLY["time"]}}}, id="missing series"),
        pytest.param({"json": {"hourly": {**HOURLY, "snowfall": [0.5]}}}, id="uneven series"),
        pytest.param({"json": {"hourly": {**HOURLY, "snowfall": ["a lot", 1]}}}, id="not a number"),
        pytest.param({"json": {"hourly": {**HOURLY, "snowfall": ["0.5", 1]}}}, id="number as text"),
        pytest.param(
            {"json": {"hourly": {**HOURLY, "snow_depth": [True, 1]}}}, id="bool as number"
        ),
        pytest.param(
            {"text": json.dumps({"hourly": {**HOURLY, "snow_depth": [float("inf"), 1]}})},
            id="infinite number",
        ),
        pytest.param({"json": {"hourly": {**HOURLY, "time": ["today", "x"]}}}, id="bad time"),
        pytest.param({"json": "Service Unavailable"}, id="not an object"),
        pytest.param({"text": "<html>busy</html>"}, id="not json"),
    ],
)
def test_malformed_response_is_an_upstream_error(
    monkeypatch: pytest.MonkeyPatch, content: dict[str, Any]
) -> None:
    serve(monkeypatch, **content)

    with pytest.raises(UpstreamError):
        fetch_hourly([POINT])


def test_fewer_locations_than_points_is_an_upstream_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    serve(monkeypatch, json=[{"hourly": HOURLY}])

    with pytest.raises(UpstreamError):
        fetch_hourly([POINT, POINT])


def test_snow_endpoint_reports_a_malformed_response_as_upstream_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    serve(monkeypatch, json={"reason": "busy"})

    response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert response.json() == {"error": "upstream_unavailable", "source": "open-meteo"}


def test_rank_goes_on_without_snow_when_the_response_is_malformed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    serve(monkeypatch, json={"reason": "busy"})

    assert get_snow_reports() == {}  # the snow /api/rank ranks with
