from collections.abc import Iterator

import pytest
import respx

from hakuba_api.bus.locate_stops import (
    GSI_URL,
    RouteLeg,
    find_violations,
    geocode_gsi,
    legs_from_timetables,
)
from hakuba_api.bus.models import Timetable
from hakuba_api.common.geo import Coord


@pytest.fixture
def gsi() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def feature(title: str, lng: float, lat: float) -> dict[str, object]:
    return {"geometry": {"coordinates": [lng, lat]}, "properties": {"title": title}}


def test_geocode_accepts_lot_level_match(gsi: respx.MockRouter) -> None:
    gsi.get(GSI_URL).respond(json=[feature("長野県白馬村北城２９３７番地", 137.8501, 36.6852)])

    coord = geocode_gsi("長野県北安曇郡白馬村北城2937")

    assert coord == Coord(lat=36.6852, lng=137.8501)


def test_geocode_rejects_district_fallback(gsi: respx.MockRouter) -> None:
    # GSI quietly returns the district centroid when it doesn't know the lot
    gsi.get(GSI_URL).respond(json=[feature("長野県白馬村北城", 137.8386, 36.7084)])

    assert geocode_gsi("長野県北安曇郡白馬村大字北城5020") is None


def test_geocode_handles_no_result(gsi: respx.MockRouter) -> None:
    gsi.get(GSI_URL).respond(json=[])

    assert geocode_gsi("長野県北安曇郡白馬村北城1") is None


def timetable(stops: list[str], times: list[str | None]) -> Timetable:
    return Timetable.model_validate(
        {
            "lineId": "line-x",
            "routeId": "x1",
            "season": "2025-26",
            "kind": "day",
            "name": {"en": "X", "ja": "X"},
            "validFrom": "2025-12-19",
            "validTo": "2026-03-29",
            "serviceDays": "daily",
            "fare": {"adultJpy": 800, "childJpy": 400, "hvPassFree": True},
            "source": {"file": "X.jpg"},
            "reviewed": False,
            "directions": [{"id": "out", "stops": stops, "trips": [{"n": 1, "times": times}]}],
        }
    )


ALIAS = {"A": "stop-a", "B": "stop-b", "C": "stop-c"}


def test_legs_carry_the_scheduled_gap() -> None:
    legs = legs_from_timetables([timetable(["A", "B", "C"], ["08:00", "08:05", None])], ALIAS)

    assert RouteLeg("stop-a", "stop-b", 5 * 60) in legs
    assert RouteLeg("stop-b", "stop-c", None) in legs


def test_drive_slower_than_the_bus_blames_the_new_stop() -> None:
    legs = [RouteLeg("stop-a", "stop-b", 5 * 60)]
    coords = {"stop-a": Coord(lat=36.70, lng=137.85), "stop-b": Coord(lat=36.60, lng=137.85)}

    violations = find_violations(
        legs, coords, new={"stop-b"}, drive_s=lambda a, b: 25 * 60, serves_resort=set()
    )

    assert set(violations) == {"stop-b"}
    assert "scheduled 5 min" in violations["stop-b"]


def test_drive_within_the_schedule_passes() -> None:
    legs = [RouteLeg("stop-a", "stop-b", 5 * 60)]
    coords = {"stop-a": Coord(lat=36.70, lng=137.85), "stop-b": Coord(lat=36.69, lng=137.85)}

    assert find_violations(legs, coords, {"stop-b"}, lambda a, b: 6 * 60, set()) == {}


def test_untimed_neighbours_far_apart_are_flagged() -> None:
    legs = [RouteLeg("stop-a", "stop-b", None)]
    coords = {"stop-a": Coord(lat=36.70, lng=137.85), "stop-b": Coord(lat=36.55, lng=137.85)}

    violations = find_violations(legs, coords, {"stop-b"}, lambda a, b: 0, set())

    assert "km from its neighbour" in violations["stop-b"]


def test_long_final_leg_to_a_resort_is_allowed() -> None:
    legs = [RouteLeg("stop-a", "stop-b", None)]
    coords = {"stop-a": Coord(lat=36.70, lng=137.85), "stop-b": Coord(lat=36.55, lng=137.85)}

    assert find_violations(legs, coords, {"stop-a"}, lambda a, b: 0, {"stop-b"}) == {}


def test_trusted_pairs_are_never_blamed() -> None:
    legs = [RouteLeg("stop-a", "stop-b", 60)]
    coords = {"stop-a": Coord(lat=36.70, lng=137.85), "stop-b": Coord(lat=36.60, lng=137.85)}

    assert find_violations(legs, coords, set(), lambda a, b: 3600, set()) == {}


def test_points_shared_by_different_lots_are_ambiguous() -> None:
    from hakuba_api.bus.locate_stops import ambiguous_points

    same = Coord(lat=36.69338, lng=137.83951)
    found = {
        "stop-a": (same, "北城2937"),
        "stop-b": (same, "北城3477"),
        "stop-c": (same, "北城2937-730"),  # same parent lot as stop-a: not evidence of ambiguity
        "stop-d": (Coord(lat=36.69922, lng=137.845), "北城3322-1"),
    }

    assert ambiguous_points(found) == {"stop-a", "stop-b", "stop-c"}


def test_points_shared_only_within_one_lot_are_fine() -> None:
    from hakuba_api.bus.locate_stops import ambiguous_points

    same = Coord(lat=36.68485, lng=137.84943)
    found = {"stop-a": (same, "北城828-11"), "stop-b": (same, "北城828-356")}

    assert ambiguous_points(found) == set()


def test_gsi_point_needs_a_trusted_stop_nearby_on_its_routes() -> None:
    from hakuba_api.bus.locate_stops import uncorroborated

    routes = [["stop-new", "stop-trusted-near"], ["stop-far-new", "stop-trusted-far"]]
    trusted = {
        "stop-trusted-near": Coord(lat=36.684, lng=137.852),
        "stop-trusted-far": Coord(lat=36.700, lng=137.840),
    }
    candidates = {
        "stop-new": Coord(lat=36.6849, lng=137.8494),  # ~250 m away
        "stop-far-new": Coord(lat=36.6696, lng=137.8467),  # ~3.5 km away
    }

    assert uncorroborated(candidates, trusted, routes) == {"stop-far-new"}
