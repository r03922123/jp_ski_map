from typing import Any

import httpx

from hakuba_api.common.cache import TtlCache
from hakuba_api.common.geo import Coord, in_hakuba
from hakuba_api.common.ratelimit import spend_upstream
from hakuba_api.common.upstream import USER_AGENT, UpstreamError
from hakuba_api.places.models import LODGING_KINDS, Place, PlaceKind

PHOTON_URL = "https://photon.komoot.io/api/"
HAKUBA_BIAS = {"lat": 36.70, "lon": 137.86}
OSM_TYPES = {"N": "node", "W": "way", "R": "relation"}

_cache = TtlCache[tuple[str, int], list[Place]](ttl_s=24 * 3600)


def clear_cache() -> None:
    _cache.clear()


def to_place(feature: dict[str, Any]) -> Place:
    p = feature["properties"]
    lng, lat = feature["geometry"]["coordinates"]
    value = p.get("osm_value")
    kind: PlaceKind = value if value in LODGING_KINDS else "other"
    address = ", ".join(x for x in (p.get("street"), p.get("district"), p.get("city")) if x)
    return Place(
        id=f"osm:{OSM_TYPES.get(p.get('osm_type'), 'node')}/{p.get('osm_id')}",
        name=p.get("name") or p.get("street") or "Unnamed place",
        kind=kind,
        coord=Coord(lat=lat, lng=lng),
        address=address or None,
        source="photon",
    )


def search_photon(query: str, limit: int) -> list[Place]:
    key = (" ".join(query.lower().split()), limit)
    if (cached := _cache.get(key)) is not None:
        return cached
    spend_upstream("photon")
    try:
        response = httpx.get(
            PHOTON_URL,
            params={"q": query.strip(), "limit": limit, **HAKUBA_BIAS},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise UpstreamError("photon", str(e)) from e
    places = [to_place(f) for f in response.json()["features"]]
    # stable sort: Photon's relevance order is kept within each group
    places.sort(key=lambda p: not in_hakuba(p.coord))
    _cache.set(key, places)
    return places
