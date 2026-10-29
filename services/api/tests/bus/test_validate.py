from typing import Any

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.bus.store import load_stops, load_timetables
from hakuba_api.bus.validate import validate_bus

STOPS = [
    BusStop.model_validate(s)
    for s in [
        {
            "id": "stop-a",
            "name": {"en": "A", "ja": "あ"},
            "coord": {"lat": 36.7, "lng": 137.85},
            "servesResortId": None,
            "aliases": ["A", "A."],
            "coordSource": "manual",
        },
        {
            "id": "stop-b",
            "name": {"en": "B", "ja": None},
            "coord": None,
            "servesResortId": "happo-one",
            "aliases": ["B"],
            "coordSource": "unresolved",
        },
    ]
]
SOURCE_FILES = {"X.jpg"}


def timetable(**overrides: Any) -> Timetable:
    data: dict[str, Any] = {
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
        "reviewed": True,
        "directions": [
            {"id": "out", "stops": ["A", "B"], "trips": [{"n": 1, "times": ["08:00", "08:10"]}]}
        ],
    }
    data.update(overrides)
    return Timetable.model_validate(data)


def check(*tables: Timetable) -> list[str]:
    return validate_bus(STOPS, list(tables), SOURCE_FILES, {"happo-one"})


def test_valid_timetable_passes() -> None:
    assert check(timetable()) == []


def test_unknown_stop_name_fails() -> None:
    bad = timetable(directions=[{"id": "out", "stops": ["A", "Nowhere"], "trips": []}])

    assert check(bad) == ["x1/out: unknown stop 'Nowhere'"]


def test_times_going_backwards_fail() -> None:
    bad = timetable(
        directions=[
            {"id": "out", "stops": ["A", "B"], "trips": [{"n": 2, "times": ["08:10", "08:00"]}]}
        ]
    )

    assert check(bad) == ["x1/out trip 2: 08:00 at 'B' is earlier than 08:10"]


def test_equal_consecutive_times_are_allowed() -> None:
    same = timetable(
        directions=[
            {"id": "out", "stops": ["A", "B"], "trips": [{"n": 1, "times": ["08:00", "08:00"]}]}
        ]
    )

    assert check(same) == []


def test_trip_length_must_match_stops() -> None:
    bad = timetable(
        directions=[{"id": "out", "stops": ["A", "B"], "trips": [{"n": 1, "times": ["08:00"]}]}]
    )

    assert check(bad) == ["x1/out trip 1: 1 times for 2 stops"]


def test_trip_without_any_time_fails() -> None:
    bad = timetable(
        directions=[{"id": "out", "stops": ["A", "B"], "trips": [{"n": 1, "times": [None, None]}]}]
    )

    assert check(bad) == ["x1/out trip 1: no times"]


def test_overlapping_periods_of_one_route_fail() -> None:
    first = timetable(validFrom="2025-12-19", validTo="2026-01-31")
    second = timetable(validFrom="2026-01-15", validTo="2026-03-29")

    assert check(first, second) == [
        "x1: periods overlap (2025-12-19..2026-01-31, 2026-01-15..2026-03-29)"
    ]


def test_inverted_period_fails() -> None:
    assert check(timetable(validFrom="2026-03-29", validTo="2025-12-19")) == [
        "x1: validFrom after validTo"
    ]


def test_source_must_be_a_tracked_asset() -> None:
    assert check(timetable(source={"file": "Y.jpg"})) == ["x1: source Y.jpg not in sources.json"]


def test_stop_serving_unknown_resort_fails() -> None:
    stops = [STOPS[0].model_copy(update={"serves_resort_id": "atlantis"})]

    errors = validate_bus(stops, [], SOURCE_FILES, {"happo-one"})

    assert errors == ["stop-a: unknown resort atlantis"]


def test_alias_used_by_two_stops_fails() -> None:
    stops = [STOPS[0], STOPS[1].model_copy(update={"aliases": ["B", "A"]})]

    errors = validate_bus(stops, [], SOURCE_FILES, {"happo-one"})

    assert errors == ["alias 'A' belongs to stop-a and stop-b"]


def test_repository_bus_data_is_valid() -> None:
    from hakuba_api.bus.validate import validate_repository

    assert validate_repository() == []
    assert len(load_stops()) >= 90
    assert isinstance(load_timetables(), list)
