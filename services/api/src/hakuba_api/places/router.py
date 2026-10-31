from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from hakuba_api.common.params import MAX_QUERY_CHARS, parse_lat_lng
from hakuba_api.places.gmaps_link import (
    is_google_maps_url,
    is_short_link,
    parse_google_maps_url,
    resolve_short_link,
)
from hakuba_api.places.lodging import MAX_BBOX_DEG, lodging_in_bbox
from hakuba_api.places.models import Place
from hakuba_api.places.photon import search_photon
from hakuba_api.places.suggest import Suggestion, from_place, suggest

router = APIRouter(prefix="/api/places")

SearchText = Annotated[str, Query(max_length=MAX_QUERY_CHARS)]


@router.get("/search", response_model=list[Place], response_model_by_alias=True)
def search(q: SearchText, limit: Annotated[int, Query(ge=1, le=20)] = 10) -> list[Place]:
    if not q.strip():
        raise HTTPException(422, "q must not be empty")
    if is_google_maps_url(q):
        url = resolve_short_link(q) if is_short_link(q) else q
        place = parse_google_maps_url(url) if url else None
        return [place] if place else []
    return search_photon(q, limit)


@router.get("/suggest", response_model=list[Suggestion], response_model_by_alias=True)
def suggest_places(
    q: SearchText,
    near: Annotated[str, Query()] = "36.70,137.86",
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> list[Suggestion]:
    """Search-as-you-type: a pasted Google Maps link, else the local index, else Photon."""
    if not q.strip():
        return []
    if is_google_maps_url(q):
        url = resolve_short_link(q) if is_short_link(q) else q
        place = parse_google_maps_url(url) if url else None
        return [from_place(place)] if place else []
    return suggest(q, parse_lat_lng(near, "near"), limit)


@router.get("/lodging", response_model=list[Place], response_model_by_alias=True)
def lodging(bbox: str) -> list[Place]:
    """Lodging pins for the current map view, from the OSM snapshot (`south,west,north,east`)."""
    try:
        south, west, north, east = (float(x) for x in bbox.split(","))
    except ValueError:
        raise HTTPException(422, "bbox must be 'south,west,north,east'") from None
    if not (south < north and west < east):
        raise HTTPException(422, "bbox corners are inverted")
    if north - south > MAX_BBOX_DEG or east - west > MAX_BBOX_DEG:
        raise HTTPException(422, f"bbox larger than {MAX_BBOX_DEG} degrees; zoom in")
    return lodging_in_bbox(south, west, north, east)
