import re
import unicodedata
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.bus.query import BusResult, NightResult, bus_options, night_departures
from hakuba_api.bus.store import load_manifest_season, load_stops, load_timetables
from hakuba_api.common.params import PlausibleDateTime, parse_lat_lng
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.router import get_valhalla
from hakuba_api.snow.compute import JST

router = APIRouter(prefix="/api/bus")

MAX_WALK_S = 20 * 60
FALLBACK_STOPS = 3


PLACE_WORDS = {"hakuba", "the", "白馬"}  # say nothing about which property it is
TYPE_WORDS = {
    "hotel",
    "pension",
    "lodge",
    "inn",
    "resort",
    "suites",
    "ホテル",
    "ペンション",
    "ロッジ",
}


def _tokens(text: str, keep_place: bool = False) -> tuple[str, ...]:
    text = unicodedata.normalize("NFKC", text).lower()
    parts = re.findall(r"[a-z0-9]+|[^\x00-\x7f\s・/()（）]+", text)
    out: list[str] = []
    for part in parts:
        for word in (*PLACE_WORDS, *TYPE_WORDS):  # split glued Japanese like 白馬東急ホテル
            if not word.isascii():
                part = part.replace(word, f" {word} ")
        out += part.split()
    return tuple(t for t in out if keep_place or t not in PLACE_WORDS)


def _same_property(a_name: str, b_name: str) -> bool:
    """Same distinctive words, and type words of one side within the other's
    ('Hotel Cultured' ~ 'Cultured', 'Sierra Resort' ~ 'Sierra Resort Hotel', but
    'Highland Lodge' !~ 'Highland Hotel'). Names with no distinctive word at all
    ('Hotel Hakuba') must match exactly, so 'Kokoro Hotel Hakuba' doesn't."""
    a, b = _tokens(a_name), _tokens(b_name)
    a_core = tuple(t for t in a if t not in TYPE_WORDS)
    b_core = tuple(t for t in b if t not in TYPE_WORDS)
    if not a_core or not b_core:
        return _tokens(a_name, keep_place=True) == _tokens(b_name, keep_place=True)
    a_types, b_types = set(a) & TYPE_WORDS, set(b) & TYPE_WORDS
    return a_core == b_core and (a_types <= b_types or b_types <= a_types)


def stops_named(name: str, stops: list[BusStop]) -> set[str]:
    """The pickup stop that *is* this place (e.g. the hotel the user searched for)."""
    return {
        s.id
        for s in stops
        if any(_same_property(c, name) for c in [*s.aliases, s.name.en, s.name.ja or ""] if c)
    }


def get_walks(
    origin: Annotated[str, Query(alias="from")],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
    name: str | None = None,
) -> dict[str, int]:
    """Walking seconds to stops within 20 min, else to the 3 nearest (located stops only).

    When the origin is a place whose name matches a pickup stop (the user's hotel), that
    stop is walk 0 — exact even if the stop itself has no coordinates yet.
    """
    located = [(s.id, s.coord) for s in load_stops() if s.coord]
    cells = valhalla.matrix("walk", parse_lat_lng(origin, "from"), located)
    reachable = sorted(
        (c for c in cells if c.duration_s is not None), key=lambda c: c.duration_s or 0
    )
    near = [c for c in reachable if (c.duration_s or 0) <= MAX_WALK_S]
    walks = {c.id: c.duration_s or 0 for c in (near or reachable[:FALLBACK_STOPS])}
    if name:
        for stop_id in stops_named(name, load_stops()):
            walks[stop_id] = 0
    return walks


def get_bus_data() -> list[Timetable]:
    return load_timetables()


def get_manifest_season() -> str | None:
    return load_manifest_season()


def _newer_source(manifest_season: str | None, timetables: list[Timetable]) -> bool:
    """The operator's page names a season newer than anything reviewed here."""
    reviewed = [t.season for t in timetables if t.reviewed]
    return manifest_season is not None and (not reviewed or manifest_season > max(reviewed))


def _when(at: datetime | None) -> datetime:
    return (at or datetime.now(JST)).astimezone(JST)


@router.get("/options", response_model=BusResult, response_model_by_alias=True)
def get_bus_options(
    walks: Annotated[dict[str, int], Depends(get_walks)],
    timetables: Annotated[list[Timetable], Depends(get_bus_data)],
    manifest_season: Annotated[str | None, Depends(get_manifest_season)],
    at: PlausibleDateTime | None = None,
) -> BusResult:
    stops = {s.id: s for s in load_stops()}
    alias = {a: s.id for s in stops.values() for a in s.aliases}
    newer = _newer_source(manifest_season, timetables)
    return bus_options(walks, _when(at), timetables, stops, alias, newer_source_pending=newer)


@router.get("/night", response_model=NightResult, response_model_by_alias=True)
def get_night_bus(
    walks: Annotated[dict[str, int], Depends(get_walks)],
    timetables: Annotated[list[Timetable], Depends(get_bus_data)],
    manifest_season: Annotated[str | None, Depends(get_manifest_season)],
    at: PlausibleDateTime | None = None,
) -> NightResult:
    stops = {s.id: s for s in load_stops()}
    alias = {a: s.id for s in stops.values() for a in s.aliases}
    newer = _newer_source(manifest_season, timetables)
    return night_departures(walks, _when(at), timetables, stops, alias, newer_source_pending=newer)
