"""Pure bus queries: no I/O. See SPEC-bus-schedules.md (Query, Untimed routes, v1.2)."""

from collections.abc import Iterable
from datetime import date, datetime, timedelta
from typing import Any, Literal

from hakuba_api.bus.models import BusStop, Direction, Timetable, Trip
from hakuba_api.bus.season import Basis, effective_timetables, next_service_date
from hakuba_api.common.geo import Coord
from hakuba_api.common.models import ApiModel

MAX_OPTIONS_PER_RESORT = 3
MAX_OPTIONS_TO_PLACE = 5
PAID_DAY_LINE = "line-v"  # named here because `fare` in the data says ¥800 on free lines too

ServiceStatus = Literal["ok", "no_service", "awaiting_review"]


class RideStop(ApiModel):
    stop_id: str
    name: str
    coord: Coord | None
    time: str | None  # "HH:MM" as printed, None when the timetable doesn't publish it


class BusOption(ApiModel):
    resort_id: str | None  # None on a trip to a place (/to-place)
    line_id: str
    route_id: str
    route_name: str
    trip: int
    board_stop_id: str
    board_stop_name: str
    board_stop_coord: Coord | None  # walkable stops are always located; None never served
    alight_stop_id: str
    walk_s: int
    departs_at: datetime  # at the boarding stop, or at first_stop_name when untimed
    arrives_at: datetime | None  # None when the timetable doesn't publish it
    ride_s: int | None
    wait_s: int
    timed: bool  # False: only the route's first departure is published
    first_stop_name: str
    source_file: str
    ride_stops: list[RideStop] = []  # board → … → alight, in trip order
    walk_to_place_s: int | None = None  # from the alighting stop (/to-place only)
    door_arrives_at: datetime | None = None  # alighting time + that walk; None when untimed


class ResortBusOptions(ApiModel):
    resort_id: str
    options: list[BusOption]


class BusResult(ApiModel):
    status: ServiceStatus
    next_service_date: date | None
    resorts: list[ResortBusOptions]
    basis: Basis = "published"  # "expected": projected from last season's timetable
    based_on_season: str | None = None  # for the source link / tooltip only, never headline text
    newer_source_pending: bool = False  # the operator published a timetable not transcribed yet


class PlaceBusResult(ApiModel):
    status: ServiceStatus
    next_service_date: date | None
    options: list[BusOption]
    basis: Basis = "published"
    based_on_season: str | None = None
    newer_source_pending: bool = False


class NightDeparture(ApiModel):
    route_id: str
    board_stop_id: str
    board_stop_name: str
    walk_s: int
    departs_at: datetime
    towards: str


class NightResult(ApiModel):
    basis: Basis
    based_on_season: str | None
    newer_source_pending: bool
    departures: list[NightDeparture]


def _at(day: date, hhmm: str, like: datetime) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=like.tzinfo)


def _active(t: Timetable, day: date, kind: str) -> bool:
    return t.kind == kind and t.valid_from <= day <= t.valid_to


def _ride_stops(
    ids: list[str], trip: Trip, stops: dict[str, BusStop], board: int, alight: int
) -> list[RideStop]:
    return [
        RideStop(
            stop_id=ids[k],
            name=stops[ids[k]].name.en,
            coord=stops[ids[k]].coord,
            time=trip.times[k],
        )
        for k in range(board, alight + 1)
    ]


def _service_on(
    day: date, day_tables: list[Timetable], newer_source_pending: bool
) -> tuple[list[Timetable], ServiceStatus, date | None, dict[str, Any]]:
    """The timetables running on `day`, and the status both day-bus queries answer with."""
    active, basis, season = effective_timetables(day, day_tables)
    status: ServiceStatus = "ok"
    next_date: date | None = None
    if not active:
        upcoming = next_service_date(day, day_tables)
        basis = upcoming[1] if upcoming else "expected"
        if any(_active(t, day, "day") and not t.reviewed for t in day_tables):
            status = "awaiting_review"
        else:
            status = "no_service"
            next_date = upcoming[0] if upcoming else None
    meta: dict[str, Any] = {
        "basis": basis,
        "based_on_season": season,
        # a newer timetable only matters while we are projecting from an old one
        "newer_source_pending": newer_source_pending and basis == "expected",
    }
    return active, status, next_date, meta


def bus_options(
    walks: dict[str, int],
    at: datetime,
    timetables: list[Timetable],
    stops: dict[str, BusStop],
    alias: dict[str, str],
    newer_source_pending: bool = False,
) -> BusResult:
    day = at.date()
    day_tables = [t for t in timetables if t.kind == "day"]
    active, status, next_date, meta = _service_on(day, day_tables, newer_source_pending)
    if status != "ok":
        return BusResult(status=status, next_service_date=next_date, resorts=[], **meta)

    best: dict[tuple[str, str, int, str], BusOption] = {}  # one entry per trip and resort
    for t in active:
        for d in t.directions:
            ids = [alias[s] for s in d.stops]
            for trip in d.trips:
                for i, board in enumerate(ids):
                    if board not in walks:
                        continue
                    # reference departure: the boarding stop's own time, else the last
                    # published time before it (untimed pickup routes)
                    ref = next((k for k in range(i, -1, -1) if trip.times[k] is not None), None)
                    if ref is None:
                        continue
                    departs = _at(day, trip.times[ref], at)  # type: ignore[arg-type]
                    ready = at + timedelta(seconds=walks[board])
                    if departs < ready:
                        continue
                    for j in range(i + 1, len(ids)):
                        resort = stops[ids[j]].serves_resort_id
                        if resort is None:
                            continue
                        arr_time = trip.times[j]
                        timed = ref == i and arr_time is not None
                        arrives = _at(day, arr_time, at) if timed and arr_time else None
                        option = BusOption(
                            resort_id=resort,
                            line_id=t.line_id,
                            route_id=t.route_id,
                            route_name=t.name.en,
                            trip=trip.n,
                            board_stop_id=board,
                            board_stop_name=stops[board].name.en,
                            board_stop_coord=stops[board].coord,
                            alight_stop_id=ids[j],
                            walk_s=walks[board],
                            departs_at=departs,
                            arrives_at=arrives,
                            ride_s=int((arrives - departs).total_seconds()) if arrives else None,
                            wait_s=int((departs - ready).total_seconds()),
                            timed=timed,
                            first_stop_name=d.stops[ref],
                            source_file=t.source.file,
                            ride_stops=_ride_stops(ids, trip, stops, i, j),
                        )
                        key = (t.route_id, d.id, trip.n, resort)
                        current = best.get(key)
                        if current is None or _rank(option) < _rank(current):
                            best[key] = option

    by_resort: dict[str, list[BusOption]] = {}
    for (_, _, _, resort), option in best.items():
        by_resort.setdefault(resort, []).append(option)
    ranked = {
        resort: sorted(opts, key=_rank)[:MAX_OPTIONS_PER_RESORT]
        for resort, opts in by_resort.items()
    }
    # the resort you can reach soonest first (Google Maps transit orders by arrival);
    # the id breaks ties so the order is stable
    resorts = [
        ResortBusOptions(resort_id=resort, options=opts)
        for resort, opts in sorted(ranked.items(), key=lambda kv: (_rank(kv[1][0]), kv[0]))
    ]
    return BusResult(status="ok", next_service_date=None, resorts=resorts, **meta)


def _rank(o: BusOption) -> tuple[bool, datetime, int]:
    """Timed before untimed, then earliest arrival (or departure), then shortest walk."""
    return (not o.timed, o.arrives_at or o.departs_at, o.walk_s)


def bus_options_to_place(
    walks_from: dict[str, int],
    walks_to: dict[str, int],
    at: datetime,
    timetables: list[Timetable],
    stops: dict[str, BusStop],
    alias: dict[str, str],
    newer_source_pending: bool = False,
) -> PlaceBusResult:
    """The next direct shuttles to a place, such as back to the lodging (spec v1.2)."""
    day = at.date()
    day_tables = [t for t in timetables if t.kind == "day"]
    active, status, next_date, meta = _service_on(day, day_tables, newer_source_pending)
    if status != "ok":
        return PlaceBusResult(status=status, next_service_date=next_date, options=[], **meta)

    best: dict[tuple[str, str, int], BusOption] = {}  # one row per trip
    for t in active:
        for d in t.directions:
            ids = [alias[s] for s in d.stops]
            for trip in d.trips:
                # one printed time: the blanks are "not published". With more, a blank
                # means this trip doesn't go there (V2 north trip 7 skips JR Hakuba).
                first_stop_only = sum(time is not None for time in trip.times) == 1
                for i, board in enumerate(ids):
                    printed = trip.times[i]
                    if board not in walks_from or printed is None or i in d.alight_only:
                        continue
                    if t.line_id != PAID_DAY_LINE and stops[board].serves_resort_id is None:
                        continue  # free shuttles run between a resort and your lodging
                    departs = _at(day, printed, at)
                    ready = at + timedelta(seconds=walks_from[board])
                    if departs < ready:
                        continue
                    for j in range(i + 1, len(ids)):
                        alight = ids[j]
                        arr_time = trip.times[j]
                        if alight not in walks_to or alight == board:
                            continue
                        if j in d.board_only or j in trip.skips or not _may_pair(d, i, j):
                            continue
                        if arr_time is None and not first_stop_only:
                            continue
                        arrives = _at(day, arr_time, at) if arr_time else None
                        walk_to = walks_to[alight]
                        ride = _ride_stops(ids, trip, stops, i, j)
                        option = BusOption(
                            resort_id=None,
                            line_id=t.line_id,
                            route_id=t.route_id,
                            route_name=t.name.en,
                            trip=trip.n,
                            board_stop_id=board,
                            board_stop_name=stops[board].name.en,
                            board_stop_coord=stops[board].coord,
                            alight_stop_id=alight,
                            walk_s=walks_from[board],
                            departs_at=departs,
                            arrives_at=arrives,
                            ride_s=int((arrives - departs).total_seconds()) if arrives else None,
                            wait_s=int((departs - ready).total_seconds()),
                            timed=arrives is not None,
                            first_stop_name=d.stops[i],
                            source_file=t.source.file,
                            ride_stops=[
                                s
                                for k, s in enumerate(ride, start=i)
                                if k not in trip.skips and (first_stop_only or s.time)
                            ],
                            walk_to_place_s=walk_to,
                            door_arrives_at=(
                                arrives + timedelta(seconds=walk_to) if arrives else None
                            ),
                        )
                        key = (t.route_id, d.id, trip.n)
                        current = best.get(key)
                        if current is None or _stop_rank(option) < _stop_rank(current):
                            best[key] = option

    options = sorted(_thinned(best.values()), key=_place_rank)[:MAX_OPTIONS_TO_PLACE]
    return PlaceBusResult(status="ok", next_service_date=None, options=options, **meta)


def _thinned(options: Iterable[BusOption]) -> list[BusOption]:
    """One row for first-stop-only buses leaving a stop together: the shortest walk at the
    far end. They'd otherwise fill the list with near-identical rows (spec v1.2)."""
    timed: list[BusOption] = []
    untimed: dict[tuple[str, datetime], BusOption] = {}
    for o in options:
        if o.timed:
            timed.append(o)
            continue
        key = (o.board_stop_id, o.departs_at)
        current = untimed.get(key)
        if current is None or _stop_rank(o) < _stop_rank(current):
            untimed[key] = o
    return timed + list(untimed.values())


def _may_pair(d: Direction, board: int, alight: int) -> bool:
    """False when either end of the ride is reserved for riders of some other stop."""
    return all(
        (r.stop != board or r.only_with == alight) and (r.stop != alight or r.only_with == board)
        for r in d.restricted
    )


def _stop_rank(o: BusOption) -> tuple[datetime, int, int]:
    """Which stops to use: soonest at the door, then the shorter walks. Untimed trips have
    a single boarding stop and no door time, so only the walk from the stop separates them."""
    return (o.door_arrives_at or o.departs_at, o.walk_to_place_s or 0, o.walk_s)


def _place_rank(o: BusOption) -> tuple[datetime, bool, datetime, int]:
    """Across trips: next to leave (the one time every trip has), timed first on a tie."""
    door = o.door_arrives_at
    return (o.departs_at, door is None, door or o.departs_at, o.walk_s + (o.walk_to_place_s or 0))


def night_departures(
    walks: dict[str, int],
    at: datetime,
    timetables: list[Timetable],
    stops: dict[str, BusStop],
    alias: dict[str, str],
    limit: int = 6,
    newer_source_pending: bool = False,
) -> NightResult:
    day = at.date()
    found: list[NightDeparture] = []
    night_tables = [t for t in timetables if t.kind == "night"]
    tables, basis, season = effective_timetables(day, night_tables)
    for t in tables:
        for d in t.directions:
            ids = [alias[s] for s in d.stops]
            for trip in d.trips:
                for i, board in enumerate(ids):
                    time = trip.times[i]
                    if board not in walks or time is None or i == len(ids) - 1:
                        continue
                    departs = _at(day, time, at)
                    if departs >= at + timedelta(seconds=walks[board]):
                        found.append(
                            NightDeparture(
                                route_id=t.route_id,
                                board_stop_id=board,
                                board_stop_name=stops[board].name.en,
                                walk_s=walks[board],
                                departs_at=departs,
                                towards=stops[ids[-1]].name.en,
                            )
                        )
    return NightResult(
        basis=basis,
        based_on_season=season,
        newer_source_pending=newer_source_pending and basis == "expected",
        departures=sorted(found, key=lambda n: n.departs_at)[:limit],
    )
