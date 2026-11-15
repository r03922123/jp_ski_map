"""An Open-Meteo outage serves the last good snow report, and isn't retried at once."""

import json
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common import cache
from hakuba_api.common.upstream import UpstreamError
from hakuba_api.main import app
from hakuba_api.ranking.router import get_snow_reports
from hakuba_api.snow import router as snow_router
from hakuba_api.snow.compute import JST, HourlySeries
from hakuba_api.snow.openmeteo import OPEN_METEO_URL, parse_hourly
from hakuba_api.snow.router import STALE_S, clear_cache, get_hourly_fetcher, get_now

FIXTURE = Path(__file__).parents[1] / "fixtures" / "openmeteo" / "winter_week.json"


class Upstream:
    """Open-Meteo stand-in that can be switched off, and counts its calls."""

    def __init__(self) -> None:
        self.down = False
        self.calls = 0
        self._series = parse_hourly(json.loads(FIXTURE.read_text()))

    def __call__(self, _points: list[tuple[float, float, int]]) -> list[HourlySeries]:
        self.calls += 1
        if self.down:
            raise UpstreamError("open-meteo", "timeout")
        return self._series


@pytest.fixture
def upstream() -> Iterator[Upstream]:
    clear_cache()
    fake = Upstream()
    app.dependency_overrides[get_hourly_fetcher] = lambda: fake
    yield fake
    app.dependency_overrides.clear()
    clear_cache()


def at(hour: int) -> None:
    app.dependency_overrides[get_now] = lambda: datetime(2026, 1, 12, hour, tzinfo=JST)


def test_an_outage_serves_the_last_good_report_with_its_own_time(upstream: Upstream) -> None:
    at(7)
    assert TestClient(app).get("/api/snow").status_code == 200
    upstream.down = True
    at(8)  # a new hour, so the hourly cache has nothing

    response = TestClient(app).get("/api/snow")

    assert response.status_code == 200
    assert {r["asOf"] for r in response.json()} == {"2026-01-12T07:00:00+09:00"}


def test_an_outage_with_nothing_to_fall_back_on_is_still_an_error(upstream: Upstream) -> None:
    upstream.down = True
    at(7)

    response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert response.json() == {"error": "upstream_unavailable", "source": "open-meteo"}


def test_a_failure_is_not_retried_for_a_minute(upstream: Upstream) -> None:
    upstream.down = True
    at(7)
    client = TestClient(app)

    assert [client.get("/api/snow").status_code for _ in range(3)] == [502, 502, 502]
    assert upstream.calls == 1  # the other two didn't wait on a dead upstream


def test_the_upstream_is_tried_again_once_the_minute_is_over(
    upstream: Upstream, monkeypatch: pytest.MonkeyPatch
) -> None:
    upstream.down = True
    at(7)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 502
    upstream.down = False
    later = cache.time.monotonic() + snow_router.RETRY_AFTER_FAILURE_S + 1
    monkeypatch.setattr(cache.time, "monotonic", lambda: later)

    assert client.get("/api/snow").status_code == 200
    assert upstream.calls == 2


def test_a_report_older_than_the_limit_is_not_served(
    upstream: Upstream, monkeypatch: pytest.MonkeyPatch
) -> None:
    at(7)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 200
    upstream.down = True
    later = cache.time.monotonic() + STALE_S + 1
    monkeypatch.setattr(cache.time, "monotonic", lambda: later)

    assert client.get("/api/snow").status_code == 502


def test_rank_keeps_its_snow_through_an_outage() -> None:
    # /api/rank reads snow through the real fetcher, so Open-Meteo itself is faked here
    clear_cache()
    with respx.mock() as openmeteo:
        openmeteo.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        assert len(get_snow_reports()) == 10
        openmeteo.get(OPEN_METEO_URL).respond(503)
        snow_router._cache.clear()  # pyright: ignore[reportPrivateUsage]  the hour is over

        assert len(get_snow_reports()) == 10  # was {}: the Drive list lost its snow
    clear_cache()
