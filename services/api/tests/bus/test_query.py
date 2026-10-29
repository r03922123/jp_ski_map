import json
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from hakuba_api.bus.models import Timetable
from hakuba_api.bus.query import bus_options, night_departures
from hakuba_api.bus.router import get_bus_data, get_walks
from hakuba_api.bus.store import load_stops
from hakuba_api.data.paths import data_dir
from hakuba_api.main import app

JST = ZoneInfo("Asia/Tokyo")
TIMETABLES = data_dir() / "bus" / "timetables" / "2025-26"


def table(name: str, reviewed: bool = True) -> Timetable:
    data: dict[str, Any] = json.loads((TIMETABLES / f"{name}.json").read_text())
    data["reviewed"] = reviewed
    return Timetable.model_validate(data)


STOPS = {s.id: s for s in load_stops()}
ALIAS = {a: s.id for s in STOPS.values() for a in s.aliases}
AT = datetime(2026, 3, 20, 8, 0, tzinfo=JST)


def options(walks: dict[str, int], tables: list[Timetable], at: datetime = AT) -> Any:
    return bus_options(walks, at, tables, STOPS, ALIAS)


def test_spec_example_happo_bus_terminal_to_hakuba47_on_v2() -> None:
    result = options({"stop-happo-bus-terminal": 0}, [table("line-v-v2")])

    assert result.status == "ok"
    hakuba47 = next(r for r in result.resorts if r.resort_id == "hakuba47")
    first, second = hakuba47.options[:2]
    assert (first.departs_at.strftime("%H:%M"), first.arrives_at.strftime("%H:%M")) == (  # type: ignore[union-attr]
        "08:11",
        "08:39",
    )
    assert (second.departs_at.strftime("%H:%M"), second.arrives_at.strftime("%H:%M")) == (  # type: ignore[union-attr]
        "09:48",
        "10:16",
    )
    assert first.ride_s == 28 * 60
    assert first.timed is True
    assert first.board_stop_coord == STOPS["stop-happo-bus-terminal"].coord


def test_walk_time_rules_out_buses_you_cannot_reach() -> None:
    result = options({"stop-happo-bus-terminal": 15 * 60}, [table("line-v-v2")])

    hakuba47 = next(r for r in result.resorts if r.resort_id == "hakuba47")
    assert hakuba47.options[0].departs_at.strftime("%H:%M") == "09:48"
    # reach the stop at 08:15, then wait for the 09:48 bus
    assert hakuba47.options[0].wait_s == (9 * 60 + 48 - (8 * 60 + 15)) * 60


def test_at_most_three_options_per_resort_sorted_by_arrival() -> None:
    result = options({"stop-happo-bus-terminal": 0}, [table("line-v-v2")])

    for resort in result.resorts:
        arrivals = [o.arrives_at for o in resort.options]
        assert len(arrivals) <= 3
        assert arrivals == sorted(arrivals)  # type: ignore[type-var]


def test_one_trip_counts_once_per_resort_using_the_closest_stop() -> None:
    walks = {"stop-happo-bus-terminal": 300, "stop-jr-hakuba": 60}

    result = options(walks, [table("line-v-v2")], at=datetime(2026, 3, 20, 9, 30, tzinfo=JST))

    goryu = next(r for r in result.resorts if r.resort_id == "goryu")
    trips = [(o.route_id, o.trip) for o in goryu.options]
    assert len(trips) == len(set(trips))


def test_untimed_routes_rank_after_timed_and_say_so() -> None:
    # F1: only the Hotel Oak Forest departure is published
    walks = {"stop-hotel-oak-forest": 120}
    at = datetime(2026, 1, 14, 7, 30, tzinfo=JST)

    result = options(walks, [table("line-f-f1")], at=at)

    hakuba47 = next(r for r in result.resorts if r.resort_id == "hakuba47")
    first = hakuba47.options[0]
    assert first.timed is False
    assert first.departs_at.strftime("%H:%M") == "08:00"
    assert first.arrives_at is None
    assert first.first_stop_name == "Hotel Oak Forest"


def test_out_of_season_reports_next_service_date() -> None:
    result = options(
        {"stop-happo-bus-terminal": 0},
        [table("line-v-v2")],
        at=datetime(2026, 1, 10, 8, 0, tzinfo=JST),
    )

    assert result.status == "no_service"
    assert result.next_service_date == date(2026, 3, 16)
    assert result.resorts == []


def test_unreviewed_timetables_are_never_used() -> None:
    result = options({"stop-happo-bus-terminal": 0}, [table("line-v-v2", reviewed=False)])

    assert result.status == "awaiting_review"
    assert result.resorts == []


def test_night_bus_is_kept_out_of_resort_options() -> None:
    result = options(
        {"stop-happo-bus-terminal": 0},
        [table("line-vn")],
        at=datetime(2026, 1, 20, 17, 0, tzinfo=JST),
    )

    assert result.resorts == []


def test_night_departures_from_nearest_stops() -> None:
    departures = night_departures(
        {"stop-happo-bus-terminal": 120},
        datetime(2026, 1, 20, 17, 0, tzinfo=JST),
        [table("line-vn")],
        STOPS,
        ALIAS,
    )

    assert [d.departs_at.strftime("%H:%M") for d in departures][:2] == ["17:08", "17:50"]
    assert departures[0].towards == "JR Hakuba Station"


# --- endpoint -----------------------------------------------------------------


@pytest.fixture
def api() -> Any:
    def walks() -> dict[str, int]:
        return {"stop-happo-bus-terminal": 0}

    def data() -> list[Timetable]:
        return [table("line-v-v2")]

    app.dependency_overrides[get_walks] = walks
    app.dependency_overrides[get_bus_data] = data
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_bus_options_endpoint(api: TestClient) -> None:
    response = api.get(
        "/api/bus/options", params={"from": "36.7015,137.8456", "at": "2026-03-20T08:00:00+09:00"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    hakuba47 = next(r for r in body["resorts"] if r["resortId"] == "hakuba47")
    assert hakuba47["options"][0]["departsAt"] == "2026-03-20T08:11:00+09:00"
    assert hakuba47["options"][0]["boardStopName"] == "Hakuba Happo Bus Terminal"


# --- "your hotel is the stop" ---------------------------------------------------


def test_hotel_name_matches_its_pickup_stop_in_english_or_japanese() -> None:
    from hakuba_api.bus.router import stops_named

    stops = list(STOPS.values())

    assert stops_named("Hakuba Tokyu Hotel", stops) == {"stop-hakuba-tokyu-hotel"}
    assert stops_named("白馬東急ホテル", stops) == {"stop-hakuba-tokyu-hotel"}
    assert stops_named("Double Black Hotel Hakuba", stops) == {"stop-double-black-hotel"}
    assert stops_named("Some Other Pension", stops) == set()
    assert stops_named("Hotel Cultured", stops) == {"stop-cultured"}
    assert stops_named("Sierra Resort Hakuba", stops) == {"stop-sierra-resort-hotel-hakuba"}


@pytest.mark.parametrize(
    "lookalike",
    ["Kokoro Hotel Hakuba", "Hotel Hakuba Berg-land", "マウントサイド ヨーデル", "ブルーマウント"],
)
def test_lookalike_hotels_do_not_claim_someone_elses_stop(lookalike: str) -> None:
    from hakuba_api.bus.router import stops_named

    assert stops_named(lookalike, list(STOPS.values())) == set()


def test_matching_hotel_stop_is_walk_zero_even_without_coordinates() -> None:
    from hakuba_api.bus.router import get_walks
    from hakuba_api.common.geo import Coord
    from hakuba_api.routing.models import MatrixCell, Mode

    class FarValhalla:
        def matrix(
            self, mode: Mode, origin: Coord, targets: list[tuple[str, Coord]]
        ) -> list[MatrixCell]:
            return [MatrixCell(id=t, duration_s=3600, distance_m=5000) for t, _ in targets]

    walks = get_walks("36.7,137.84", FarValhalla(), name="Double Black Hotel")  # type: ignore[arg-type]

    assert STOPS["stop-double-black-hotel"].coord is None
    assert walks["stop-double-black-hotel"] == 0
