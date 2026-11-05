from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from hakuba_api.catalog.store import get_resort
from hakuba_api.crowd.heuristic import HeuristicCrowdSource, load_periods
from hakuba_api.crowd.router import get_snow_by_resort, get_today
from hakuba_api.main import app
from hakuba_api.snow.models import NewSnow, SnowDepth, SnowReport, SummitTemps

JST = ZoneInfo("Asia/Tokyo")
source = HeuristicCrowdSource(load_periods())


def snow(
    resort_id: str, as_of: date, past24h: float | None, next24h: float | None = 0
) -> SnowReport:
    return SnowReport(
        resort_id=resort_id,
        as_of=datetime(as_of.year, as_of.month, as_of.day, 7, tzinfo=JST),
        depth_cm=SnowDepth(base=100, summit=200, source="model"),
        new_snow_cm=NewSnow(past24h=past24h, past72h=past24h, next24h=next24h, next72h=next24h),
        temp_c=SummitTemps(summit_min=-10, summit_max=-5),
    )


def resort(resort_id: str) -> Any:
    found = get_resort(resort_id)
    assert found is not None
    return found


def test_quiet_midweek_at_a_small_resort_is_low() -> None:
    day = date(2026, 1, 14)  # Wednesday

    estimate = source.estimate(resort("jigatake"), day, snow("jigatake", day, past24h=0))

    assert estimate.level == "low"
    assert estimate.is_estimate is True
    assert estimate.source == "heuristic"


def test_lunar_new_year_powder_saturday_at_happo_is_very_high() -> None:
    day = date(2026, 2, 21)  # Saturday, Lunar New Year week, then the Feb 23 holiday

    estimate = source.estimate(resort("happo-one"), day, snow("happo-one", day, past24h=30))

    assert estimate.level == "very_high"
    assert "Lunar New Year week" in estimate.reasons
    assert "Powder day (30 cm new)" in estimate.reasons
    assert "Large, popular resort" in estimate.reasons


def test_three_day_weekend_beats_a_plain_saturday() -> None:
    long_weekend = source.estimate(resort("goryu"), date(2026, 2, 21), None)  # Sat-Mon
    plain = source.estimate(resort("goryu"), date(2026, 2, 7), None)  # ordinary Sat

    assert "3-day weekend (Emperor's Birthday)" in long_weekend.reasons
    assert "Saturday" in plain.reasons
    assert long_weekend.score > plain.score


def test_public_holiday_is_named_in_english() -> None:
    midweek = source.estimate(resort("goryu"), date(2026, 2, 11), None)  # Wed
    long_weekend = source.estimate(resort("goryu"), date(2026, 1, 12), None)  # Mon

    assert "Public holiday (Foundation Day)" in midweek.reasons
    assert "3-day weekend (Coming of Age Day)" in long_weekend.reasons


def test_early_season_lowers_the_score() -> None:
    early = source.estimate(resort("happo-one"), date(2025, 12, 10), None)  # Wednesday
    later = source.estimate(resort("happo-one"), date(2026, 1, 28), None)  # Wednesday

    assert "Early/late season" in early.reasons
    assert early.score < later.score


def test_powder_uses_tomorrows_forecast_for_tomorrow() -> None:
    today = date(2026, 1, 20)

    estimate = source.estimate(
        resort("happo-one"), date(2026, 1, 21), snow("happo-one", today, past24h=0, next24h=25)
    )

    assert "Powder day (25 cm new)" in estimate.reasons


def test_snow_far_from_the_date_is_ignored() -> None:
    estimate = source.estimate(
        resort("happo-one"), date(2026, 1, 28), snow("happo-one", date(2026, 1, 20), past24h=40)
    )

    assert not any(r.startswith("Powder") for r in estimate.reasons)


def test_missing_snow_values_do_not_count_as_powder() -> None:
    day = date(2026, 1, 20)

    estimate = source.estimate(resort("happo-one"), day, snow("happo-one", day, past24h=None))

    assert not any(r.startswith("Powder") for r in estimate.reasons)


DRAW_REASONS = {"Large, popular resort", "Moderately popular resort", "Less-visited resort"}


@pytest.mark.parametrize(
    ("resort_id", "draw"),
    [
        ("happo-one", "Large, popular resort"),
        ("hakuba47", "Moderately popular resort"),
        ("norikura", "Less-visited resort"),
        ("jigatake", None),  # prior 0 adds nothing, so there is nothing to explain
    ],
)
def test_every_nonzero_resort_prior_is_a_reason(resort_id: str, draw: str | None) -> None:
    day = date(2026, 2, 16)  # Monday in Lunar New Year week

    estimate = source.estimate(resort(resort_id), day, None)

    assert [r for r in estimate.reasons if r in DRAW_REASONS] == ([draw] if draw else [])


def test_is_deterministic() -> None:
    args = (resort("tsugaike"), date(2026, 2, 21), snow("tsugaike", date(2026, 2, 21), 22))

    assert source.estimate(*args) == source.estimate(*args)


@pytest.mark.parametrize(
    ("score", "level"),
    [(0.0, "low"), (0.29, "low"), (0.3, "medium"), (0.55, "high"), (0.8, "very_high")],
)
def test_level_thresholds(score: float, level: str) -> None:
    from hakuba_api.crowd.heuristic import level_for

    assert level_for(score) == level


def test_periods_file_is_valid_and_ordered() -> None:
    periods = load_periods()

    assert len(periods) >= 6
    assert all(p.start <= p.end for p in periods)


# --- endpoint -----------------------------------------------------------------


@pytest.fixture
def api() -> Any:
    app.dependency_overrides[get_today] = lambda: date(2026, 2, 21)
    app.dependency_overrides[get_snow_by_resort] = lambda: {}
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_crowd_endpoint_returns_every_resort(api: TestClient) -> None:
    response = api.get("/api/crowd", params={"date": "2026-02-21"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 10
    assert {"resortId", "date", "level", "score", "reasons", "isEstimate"} <= body[0].keys()


def test_crowd_endpoint_defaults_to_today(api: TestClient) -> None:
    response = api.get("/api/crowd")

    assert response.json()[0]["date"] == "2026-02-21"


def test_crowd_endpoint_honours_the_date_parameter(api: TestClient) -> None:
    response = api.get("/api/crowd", params={"date": "2026-01-14"})

    assert response.json()[0]["date"] == "2026-01-14"
