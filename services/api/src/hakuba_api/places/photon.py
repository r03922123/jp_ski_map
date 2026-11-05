from typing import Annotated, Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

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


# Strict, and places are built from these models, not the raw dicts: a value pydantic would
# only convert (the text "137.86", true, Infinity) is refused instead of reaching a Place.
_STRICT = ConfigDict(strict=True, allow_inf_nan=False)


class _Properties(BaseModel):
    """The properties to_place reads; Photon sends many more, which are ignored."""

    model_config = _STRICT

    osm_type: str | None = None
    osm_id: int | None = None
    osm_value: str | None = None
    name: str | None = None
    street: str | None = None
    district: str | None = None
    city: str | None = None


class _Geometry(BaseModel):
    model_config = _STRICT

    coordinates: Annotated[list[float], Field(min_length=2, max_length=2)]  # [lng, lat]


class _Feature(BaseModel):
    model_config = _STRICT

    properties: _Properties
    geometry: _Geometry


class _Response(BaseModel):
    model_config = _STRICT

    features: list[_Feature]


def _place(feature: _Feature) -> Place:
    p = feature.properties
    lng, lat = feature.geometry.coordinates
    kind: PlaceKind = p.osm_value if p.osm_value in LODGING_KINDS else "other"
    address = ", ".join(x for x in (p.street, p.district, p.city) if x)
    return Place(
        id=f"osm:{OSM_TYPES.get(p.osm_type or '', 'node')}/{p.osm_id}",
        name=p.name or p.street or "Unnamed place",
        kind=kind,
        coord=Coord(lat=lat, lng=lng),
        address=address or None,
        source="photon",
    )


def to_place(feature: dict[str, Any]) -> Place:
    """One Photon GeoJSON feature → Place; raises pydantic's ValidationError if malformed."""
    return _place(_Feature.model_validate(feature))


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
    # checked here, so a malformed answer is an UpstreamError like an outage (and isn't cached)
    try:
        data = _Response.model_validate(response.json())
    except (ValueError, ValidationError) as e:
        raise UpstreamError("photon", "malformed response") from e
    places = [_place(f) for f in data.features]
    # stable sort: Photon's relevance order is kept within each group
    places.sort(key=lambda p: not in_hakuba(p.coord))
    _cache.set(key, places)
    return places
