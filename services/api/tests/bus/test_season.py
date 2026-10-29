"""Season projection: serve last season's timetable, labelled Expected, until the new one is out."""

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from hakuba_api.bus.models import Timetable
from hakuba_api.bus.query import BusResult, bus_options, night_departures
from hakuba_api.bus.router import get_bus_data, get_manifest_season, get_walks
from hakuba_api.bus.season import effective_timetables, next_service_date, shift_years
from hakuba_api.bus.store import load_stops, load_timetables
from hakuba_api.main import app

JST = ZoneInfo("Asia/Tokyo")
STOPS = {s.id: s for s in load_stops()}
ALIAS = {a: s.id for s in STOPS.values() for a in s.aliases}
ALL = load_timetables()  # the real 2025-26 data, all reviewed
DAY = [t for t in ALL if t.kind == "day"]


def test_in_season_date_uses_the_published_timetables() -> None:
    projection = effective_timetables(date(2026, 3, 20), DAY)

    assert projection.basis == "published"
    assert projection.season == "2025-26"
    assert all(t.valid_from <= date(2026, 3, 20) <= t.valid_to for t in projection.tables)
    assert {t.route_id for t in projection.tables} >= {"v2", "e1", "f1"}


def test_next_season_is_projected_from_the_latest_transcribed_one() -> None:
    expected = effective_timetables(date(2027, 1, 15), DAY)
    published = effective_timetables(date(2026, 1, 15), DAY)

    assert expected.basis == "expected"
    assert expected.season == "2025-26"
    assert [t.route_id for t in expected.tables] == [t.route_id for t in published.tables]
    assert [t.directions for t in expected.tables] == [t.directions for t in published.tables]
    assert all(t.valid_from.year == 2026 and t.valid_to.year == 2027 for t in expected.tables)


def test_summer_has_no_service_and_names_the_projected_start() -> None:
    assert effective_timetables(date(2026, 7, 1), DAY).tables == []
    assert next_service_date(date(2026, 7, 1), DAY) == (date(2026, 12, 13), "expected")
    assert next_service_date(date(2026, 11, 30), DAY) == (date(2026, 12, 13), "expected")


def test_published_next_date_wins_over_a_projected_one() -> None:
    v2 = next(t for t in DAY if t.route_id == "v2" and t.valid_from == date(2026, 3, 16))

    assert next_service_date(date(2026, 1, 10), [v2]) == (date(2026, 3, 16), "published")


def test_shifting_a_leap_day_lands_on_feb_28() -> None:
    v2 = next(t for t in DAY if t.route_id == "v2" and t.valid_from == date(2026, 3, 16))
    leap = v2.model_copy(update={"valid_from": date(2028, 2, 29), "valid_to": date(2028, 3, 31)})

    shifted = shift_years(leap, 1)

    assert (shifted.valid_from, shifted.valid_to) == (date(2029, 2, 28), date(2029, 3, 31))


def test_unreviewed_timetables_are_never_projected() -> None:
    draft = [t.model_copy(update={"reviewed": False}) for t in DAY]

    assert effective_timetables(date(2027, 1, 15), draft).tables == []


# --- through the query ---------------------------------------------------------


def _times(result: BusResult) -> list[tuple[str, str]]:
    return [
        (o.resort_id, o.departs_at.strftime("%H:%M")) for r in result.resorts for o in r.options
    ]


def test_expected_query_gives_last_seasons_times_on_the_requested_day() -> None:
    walks = {"stop-happo-bus-terminal": 0}
    now = bus_options(walks, datetime(2026, 1, 15, 8, 0, tzinfo=JST), ALL, STOPS, ALIAS)
    later = bus_options(walks, datetime(2027, 1, 15, 8, 0, tzinfo=JST), ALL, STOPS, ALIAS)

    assert (now.basis, later.basis) == ("published", "expected")
    assert later.based_on_season == "2025-26"
    assert _times(later) == _times(now)
    assert later.resorts[0].options[0].departs_at.year == 2027


def test_no_service_result_carries_basis_and_next_date() -> None:
    result = bus_options({}, datetime(2026, 10, 30, 8, 0, tzinfo=JST), ALL, STOPS, ALIAS)

    assert result.status == "no_service"
    assert result.next_service_date == date(2026, 12, 13)
    assert result.basis == "expected"


def test_night_bus_is_projected_too() -> None:
    walks = {"stop-happo-bus-terminal": 120}
    now = night_departures(walks, datetime(2026, 1, 20, 17, 0, tzinfo=JST), ALL, STOPS, ALIAS)
    later = night_departures(walks, datetime(2027, 1, 20, 17, 0, tzinfo=JST), ALL, STOPS, ALIAS)

    assert [d.departs_at.strftime("%H:%M") for d in later.departures] == [
        d.departs_at.strftime("%H:%M") for d in now.departures
    ]
    assert later.departures[0].departs_at.year == 2027
    assert (now.basis, later.basis) == ("published", "expected")


# --- endpoint: newer timetable published but not transcribed yet ---------------


def test_endpoint_flags_a_newer_season_on_the_operator_page() -> None:
    def walks() -> dict[str, int]:
        return {"stop-happo-bus-terminal": 0}

    def data() -> list[Timetable]:
        return ALL

    def newer() -> str:
        return "2026-27"

    app.dependency_overrides[get_walks] = walks
    app.dependency_overrides[get_bus_data] = data
    app.dependency_overrides[get_manifest_season] = newer
    try:
        body: Any = (
            TestClient(app)
            .get(
                "/api/bus/options",
                params={"from": "36.7015,137.8456", "at": "2027-01-15T08:00:00+09:00"},
            )
            .json()
        )
    finally:
        app.dependency_overrides.clear()

    assert body["basis"] == "expected"
    assert body["basedOnSeason"] == "2025-26"
    assert body["newerSourcePending"] is True


# --- review findings (2026-10-30 adversarial review) -----------------------------


def _as_season(table: Timetable, season: str, years: int) -> Timetable:
    return shift_years(table, years).model_copy(update={"season": season, "reviewed": True})


def test_a_partly_transcribed_new_season_keeps_projecting_the_other_lines() -> None:
    v1_next = _as_season(next(t for t in DAY if t.route_id == "v1"), "2026-27", 1)

    mixed = effective_timetables(date(2027, 1, 15), [*DAY, v1_next])
    published_last_year = effective_timetables(date(2026, 1, 15), DAY)

    assert mixed.basis == "expected"  # some lines are still projections
    assert {t.route_id for t in mixed.tables} == {t.route_id for t in published_last_year.tables}
    v1 = next(t for t in mixed.tables if t.route_id == "v1")
    assert (v1.season, v1.valid_from.year) == ("2026-27", 2026)  # the real one, not a shift


def test_a_line_missing_for_two_seasons_is_not_projected_any_more() -> None:
    v1_later = _as_season(next(t for t in DAY if t.route_id == "v1"), "2027-28", 2)

    projection = effective_timetables(date(2028, 1, 15), [*DAY, v1_later])

    assert [t.route_id for t in projection.tables] == ["v1"]
    assert projection.basis == "published"


def test_never_projects_backwards_into_the_past() -> None:
    assert effective_timetables(date(2025, 1, 15), DAY).tables == []
    assert next_service_date(date(2025, 1, 15), DAY) == (date(2025, 12, 13), "published")


def test_far_future_dates_project_and_name_the_next_start() -> None:
    assert effective_timetables(date(2030, 1, 15), DAY).basis == "expected"
    assert next_service_date(date(2029, 7, 1), DAY) == (date(2029, 12, 13), "expected")


@pytest.mark.parametrize("season", ["2026-2027", "2025-27", "25-26", "2025"])
def test_season_strings_are_validated(season: str) -> None:
    raw = DAY[0].model_dump()
    raw["season"] = season

    with pytest.raises(ValidationError):
        Timetable.model_validate(raw)


def test_newer_source_only_matters_while_projecting() -> None:
    walks = {"stop-happo-bus-terminal": 0}
    kw: dict[str, Any] = {"newer_source_pending": True}
    march = bus_options(walks, datetime(2026, 3, 20, 8, 0, tzinfo=JST), ALL, STOPS, ALIAS, **kw)
    january = bus_options(walks, datetime(2027, 1, 15, 8, 0, tzinfo=JST), ALL, STOPS, ALIAS, **kw)

    assert (march.basis, march.newer_source_pending) == ("published", False)
    assert (january.basis, january.newer_source_pending) == ("expected", True)


def test_endpoint_flag_ignores_unreviewed_transcriptions() -> None:
    """2026-27 transcribed but not reviewed: still projected from 2025-26, and flagged."""
    drafts = [
        shift_years(t, 1).model_copy(update={"season": "2026-27", "reviewed": False}) for t in ALL
    ]

    def walks() -> dict[str, int]:
        return {"stop-happo-bus-terminal": 0}

    def data() -> list[Timetable]:
        return [*ALL, *drafts]

    def manifest() -> str:
        return "2026-27"

    app.dependency_overrides[get_walks] = walks
    app.dependency_overrides[get_bus_data] = data
    app.dependency_overrides[get_manifest_season] = manifest
    try:
        body: Any = (
            TestClient(app)
            .get(
                "/api/bus/options",
                params={"from": "36.7015,137.8456", "at": "2027-01-15T08:00:00+09:00"},
            )
            .json()
        )
        night: Any = (
            TestClient(app)
            .get(
                "/api/bus/night",
                params={"from": "36.7015,137.8456", "at": "2027-01-20T17:00:00+09:00"},
            )
            .json()
        )
    finally:
        app.dependency_overrides.clear()

    assert body["status"] == "ok"
    assert (body["basis"], body["basedOnSeason"], body["newerSourcePending"]) == (
        "expected",
        "2025-26",
        True,
    )
    assert (night["basis"], night["newerSourcePending"]) == ("expected", True)
    assert night["departures"][0]["departsAt"].startswith("2027-01-20T17:")
