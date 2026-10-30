"""Search-as-you-type: the local index first, Photon only when it comes up short."""

import logging
from functools import cache

from hakuba_api.common.geo import Coord, in_hakuba
from hakuba_api.common.models import ApiModel
from hakuba_api.common.upstream import UpstreamError
from hakuba_api.places.index import Entry, Hit, Kind, build_index, rank, shares_distinctive_word
from hakuba_api.places.models import Place
from hakuba_api.places.photon import search_photon
from hakuba_api.places.query_clean import clean_query

log = logging.getLogger(__name__)

MIN_LOCAL_HITS = 3  # fewer than this → ask Photon too
MIN_PHOTON_QUERY_LEN = 3
DEDUPE_M = 50


class Suggestion(ApiModel):
    id: str
    kind: Kind
    name: str
    name_ja: str | None
    coord: Coord
    detail: str | None
    match: tuple[int, int] | None  # span of `name` to highlight
    source: str  # "index" | "photon" | "gmaps-link"


@cache
def load_index() -> list[Entry]:
    from hakuba_api.bus.store import load_stops
    from hakuba_api.catalog.store import load_resorts
    from hakuba_api.places.lodging import load_lodging
    from hakuba_api.pois.store import load_pois

    return build_index(load_stops(), load_resorts(), load_lodging(), load_pois())


def _from_hit(h: Hit) -> Suggestion:
    e = h.entry
    return Suggestion(
        id=e.id,
        kind=e.kind,
        name=e.name,
        name_ja=e.name_ja,
        coord=e.coord,
        detail=e.detail,
        match=h.match,
        source="index",
    )


def from_place(p: Place) -> Suggestion:
    kind: Kind = "lodging" if p.kind != "other" else "place"
    return Suggestion(
        id=p.id,
        kind=kind,
        name=p.name,
        name_ja=p.name_ja,
        coord=p.coord,
        detail=p.address or p.kind.replace("_", " ").title(),
        match=None,
        source=p.source,
    )


def _close(a: Coord, b: Coord) -> bool:
    return abs(a.lat - b.lat) < DEDUPE_M / 111_000 and abs(a.lng - b.lng) < DEDUPE_M / 90_000


def suggest(
    query: str,
    near: Coord,
    limit: int,
    entries: list[Entry] | None = None,
    use_photon: bool = True,
) -> list[Suggestion]:
    query = clean_query(query)  # pasted hotel-site URLs and page titles → the name
    local = [
        _from_hit(h)
        for h in rank(entries if entries is not None else load_index(), query, near, limit)
    ]
    if not use_photon or len(local) >= MIN_LOCAL_HITS or len(query.strip()) < MIN_PHOTON_QUERY_LEN:
        return local
    try:
        remote = search_photon(query, limit)
    except UpstreamError as e:  # Photon is optional here
        log.warning("photon fallback failed: %s", e)
        return local
    extra = [
        from_place(p)
        for p in remote
        if in_hakuba(p.coord)
        and shares_distinctive_word(query, p.name)  # no confidently wrong hotels
        and not any(_close(p.coord, s.coord) for s in local)
    ]
    return (local + extra)[:limit]
