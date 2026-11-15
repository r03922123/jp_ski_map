"""An Open-Meteo outage serves the last good snow report, and isn't retried at once."""

import json
import logging
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common import ratelimit
from hakuba_api.common.ratelimit import Limits
from hakuba_api.common.upstream import UpstreamError
from hakuba_api.main import app
from hakuba_api.ranking.router import get_snow_reports
from hakuba_api.snow import router as snow_router
from hakuba_api.snow.compute import JST, HourlySeries
from hakuba_api.snow.openmeteo import OPEN_METEO_URL, parse_hourly
from hakuba_api.snow.router import get_hourly_fetcher, get_now, get_snow

FIXTURE = Path(__file__).parents[1] / "fixtures" / "openmeteo" / "winter_week.json"
SEVEN = datetime(2026, 1, 12, 7, tzinfo=JST)
HOUR = timedelta(hours=1)
# The two limits SPEC-snow-conditions promises, stated here and not imported, so a changed
# constant fails these tests
RETRY_AFTER_FAILURE = timedelta(seconds=60)
STALE = timedelta(hours=6)
SEVEN_ISO = "2026-01-12T07:00:00+09:00"
HALF_PAST = SEVEN + timedelta(minutes=30)
NO_BUDGET = Limits(upstream={"open-meteo": (0.01, 0)})  # our own budget for it is spent


class Upstream:
    """Open-Meteo stand-in that can be switched off or slowed, and counts its calls."""

    def __init__(self, delay_s: float = 0.0) -> None:
        self.down = False
        self.bug = False
        self.calls = 0
        self._delay_s = delay_s
        self._series = parse_hourly(json.loads(FIXTURE.read_text()))

    def __call__(self, _points: list[tuple[float, float, int]]) -> list[HourlySeries]:
        self.calls += 1
        time.sleep(self._delay_s)
        if self.bug:
            raise KeyError("a bug in our own code, not an upstream failure")
        if self.down:
            raise UpstreamError("open-meteo", "timeout")
        return self._series


@pytest.fixture
def upstream() -> Iterator[Upstream]:
    fake = Upstream()
    app.dependency_overrides[get_hourly_fetcher] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


def at(moment: datetime) -> None:
    app.dependency_overrides[get_now] = lambda: moment


def served(client: TestClient) -> set[str]:
    """The `asOf` times of the snow reports a request gets (which must be a 200)."""
    response = client.get("/api/snow")
    assert response.status_code == 200
    return {r["asOf"] for r in response.json()}


# --- the outage ---------------------------------------------------------------


def test_an_outage_serves_the_last_good_report_with_its_own_time(upstream: Upstream) -> None:
    at(SEVEN)
    assert TestClient(app).get("/api/snow").status_code == 200
    upstream.down = True
    at(SEVEN + HOUR)  # a new hour, so the hourly cache has nothing

    assert served(TestClient(app)) == {SEVEN_ISO}


def test_later_requests_in_an_outage_get_that_report_without_waiting(upstream: Upstream) -> None:
    at(SEVEN)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 200
    upstream.down = True
    at(SEVEN + HOUR)

    assert [served(client) for _ in range(3)] == [{SEVEN_ISO}] * 3
    assert upstream.calls == 2  # one good fetch, one failed; the other two didn't wait


def test_the_newest_good_report_is_the_one_served(upstream: Upstream) -> None:
    client = TestClient(app)
    at(SEVEN)
    assert client.get("/api/snow").status_code == 200
    at(SEVEN + HOUR)
    assert client.get("/api/snow").status_code == 200
    upstream.down = True
    at(SEVEN + 2 * HOUR)

    assert served(client) == {"2026-01-12T08:00:00+09:00"}


def test_an_outage_with_nothing_to_fall_back_on_is_still_an_error(upstream: Upstream) -> None:
    upstream.down = True
    at(SEVEN)

    response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert response.json() == {"error": "upstream_unavailable", "source": "open-meteo"}


def test_rank_keeps_its_snow_through_an_outage() -> None:
    # /api/rank reads snow through the real fetcher, so Open-Meteo itself is faked here
    with respx.mock() as openmeteo:
        openmeteo.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        assert len(get_snow_reports()) == 10
        openmeteo.get(OPEN_METEO_URL).respond(503)
        snow_router._cache.clear()  # pyright: ignore[reportPrivateUsage]  the hour is over

        assert len(get_snow_reports()) == 10  # was {}: the Drive list lost its snow


def test_a_failure_is_logged_once_with_its_cause(
    upstream: Upstream, caplog: pytest.LogCaptureFixture
) -> None:
    at(SEVEN)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 200
    upstream.down = True
    at(SEVEN + HOUR)

    with caplog.at_level(logging.WARNING, logger=snow_router.__name__):
        assert [served(client) for _ in range(3)] == [{SEVEN_ISO}] * 3

    # the one real failure, with why; not a line per request answered from the old report
    [message] = [r.getMessage() for r in caplog.records if r.name == snow_router.__name__]
    assert "open-meteo: timeout" in message


def test_a_bug_in_our_own_code_is_not_mistaken_for_an_outage(upstream: Upstream) -> None:
    at(SEVEN)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 200
    upstream.bug = True
    at(SEVEN + HOUR)

    with pytest.raises(KeyError):  # not answered from the old report as if all were well
        client.get("/api/snow")


# --- how long a failure is remembered, and how old a report may be --------------


def test_a_failure_is_not_retried_for_a_minute(upstream: Upstream) -> None:
    upstream.down = True
    at(HALF_PAST)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 502
    upstream.down = False  # it is back, but we don't ask yet
    at(HALF_PAST + RETRY_AFTER_FAILURE - timedelta(seconds=1))

    assert client.get("/api/snow").status_code == 502
    assert upstream.calls == 1


def test_the_upstream_is_tried_again_once_the_minute_is_over(upstream: Upstream) -> None:
    upstream.down = True
    at(HALF_PAST)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 502
    upstream.down = False
    at(HALF_PAST + RETRY_AFTER_FAILURE)

    assert client.get("/api/snow").status_code == 200
    assert upstream.calls == 2


def test_a_report_is_served_until_it_is_six_hours_old_and_no_longer(upstream: Upstream) -> None:
    at(SEVEN)
    client = TestClient(app)
    assert client.get("/api/snow").status_code == 200
    upstream.down = True

    at(SEVEN + STALE)
    assert served(client) == {SEVEN_ISO}
    at(SEVEN + STALE + timedelta(minutes=1))  # a minute later the failure is tried again too
    assert client.get("/api/snow").status_code == 502


# --- our own request budget is not an outage -----------------------------------


def test_our_own_budget_is_still_503_upstream_busy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", NO_BUDGET)
    with respx.mock(assert_all_called=False) as openmeteo:
        openmeteo.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        busy = TestClient(app).get("/api/snow")

    assert busy.status_code == 503
    assert busy.json() == {"error": "upstream_busy", "source": "open-meteo"}


def test_our_own_budget_serves_the_last_good_report_and_is_not_remembered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TestClient(app)
    with respx.mock() as openmeteo:
        route = openmeteo.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        at(SEVEN)
        assert client.get("/api/snow").status_code == 200
        monkeypatch.setattr(ratelimit, "LIMITS", NO_BUDGET)
        at(SEVEN + HOUR)
        assert served(client) == {SEVEN_ISO}  # not a 503: there is a report to serve
        monkeypatch.setattr(ratelimit, "LIMITS", Limits())  # the budget is back

        after = served(client)

    app.dependency_overrides.clear()
    assert after == {"2026-01-12T08:00:00+09:00"}  # Open-Meteo was never down
    assert route.call_count == 2


# --- requests that miss the cache together -------------------------------------


def test_requests_that_miss_the_cache_together_share_one_fetch() -> None:
    slow = Upstream(delay_s=0.05)

    def call(_: int) -> int:
        return len(get_snow(slow, SEVEN))

    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(call, range(8)))

    assert slow.calls == 1
    assert results == [10] * 8


def test_requests_that_arrive_during_a_failing_fetch_do_not_start_their_own() -> None:
    dead = Upstream(delay_s=0.05)
    dead.down = True

    def call(_: int) -> str:
        try:
            get_snow(dead, SEVEN)
        except UpstreamError as e:
            return e.source
        return "answered"

    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(call, range(8)))

    assert dead.calls == 1
    assert results == ["open-meteo"] * 8
