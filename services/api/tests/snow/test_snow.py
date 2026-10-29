import json
from collections.abc import Sequence
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from hakuba_api.main import app
from hakuba_api.snow.compute import HourlySeries, build_report, parse_series
from hakuba_api.snow.router import get_hourly_fetcher, get_now

JST = ZoneInfo("Asia/Tokyo")
FIXTURE = Path(__file__).parents[1] / "fixtures" / "openmeteo" / "winter_week.json"


def series(
    snowfall: Sequence[float | None],
    depth_m: float | None = 1.0,
    temperature: float | None = -5.0,
) -> HourlySeries:
    start = datetime(2026, 1, 10, 0, tzinfo=JST)
    n = len(snowfall)
    return HourlySeries(
        times=[start + timedelta(hours=i) for i in range(n)],
        snowfall_cm=list(snowfall),
        snow_depth_m=[depth_m] * n,
        temperature_c=[temperature] * n,
    )


NOW = datetime(2026, 1, 13, 0, tzinfo=JST)  # index 72 in the synthetic series


def test_sums_new_snow_in_past_and_next_windows() -> None:
    # 1 cm/h for the 72 h before "now", 2 cm/h for the 72 h after
    summit = series([1.0] * 73 + [2.0] * 72)
    summit.snowfall_cm[72] = 1.0  # the hour ending at "now" belongs to the past

    report = build_report("happo-one", base=series([0.0] * 145), summit=summit, now=NOW)

    assert report.new_snow_cm.past24h == 24
    assert report.new_snow_cm.past72h == 72
    assert report.new_snow_cm.next24h == 48
    assert report.new_snow_cm.next72h == 144


def test_converts_snow_depth_from_metres_to_cm() -> None:
    report = build_report(
        "happo-one",
        base=series([0.0] * 145, depth_m=0.41),
        summit=series([0.0] * 145, depth_m=2.8),
        now=NOW,
    )

    assert report.depth_cm.base == 41
    assert report.depth_cm.summit == 280
    assert report.depth_cm.source == "model"


def test_a_missing_hour_makes_the_window_null_not_zero() -> None:
    summit = series([1.0] * 145)
    summit.snowfall_cm[60] = None  # inside the past 24 h

    report = build_report("happo-one", base=series([0.0] * 145), summit=summit, now=NOW)

    assert report.new_snow_cm.past24h is None
    assert report.new_snow_cm.next24h == 24


def test_missing_depth_stays_null() -> None:
    report = build_report(
        "happo-one",
        base=series([0.0] * 145, depth_m=None),
        summit=series([0.0] * 145),
        now=NOW,
    )

    assert report.depth_cm.base is None


def test_window_past_the_end_of_data_is_null() -> None:
    summit = series([1.0] * 80)  # only 8 h of forecast after now

    report = build_report("happo-one", base=series([0.0] * 80), summit=summit, now=NOW)

    assert report.new_snow_cm.next24h is None


def test_summit_temperature_range_over_next_24h() -> None:
    summit = series([0.0] * 145)
    summit.temperature_c[80] = -14.0
    summit.temperature_c[90] = -2.5

    report = build_report("happo-one", base=series([0.0] * 145), summit=summit, now=NOW)

    assert (report.temp_c.summit_min, report.temp_c.summit_max) == (-14.0, -2.5)


def test_parses_open_meteo_location() -> None:
    raw = json.loads(FIXTURE.read_text())[0]

    parsed = parse_series(raw)

    assert len(parsed.times) == 168
    assert parsed.times[0] == datetime(2026, 1, 9, 0, tzinfo=JST)


# --- endpoint, fed by the recorded January week ------------------------------


@pytest.fixture
def api() -> Any:
    fixture: list[dict[str, Any]] = json.loads(FIXTURE.read_text())

    def fetch(_points: list[tuple[float, float, int]]) -> list[dict[str, Any]]:
        return fixture

    app.dependency_overrides[get_hourly_fetcher] = lambda: fetch
    app.dependency_overrides[get_now] = lambda: datetime(2026, 1, 12, 7, tzinfo=JST)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_snow_endpoint_reports_every_resort(api: TestClient) -> None:
    response = api.get("/api/snow")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 10
    happo = next(r for r in body if r["resortId"] == "happo-one")
    assert happo["asOf"] == "2026-01-12T07:00:00+09:00"
    assert happo["depthCm"]["summit"] >= happo["depthCm"]["base"]
    assert happo["newSnowCm"]["past72h"] >= happo["newSnowCm"]["past24h"]


@pytest.mark.live
def test_live_open_meteo_returns_a_report_per_resort() -> None:
    from hakuba_api.snow.openmeteo import fetch_hourly
    from hakuba_api.snow.router import snow_reports

    reports = snow_reports(fetch_hourly, datetime.now(JST))

    assert len(reports) == 10
    assert all(r.temp_c.summit_min is not None for r in reports)
