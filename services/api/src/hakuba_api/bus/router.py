from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.bus.models import Timetable
from hakuba_api.bus.query import BusResult, NightDeparture, bus_options, night_departures
from hakuba_api.bus.store import load_stops, load_timetables
from hakuba_api.common.params import parse_lat_lng
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.router import get_valhalla
from hakuba_api.snow.compute import JST

router = APIRouter(prefix="/api/bus")

MAX_WALK_S = 20 * 60
FALLBACK_STOPS = 3


def get_walks(
    origin: Annotated[str, Query(alias="from")],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
) -> dict[str, int]:
    """Walking seconds to stops within 20 min, else to the 3 nearest (located stops only)."""
    located = [(s.id, s.coord) for s in load_stops() if s.coord]
    cells = valhalla.matrix("walk", parse_lat_lng(origin, "from"), located)
    reachable = sorted(
        (c for c in cells if c.duration_s is not None), key=lambda c: c.duration_s or 0
    )
    near = [c for c in reachable if (c.duration_s or 0) <= MAX_WALK_S]
    return {c.id: c.duration_s or 0 for c in (near or reachable[:FALLBACK_STOPS])}


def get_bus_data() -> list[Timetable]:
    return load_timetables()


def _when(at: datetime | None) -> datetime:
    return (at or datetime.now(JST)).astimezone(JST)


@router.get("/options", response_model=BusResult, response_model_by_alias=True)
def get_bus_options(
    walks: Annotated[dict[str, int], Depends(get_walks)],
    timetables: Annotated[list[Timetable], Depends(get_bus_data)],
    at: datetime | None = None,
) -> BusResult:
    stops = {s.id: s for s in load_stops()}
    alias = {a: s.id for s in stops.values() for a in s.aliases}
    return bus_options(walks, _when(at), timetables, stops, alias)


@router.get("/night", response_model=list[NightDeparture], response_model_by_alias=True)
def get_night_bus(
    walks: Annotated[dict[str, int], Depends(get_walks)],
    timetables: Annotated[list[Timetable], Depends(get_bus_data)],
    at: datetime | None = None,
) -> list[NightDeparture]:
    stops = {s.id: s for s in load_stops()}
    alias = {a: s.id for s in stops.values() for a in s.aliases}
    return night_departures(walks, _when(at), timetables, stops, alias)
