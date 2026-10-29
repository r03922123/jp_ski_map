from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from hakuba_api.places.gmaps_link import (
    is_google_maps_url,
    is_short_link,
    parse_google_maps_url,
    resolve_short_link,
)
from hakuba_api.places.models import Place
from hakuba_api.places.photon import search_photon

router = APIRouter(prefix="/api/places")


@router.get("/search", response_model=list[Place], response_model_by_alias=True)
def search(q: str, limit: Annotated[int, Query(ge=1, le=20)] = 10) -> list[Place]:
    if not q.strip():
        raise HTTPException(422, "q must not be empty")
    if is_google_maps_url(q):
        url = resolve_short_link(q) if is_short_link(q) else q
        place = parse_google_maps_url(url) if url else None
        return [place] if place else []
    return search_photon(q, limit)
