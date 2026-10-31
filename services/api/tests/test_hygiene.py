"""T78: inputs the app never sends must get a 4xx, not a 500 or an echo of the input."""

from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient

from hakuba_api.bus.models import Timetable
from hakuba_api.bus.router import get_bus_data, get_manifest_season, get_walks
from hakuba_api.crowd.router import get_snow_by_resort, get_today
from hakuba_api.main import MAX_BODY_BYTES, app


@pytest.fixture
def api() -> Iterator[TestClient]:
    def walks() -> dict[str, int]:
        return {"stop-happo-bus-terminal": 0}

    def no_timetables() -> list[Timetable]:
        return []

    app.dependency_overrides[get_walks] = walks
    app.dependency_overrides[get_bus_data] = no_timetables
    app.dependency_overrides[get_manifest_season] = lambda: None
    app.dependency_overrides[get_today] = lambda: date(2027, 1, 15)
    app.dependency_overrides[get_snow_by_resort] = lambda: {}
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["/api/bus/options", "/api/bus/night"])
@pytest.mark.parametrize("at", ["9999-12-31T23:59:00+09:00", "0001-01-01T00:00:00"])
def test_bus_dates_out_of_range_are_rejected(api: TestClient, path: str, at: str) -> None:
    response = api.get(path, params={"from": "36.7015,137.8456", "at": at})

    assert response.status_code == 422


def test_bus_dates_in_range_still_work(api: TestClient) -> None:
    response = api.get(
        "/api/bus/options", params={"from": "36.7015,137.8456", "at": "2027-01-15T08:00:00+09:00"}
    )

    assert response.status_code == 200


@pytest.mark.parametrize("day", ["9999-12-31", "0001-01-01"])
def test_crowd_dates_out_of_range_are_rejected(api: TestClient, day: str) -> None:
    assert api.get("/api/crowd", params={"date": day}).status_code == 422


def test_a_huge_body_is_refused_before_it_is_parsed(api: TestClient) -> None:
    body = '{"mode": "walk", "points": [' + ",".join(['{"lat": 1, "lng": 1}'] * 300_000) + "]}"
    assert len(body) > 5_000_000

    response = api.post(
        "/api/route/path", content=body, headers={"content-type": "application/json"}
    )

    assert response.status_code == 413
    assert len(response.content) < 200


def test_a_huge_chunked_body_is_refused_too(api: TestClient) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(100):
            yield b"x" * 10_000

    response = api.post(
        "/api/route/path", content=chunks(), headers={"content-type": "application/json"}
    )

    assert response.status_code == 413


def test_a_body_under_the_limit_still_reaches_validation(api: TestClient) -> None:
    response = api.post("/api/route/path", json={"mode": "walk", "points": []})

    assert response.status_code == 422
    assert MAX_BODY_BYTES >= 16_000  # 25 points with room to spare


def test_a_validation_error_does_not_echo_the_input(api: TestClient) -> None:
    junk = "x" * 5_000
    response = api.post("/api/route/path", json={"mode": "walk", "points": junk})

    assert response.status_code == 422
    assert junk not in response.text
    detail: Any = response.json()["detail"]
    assert detail[0]["loc"] == ["body", "points"]


@pytest.mark.parametrize("path", ["/api/places/search", "/api/places/suggest"])
def test_an_overlong_query_is_rejected(api: TestClient, path: str) -> None:
    assert api.get(path, params={"q": "a" * 5_000}).status_code == 422


def test_static_resort_data_is_cacheable(api: TestClient) -> None:
    response = api.get("/api/resorts")

    assert response.status_code == 200
    assert "max-age=" in response.headers.get("cache-control", "")
    assert "public" in response.headers["cache-control"]
