import time
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.common.params import parse_lat_lng
from hakuba_api.pois.models import NearbyPoi, Poi, PoiCategory
from hakuba_api.pois.query import MAX_LIMIT, nearby
from hakuba_api.pois.store import load_pois
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.models import Mode
from hakuba_api.routing.router import get_valhalla

router = APIRouter(prefix="/api/pois")

CACHE_TTL_S = 10 * 60
_cache: dict[tuple[float, float, str, str, int], tuple[float, list[NearbyPoi]]] = {}


def get_pois() -> list[Poi]:
    return load_pois()


@router.get("/nearby", response_model=list[NearbyPoi], response_model_by_alias=True)
def get_nearby(
    origin: Annotated[str, Query(alias="from")],
    category: PoiCategory,
    mode: Mode,
    pois: Annotated[list[Poi], Depends(get_pois)],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 10,
) -> list[NearbyPoi]:
    """Restaurants or convenience stores near `from`, sorted by travel time."""
    coord = parse_lat_lng(origin, "from")
    key = (round(coord.lat, 4), round(coord.lng, 4), category, mode, limit)  # ~10 m
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    result = nearby(pois, coord, category, mode, limit, valhalla.matrix)
    _cache[key] = (now + CACHE_TTL_S, result)
    return result
