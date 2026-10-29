"""Which timetables apply on a day: the published ones, else last season's shifted forward.

Pure functions (no I/O). See SPEC-bus-schedules.md "Season-agnostic schedules".
Every Hakuba Valley timetable runs daily, so shifting a season by whole years keeps
every clock time; only the valid period moves.

The decision is made per route: while the new season is being transcribed line by
line, the lines not reviewed yet keep coming from last season, labelled Expected.
"""

from datetime import date
from typing import Literal, NamedTuple

from hakuba_api.bus.models import Timetable

Basis = Literal["published", "expected"]

MAX_SEASONS_BACK = 1  # a line absent for two seasons is treated as dropped


class Projection(NamedTuple):
    tables: list[Timetable]  # those covering the day, already shifted when expected
    basis: Basis  # "expected" as soon as any table is a projection
    season: str | None  # the latest season the tables were transcribed from


def _plus_years(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # Feb 29 → Feb 28
        return day.replace(year=day.year + years, day=28)


def shift_years(table: Timetable, years: int) -> Timetable:
    return table.model_copy(
        update={
            "valid_from": _plus_years(table.valid_from, years),
            "valid_to": _plus_years(table.valid_to, years),
        }
    )


def _covers(table: Timetable, day: date) -> bool:
    return table.valid_from <= day <= table.valid_to


def season_year(season: str) -> int:
    return int(season[:4])  # "2025-26" → 2025


def _by_route(tables: list[Timetable]) -> dict[str, list[Timetable]]:
    groups: dict[str, list[Timetable]] = {}
    for t in tables:
        groups.setdefault(t.route_id, []).append(t)
    return groups


def _projectable(tables: list[Timetable], newest: str) -> list[Timetable]:
    """A route's latest season, unless it is too far behind the newest season overall."""
    season = max(t.season for t in tables)
    if season_year(newest) - season_year(season) > MAX_SEASONS_BACK:
        return []
    return [t for t in tables if t.season == season]


def _forward_shifts(day: date, tables: list[Timetable]) -> list[int]:
    """Year offsets (never backwards) that could bring a period onto `day`."""
    years = {day.year - t.valid_to.year for t in tables} | {
        day.year - t.valid_from.year for t in tables
    }
    return sorted(y for y in years if y >= 0)


def effective_timetables(day: date, tables: list[Timetable]) -> Projection:
    reviewed = [t for t in tables if t.reviewed]
    if not reviewed:
        return Projection([], "expected", None)
    newest = max(t.season for t in reviewed)
    used: list[Timetable] = []
    projected = False
    for group in _by_route(reviewed).values():
        published = [t for t in group if _covers(t, day)]
        if published:
            used += published
            continue
        latest = _projectable(group, newest)
        for years in _forward_shifts(day, latest):
            shifted = [s for t in latest if _covers(s := shift_years(t, years), day)]
            if shifted:
                used += shifted
                projected = True
                break
    basis: Basis = "expected" if projected or not used else "published"
    return Projection(used, basis, max((t.season for t in used), default=newest))


def next_service_date(day: date, tables: list[Timetable]) -> tuple[date, Basis] | None:
    """The next published start after `day`, else the next projected one."""
    reviewed = [t for t in tables if t.reviewed]
    published = [t.valid_from for t in reviewed if t.valid_from > day]
    if published:
        return min(published), "published"
    if not reviewed:
        return None
    newest = max(t.season for t in reviewed)
    starts = [
        s.valid_from
        for group in _by_route(reviewed).values()
        for t in _projectable(group, newest)
        for years in (day.year - t.valid_from.year, day.year - t.valid_from.year + 1)
        if years >= 0 and (s := shift_years(t, years)).valid_from > day
    ]
    return (min(starts), "expected") if starts else None
