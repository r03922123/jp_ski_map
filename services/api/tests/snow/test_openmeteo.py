import json
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common.upstream import UpstreamError
from hakuba_api.main import app
from hakuba_api.ranking.router import get_snow_reports
from hakuba_api.snow.compute import JST, HourlySeries
from hakuba_api.snow.openmeteo import OPEN_METEO_URL, fetch_hourly
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


@pytest.fixture
def openmeteo() -> Iterator[respx.MockRouter]:
    """Fakes Open-Meteo's HTTP answers, no network."""
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def test_valid_response_becomes_one_series_per_location(openmeteo: respx.MockRouter) -> None:
    fixture: list[dict[str, Any]] = json.loads(FIXTURE.read_text())
    openmeteo.get(OPEN_METEO_URL).respond(json=fixture)

    series = fetch_hourly([POINT] * len(fixture))

    assert [s.snowfall_cm for s in series] == [loc["hourly"]["snowfall"] for loc in fixture]
    assert [s.snow_depth_m for s in series] == [loc["hourly"]["snow_depth"] for loc in fixture]
    assert [s.temperature_c for s in series] == [loc["hourly"]["temperature_2m"] for loc in fixture]
    assert len(series[0].times) == 168
    assert series[0].times[0] == datetime(2026, 1, 9, 0, tzinfo=JST)


def test_single_location_object_becomes_a_list(openmeteo: respx.MockRouter) -> None:
    openmeteo.get(OPEN_METEO_URL).respond(json={"hourly": HOURLY})

    assert fetch_hourly([POINT]) == [
        HourlySeries(
            times=[datetime(2026, 1, 10, 0, tzinfo=JST), datetime(2026, 1, 10, 1, tzinfo=JST)],
            snowfall_cm=[0.5, None],
            snow_depth_m=[1.2, 1.2],
            temperature_c=[-5.0, -6.1],
        )
    ]


def test_whole_numbers_are_valid(openmeteo: respx.MockRouter) -> None:
    hourly = {**HOURLY, "snowfall": [1, 0], "snow_depth": [2, 2], "temperature_2m": [-5, -6]}
    openmeteo.get(OPEN_METEO_URL).respond(json={"hourly": hourly})

    [series] = fetch_hourly([POINT])

    assert (series.snowfall_cm, series.snow_depth_m, series.temperature_c) == (
        [1.0, 0.0],
        [2.0, 2.0],
        [-5.0, -6.0],
    )


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
    openmeteo: respx.MockRouter, content: dict[str, Any]
) -> None:
    openmeteo.get(OPEN_METEO_URL).respond(**content)

    with pytest.raises(UpstreamError):
        fetch_hourly([POINT])


def test_fewer_locations_than_points_is_an_upstream_error(
    openmeteo: respx.MockRouter,
) -> None:
    openmeteo.get(OPEN_METEO_URL).respond(json=[{"hourly": HOURLY}])

    with pytest.raises(UpstreamError):
        fetch_hourly([POINT, POINT])


def test_snow_endpoint_reports_a_malformed_response_as_upstream_unavailable(
    openmeteo: respx.MockRouter,
) -> None:
    openmeteo.get(OPEN_METEO_URL).respond(json={"reason": "busy"})

    response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert response.json() == {"error": "upstream_unavailable", "source": "open-meteo"}


def test_rank_goes_on_without_snow_when_the_response_is_malformed(
    openmeteo: respx.MockRouter,
) -> None:
    openmeteo.get(OPEN_METEO_URL).respond(json={"reason": "busy"})

    assert get_snow_reports() == {}  # the snow /api/rank ranks with
