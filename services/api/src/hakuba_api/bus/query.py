"""Pure bus queries: no I/O. See SPEC-bus-schedules.md (Query, Untimed routes)."""

from datetime import date, datetime, timedelta
from typing import Literal

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.common.models import ApiModel

MAX_OPTIONS_PER_RESORT = 3


class BusOption(ApiModel):
    resort_id: str
    line_id: str
    route_id: str
    route_name: str
    trip: int
    board_stop_id: str
    board_stop_name: str
    alight_stop_id: str
    walk_s: int
    departs_at: datetime  # at the boarding stop, or at first_stop_name when untimed
    arrives_at: datetime | None  # None when the timetable doesn't publish it
    ride_s: int | None
    wait_s: int
    timed: bool  # False: only the route's first departure is published
    first_stop_name: str
    source_file: str


class ResortBusOptions(ApiModel):
    resort_id: str
    options: list[BusOption]


class BusResult(ApiModel):
    status: Literal["ok", "no_service", "awaiting_review"]
    next_service_date: date | None
    resorts: list[ResortBusOptions]


class NightDeparture(ApiModel):
    route_id: str
    board_stop_id: str
    board_stop_name: str
    walk_s: int
    departs_at: datetime
    towards: str


def _at(day: date, hhmm: str, like: datetime) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=like.tzinfo)


def _active(t: Timetable, day: date, kind: str) -> bool:
    return t.kind == kind and t.valid_from <= day <= t.valid_to


def bus_options(
    walks: dict[str, int],
    at: datetime,
    timetables: list[Timetable],
    stops: dict[str, BusStop],
    alias: dict[str, str],
) -> BusResult:
    day = at.date()
    day_tables = [t for t in timetables if t.kind == "day"]
    reviewed = [t for t in day_tables if t.reviewed]
    active = [t for t in reviewed if _active(t, day, "day")]
    if not active:
        if any(_active(t, day, "day") for t in day_tables):
            return BusResult(status="awaiting_review", next_service_date=None, resorts=[])
        upcoming = sorted(t.valid_from for t in reviewed if t.valid_from > day)
        return BusResult(
            status="no_service", next_service_date=upcoming[0] if upcoming else None, resorts=[]
        )

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
                            alight_stop_id=ids[j],
                            walk_s=walks[board],
                            departs_at=departs,
                            arrives_at=arrives,
                            ride_s=int((arrives - departs).total_seconds()) if arrives else None,
                            wait_s=int((departs - ready).total_seconds()),
                            timed=timed,
                            first_stop_name=d.stops[ref],
                            source_file=t.source.file,
                        )
                        key = (t.route_id, d.id, trip.n, resort)
                        current = best.get(key)
                        if current is None or _rank(option) < _rank(current):
                            best[key] = option

    by_resort: dict[str, list[BusOption]] = {}
    for option in best.values():
        by_resort.setdefault(option.resort_id, []).append(option)
    resorts = [
        ResortBusOptions(resort_id=resort, options=sorted(opts, key=_rank)[:MAX_OPTIONS_PER_RESORT])
        for resort, opts in sorted(by_resort.items())
    ]
    return BusResult(status="ok", next_service_date=None, resorts=resorts)


def _rank(o: BusOption) -> tuple[bool, datetime, int]:
    """Timed before untimed, then earliest arrival (or departure), then shortest walk."""
    return (not o.timed, o.arrives_at or o.departs_at, o.walk_s)


def night_departures(
    walks: dict[str, int],
    at: datetime,
    timetables: list[Timetable],
    stops: dict[str, BusStop],
    alias: dict[str, str],
    limit: int = 6,
) -> list[NightDeparture]:
    day = at.date()
    found: list[NightDeparture] = []
    for t in timetables:
        if not (t.reviewed and _active(t, day, "night")):
            continue
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
    return sorted(found, key=lambda n: n.departs_at)[:limit]
