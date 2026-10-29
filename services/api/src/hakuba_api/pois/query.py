"""Nearest restaurants / konbini by travel time. Pure apart from the injected matrix call."""

import math
from collections.abc import Callable

from hakuba_api.common.geo import Coord
from hakuba_api.pois.models import NearbyPoi, Poi, PoiCategory
from hakuba_api.routing.models import MatrixCell, Mode

PREFILTER = 25  # nearest by straight line, then one matrix call
MAX_LIMIT = 25

Matrix = Callable[[Mode, Coord, list[tuple[str, Coord]]], list[MatrixCell]]


def _km(a: Coord, b: Coord) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


def nearby(
    pois: list[Poi], origin: Coord, category: PoiCategory, mode: Mode, limit: int, matrix: Matrix
) -> list[NearbyPoi]:
    candidates = sorted(
        (p for p in pois if p.category == category), key=lambda p: _km(origin, p.coord)
    )[:PREFILTER]
    if not candidates:
        return []
    cells = matrix(mode, origin, [(p.id, p.coord) for p in candidates])
    by_id = {p.id: p for p in candidates}
    reachable = [
        NearbyPoi(**by_id[c.id].model_dump(), duration_s=c.duration_s, distance_m=c.distance_m)
        for c in cells
        if c.duration_s is not None and c.distance_m is not None
    ]
    return sorted(reachable, key=lambda r: r.duration_s)[: min(limit, MAX_LIMIT)]
