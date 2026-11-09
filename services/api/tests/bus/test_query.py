import json
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.bus.query import bus_options, bus_options_to_place, night_departures
from hakuba_api.bus.router import get_bus_data, get_walks, get_walks_to
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


def test_option_lists_the_stops_of_the_ride_in_order() -> None:
    result = options({"stop-happo-bus-terminal": 0}, [table("line-v-v2")])

    first = next(r for r in result.resorts if r.resort_id == "hakuba47").options[0]
    ride = first.ride_stops
    assert ride[0].stop_id == first.board_stop_id
    assert ride[-1].stop_id == first.alight_stop_id
    assert [r.time for r in ride] == ["08:11", "08:16", "08:24", "08:39"]
    assert [r.name for r in ride][1] == STOPS[ride[1].stop_id].name.en
    assert all(r.coord is not None for r in ride)


def test_untimed_ride_stops_have_no_times() -> None:
    result = options({ALIAS["Hotel Hakuba"]: 60}, [table("line-g-g1")])

    option = next(o for r in result.resorts for o in r.options if not o.timed)
    assert option.ride_stops[0].stop_id == option.board_stop_id
    assert option.ride_stops[0].time is None
    assert len(option.ride_stops) >= 2


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


# Live iPhone QA (2026-11-02): resorts came alphabetically (Cortina, 48 min, first). Like
# Google Maps transit, the resort you can reach soonest comes first.
def test_resorts_are_listed_by_their_earliest_arrival() -> None:
    result = options({"stop-happo-bus-terminal": 0}, [table("line-v-v2")])

    firsts = [r.options[0].arrives_at or r.options[0].departs_at for r in result.resorts]
    assert len(firsts) > 2
    assert firsts == sorted(firsts)


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
    ).departures

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


def test_matching_hotel_stop_is_walk_zero_even_without_coordinates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from hakuba_api.bus import router as bus_router
    from hakuba_api.common.geo import Coord
    from hakuba_api.routing.models import MatrixCell, Mode

    unlocated = STOPS["stop-double-black-hotel"].model_copy(update={"coord": None})
    monkeypatch.setattr(bus_router, "load_stops", lambda: [unlocated])

    class FarValhalla:
        def matrix(
            self, mode: Mode, origin: Coord, targets: list[tuple[str, Coord]]
        ) -> list[MatrixCell]:
            return [MatrixCell(id=t, duration_s=3600, distance_m=5000) for t, _ in targets]

    walks = bus_router.get_walks("36.7,137.84", FarValhalla(), name="Double Black Hotel")  # type: ignore[arg-type]

    assert walks == {"stop-double-black-hotel": 0}


# --- direct shuttles to a place (SPEC-bus-schedules v1.2) --------------------------

AFTERNOON = datetime(2026, 3, 20, 14, 30, tzinfo=JST)
ESCAL = "stop-goryu-escal-plaza"
TERMINAL = "stop-happo-bus-terminal"
JR_HAKUBA = "stop-jr-hakuba"
ECHOLAND = ALIAS["Echoland (Spicy)"]
CULTURED = ALIAS["Cultured"]
HAKUBA47 = ALIAS["Hakuba 47 Winter Sports Park"]
IWATAKE = ALIAS["Hakuba Iwatake Snow Field"]
NAKIYAMA = ALIAS["Happo Nakiyama Slope"]
COURTYARD = ALIAS["Courtyard By Marriott Hakuba"]
MOUNT = ALIAS["Mount"]


def serving_a_resort(stop_id: str) -> dict[str, BusStop]:
    """The real stops, with one counted as a resort stop to test another rule on its own."""
    return {**STOPS, stop_id: STOPS[stop_id].model_copy(update={"serves_resort_id": "goryu"})}


def to_place(
    from_walks: dict[str, int],
    place_walks: dict[str, int],
    tables: list[Timetable],
    at: datetime = AFTERNOON,
    stops: dict[str, BusStop] = STOPS,
) -> Any:
    return bus_options_to_place(from_walks, place_walks, at, tables, stops, ALIAS)


def hhmm(moment: datetime | None) -> str | None:
    return moment.strftime("%H:%M") if moment else None


def test_spec_example_lists_the_next_shuttles_back_by_departure() -> None:
    result = to_place({ESCAL: 120}, {TERMINAL: 300}, [table("line-v-v2"), table("line-g-g4")])

    assert result.status == "ok"
    assert [
        (o.route_id, hhmm(o.departs_at), hhmm(o.arrives_at), hhmm(o.door_arrives_at), o.timed)
        for o in result.options
    ] == [
        ("v2", "14:37", "15:10", "15:15", True),
        ("g4", "15:00", None, None, False),
        ("g4", "16:00", None, None, False),
        ("v2", "16:07", "16:40", "16:45", True),
        ("g4", "17:10", None, None, False),
    ]


def test_option_says_where_to_get_off_and_how_far_the_walk_is() -> None:
    first = to_place({ESCAL: 120}, {TERMINAL: 300}, [table("line-v-v2")]).options[0]

    assert first.resort_id is None
    assert first.board_stop_id == ESCAL
    assert first.alight_stop_id == TERMINAL
    assert first.walk_s == 120
    assert first.walk_to_place_s == 300
    assert first.ride_s == 33 * 60
    assert first.wait_s == 5 * 60  # ready at 14:32, the bus leaves at 14:37
    assert (first.ride_stops[0].stop_id, first.ride_stops[-1].stop_id) == (ESCAL, TERMINAL)


def test_walk_time_rules_out_a_bus_you_cannot_reach() -> None:
    result = to_place({ESCAL: 15 * 60}, {TERMINAL: 300}, [table("line-v-v2"), table("line-g-g4")])

    assert hhmm(result.options[0].departs_at) == "15:00"


def test_timed_trip_never_stops_where_its_time_is_blank() -> None:
    # V2 north trip 7 prints no time at JR Hakuba: it skips it. Trip 8 stops there.
    result = to_place({ESCAL: 120}, {JR_HAKUBA: 60}, [table("line-v-v2")])

    assert [o.trip for o in result.options] == [8]
    assert hhmm(result.options[0].arrives_at) == "16:46"


def test_ride_leaves_out_stops_a_timed_trip_skips() -> None:
    # trip 7 passes JR Hakuba without stopping: the map and the stop count must not show it
    iwatake = ALIAS["Hakuba Iwatake Snow Field"]
    first = to_place({ESCAL: 120}, {iwatake: 60}, [table("line-v-v2")]).options[0]

    assert first.trip == 7
    assert JR_HAKUBA not in [r.stop_id for r in first.ride_stops]
    assert all(r.time is not None for r in first.ride_stops)


def test_ride_keeps_the_unpublished_stops_of_a_first_stop_only_trip() -> None:
    first = to_place({ESCAL: 120}, {TERMINAL: 60}, [table("line-g-g4")]).options[0]

    assert len(first.ride_stops) == 8
    assert [r.time for r in first.ride_stops[:2]] == ["15:00", None]


def test_first_stop_only_trip_cannot_be_boarded_further_along() -> None:
    # G4 publishes only its first stop, so nobody can say when it reaches Cultured
    result = to_place(
        {CULTURED: 60}, {TERMINAL: 60}, [table("line-g-g4")], stops=serving_a_resort(CULTURED)
    )

    assert result.status == "ok"
    assert result.options == []


def test_timed_trip_gets_off_where_you_reach_the_door_soonest() -> None:
    # Echoland 14:57 + 20 min = 15:17; the Terminal 15:10 + 1 min = 15:11
    later_but_closer = to_place(
        {ESCAL: 120}, {ECHOLAND: 20 * 60, TERMINAL: 60}, [table("line-v-v2")]
    )
    assert later_but_closer.options[0].alight_stop_id == TERMINAL

    # the same walk from both: the earlier stop wins
    same_walk = to_place({ESCAL: 120}, {ECHOLAND: 60, TERMINAL: 60}, [table("line-v-v2")])
    assert same_walk.options[0].alight_stop_id == ECHOLAND


def test_first_stop_only_trip_gets_off_at_the_shortest_walk() -> None:
    result = to_place({ESCAL: 120}, {CULTURED: 600, TERMINAL: 120}, [table("line-g-g4")])

    first = result.options[0]
    assert first.alight_stop_id == TERMINAL
    assert first.walk_to_place_s == 120
    assert first.door_arrives_at is None


def test_a_stop_is_never_both_boarding_and_getting_off() -> None:
    e4 = table("line-e-e4")  # the return loop starts and ends at Iwatake
    gondola = ALIAS["Happo Gondola Lift"]

    assert to_place({IWATAKE: 0}, {IWATAKE: 0}, [e4]).options == []
    assert to_place({IWATAKE: 0}, {gondola: 0}, [e4]).options


def test_loop_line_reaches_a_stop_further_round() -> None:
    h1 = table("line-h-h1")
    start, further = (ALIAS[h1.directions[0].stops[k]] for k in (3, 13))  # 13: back at the start

    result = to_place({start: 0}, {further: 60}, [h1])

    assert result.options
    assert {o.alight_stop_id for o in result.options} == {further}


def test_one_row_per_trip_from_the_closer_boarding_stop() -> None:
    result = to_place(
        {ESCAL: 120, HAKUBA47: 60},
        {TERMINAL: 60},
        [table("line-v-v2")],
        at=datetime(2026, 3, 20, 14, 0, tzinfo=JST),
    )

    trips = [(o.route_id, o.trip) for o in result.options]
    assert len(trips) == len(set(trips))
    assert result.options[0].board_stop_id == HAKUBA47  # same bus, same door time, less walk


def test_at_most_five_rows_in_departure_order() -> None:
    result = to_place(
        {ESCAL: 0},
        {TERMINAL: 60},
        [table("line-v-v2"), table("line-g-g4")],
        at=datetime(2026, 3, 20, 8, 0, tzinfo=JST),
    )

    departures = [o.departs_at for o in result.options]
    assert len(departures) == 5
    assert departures == sorted(departures)


def test_to_place_out_of_season_reports_next_service_date() -> None:
    result = to_place(
        {ESCAL: 0},
        {TERMINAL: 60},
        [table("line-v-v2")],
        at=datetime(2026, 1, 10, 8, 0, tzinfo=JST),
    )

    assert result.status == "no_service"
    assert result.next_service_date == date(2026, 3, 16)
    assert result.options == []


def test_to_place_never_uses_unreviewed_timetables() -> None:
    result = to_place({ESCAL: 0}, {TERMINAL: 60}, [table("line-v-v2", reviewed=False)])

    assert result.status == "awaiting_review"
    assert result.options == []


def test_to_place_keeps_the_night_bus_out() -> None:
    konayuki = table("line-konayuki")
    ids = [ALIAS[s] for s in konayuki.directions[0].stops]
    assert STOPS[ids[3]].serves_resort_id  # so only its kind keeps this ride out

    result = to_place(
        {ids[3]: 0}, {ids[-1]: 60}, [konayuki], at=datetime(2026, 1, 20, 17, 0, tzinfo=JST)
    )

    assert result.options == []


def test_free_shuttles_only_board_at_a_stop_that_serves_a_resort() -> None:
    h1 = [table("line-h-h1")]

    assert to_place({TERMINAL: 0}, {NAKIYAMA: 60}, h1).options == []
    assert to_place({NAKIYAMA: 0}, {ALIAS["Happo Gondola Lift"]: 60}, h1).options


def test_paid_line_v_can_be_boarded_anywhere() -> None:
    # the poster prints the resort-only limit under the free shuttles, not over line V
    assert to_place({TERMINAL: 0}, {IWATAKE: 60}, [table("line-v-v2")]).options


def test_starred_stop_is_only_for_riders_of_its_paired_stop() -> None:
    e2 = [table("line-e-e2")]

    assert to_place({IWATAKE: 60}, {COURTYARD: 60}, e2).options
    assert to_place({NAKIYAMA: 60}, {COURTYARD: 60}, e2).options == []


def test_starred_stop_cannot_be_boarded_for_any_other_ride() -> None:
    e2 = [table("line-e-e2")]
    morning = datetime(2026, 3, 20, 7, 0, tzinfo=JST)
    resort_at_courtyard = serving_a_resort(COURTYARD)

    assert to_place({COURTYARD: 60}, {IWATAKE: 60}, e2, morning, resort_at_courtyard).options
    assert to_place({COURTYARD: 60}, {NAKIYAMA: 60}, e2, morning, resort_at_courtyard).options == []


@pytest.mark.parametrize(
    ("file", "direction", "field", "expected"),
    [
        ("line-h-h1", 0, "alight_only", [(12, "Mount"), (13, "Hakuba Happo Bus Terminal")]),
        (
            "line-h-h2",
            0,
            "alight_only",
            [(11, "#3 Parking"), (12, "Mount"), (13, "Hakuba Happo Bus Terminal")],
        ),
        (
            "line-gurutto",
            0,
            "alight_only",
            [
                (3, "White Resort Hakuba Sanosaka"),
                (4, "Able Hakuba Goryu Escal Plaza"),
                (5, "Happo-One (Nakiyama Slope)"),
                (6, "Hakuba Iwatake Snow Field"),
            ],
        ),
        (
            "line-gurutto",
            1,
            "board_only",
            [
                (0, "Hakuba Iwatake Snow Field"),
                (1, "Happo-One (Nakiyama Slope)"),
                (2, "Able Hakuba Goryu Escal Plaza"),
                (3, "White Resort Hakuba Sanosaka"),
            ],
        ),
    ],
)
def test_boarding_rules_point_at_the_stops_the_timetable_marks(
    file: str, direction: int, field: str, expected: list[tuple[int, str]]
) -> None:
    d = table(file).directions[direction]

    assert [(i, d.stops[i]) for i in getattr(d, field)] == expected


def test_alight_only_stop_cannot_be_boarded_but_can_be_left() -> None:
    h1 = [table("line-h-h1")]
    early = datetime(2026, 3, 20, 8, 0, tzinfo=JST)

    # Mount comes twice on the loop: 08:01 can be boarded, the final 08:25 can't
    boarding = to_place(
        {MOUNT: 0},
        {TERMINAL: 60},
        h1,
        at=datetime(2026, 3, 20, 8, 20, tzinfo=JST),
        stops=serving_a_resort(MOUNT),
    )
    assert hhmm(boarding.options[0].departs_at) == "09:01"

    leaving = to_place({NAKIYAMA: 0}, {MOUNT: 60}, h1, at=early)
    assert hhmm(leaving.options[0].arrives_at) == "08:25"


def test_board_only_stop_cannot_be_left() -> None:
    gurutto = [table("line-gurutto")]
    afternoon = datetime(2026, 1, 20, 16, 0, tzinfo=JST)
    omachi = ALIAS["Omachi Onsenkyo Ent."]

    assert to_place({IWATAKE: 60}, {omachi: 60}, gurutto, at=afternoon).options
    assert to_place({IWATAKE: 60}, {ESCAL: 60}, gurutto, at=afternoon).options == []


def test_first_stop_only_trip_never_stops_where_it_prints_a_dash() -> None:
    f6 = [table("line-f-f6")]
    jr_serving = serving_a_resort(JR_HAKUBA)
    keyakino = ALIAS["Hotel Keyakino-ki"]
    late_morning = datetime(2026, 1, 20, 11, 30, tzinfo=JST)

    assert to_place({JR_HAKUBA: 60}, {keyakino: 60}, f6, late_morning, jr_serving).options == []

    to_47 = to_place({JR_HAKUBA: 60}, {HAKUBA47: 60}, f6, late_morning, jr_serving).options[0]
    assert to_47.trip == 3
    assert keyakino not in [r.stop_id for r in to_47.ride_stops]


@pytest.fixture
def place_api() -> Any:
    app.dependency_overrides[get_walks] = lambda: {ESCAL: 120}
    app.dependency_overrides[get_walks_to] = lambda: {TERMINAL: 300}
    app.dependency_overrides[get_bus_data] = lambda: [table("line-v-v2")]
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_to_place_endpoint(place_api: TestClient) -> None:
    response = place_api.get(
        "/api/bus/to-place",
        params={"from": "36.65,137.84", "to": "36.70,137.85", "at": "2026-03-20T14:30:00+09:00"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    first = body["options"][0]
    assert first["departsAt"] == "2026-03-20T14:37:00+09:00"
    assert first["doorArrivesAt"] == "2026-03-20T15:15:00+09:00"
    assert first["walkToPlaceS"] == 300
    assert first["resortId"] is None


def test_to_place_endpoint_needs_a_destination() -> None:
    app.dependency_overrides[get_walks] = lambda: {ESCAL: 120}
    try:
        response = TestClient(app).get("/api/bus/to-place", params={"from": "36.65,137.84"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_lodging_that_is_a_stop_is_walk_zero_at_the_far_end(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from hakuba_api.bus import router as bus_router
    from hakuba_api.common.geo import Coord
    from hakuba_api.routing.models import MatrixCell, Mode

    monkeypatch.setattr(bus_router, "load_stops", lambda: [STOPS["stop-double-black-hotel"]])

    class FarValhalla:
        def matrix(
            self, mode: Mode, origin: Coord, targets: list[tuple[str, Coord]]
        ) -> list[MatrixCell]:
            return [MatrixCell(id=t, duration_s=3600, distance_m=5000) for t, _ in targets]

    walks = bus_router.get_walks_to("36.7,137.84", FarValhalla(), to_name="Double Black Hotel")  # type: ignore[arg-type]

    assert walks == {"stop-double-black-hotel": 0}
