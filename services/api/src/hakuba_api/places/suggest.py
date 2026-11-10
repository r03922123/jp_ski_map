"""Search-as-you-type: the local index first, Photon only when it comes up short."""

import logging
import re
from functools import cache

from hakuba_api.common.geo import Coord, in_hakuba
from hakuba_api.common.models import ApiModel
from hakuba_api.common.upstream import UpstreamError
from hakuba_api.places import semantic
from hakuba_api.places.index import (
    Entry,
    Hit,
    Kind,
    build_index,
    fits_lodging_words,
    names_a_place,
    rank,
    shares_distinctive_word,
)
from hakuba_api.places.models import Place
from hakuba_api.places.photon import search_photon
from hakuba_api.places.query_clean import clean_query

log = logging.getLogger(__name__)

MIN_LOCAL_HITS = 3  # fewer than this → ask Photon too
MIN_PHOTON_QUERY_LEN = 3
DEDUPE_M = 50
# Chinese words for a hotel. Only a fallback: 白馬飯店 is a real restaurant here.
_CHINESE_HOTEL = re.compile("飯店|饭店|酒店|旅馆")


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


def _from_entry(e: Entry, match: tuple[int, int] | None = None) -> Suggestion:
    return Suggestion(
        id=e.id,
        kind=e.kind,
        name=e.name,
        name_ja=e.name_ja,
        coord=e.coord,
        detail=e.detail,
        match=match,
        source="index",
    )


def _from_hit(h: Hit) -> Suggestion:
    return _from_entry(h.entry, h.match)


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
    index = entries if entries is not None else load_index()
    hits = rank(index, query, near, limit)
    # appended after lexical hits, so a full page of them leaves no room: skip the call
    meaning = semantic.semantic_ids(query, limit) if len(hits) < limit else []
    if not hits and _CHINESE_HOTEL.search(query):
        retry = _CHINESE_HOTEL.sub("ホテル", query)
        if retry_hits := rank(index, retry, near, limit):
            query, hits = retry, retry_hits
    local = [_from_hit(h) for h in hits]
    lexical_n = len(local)
    if meaning:
        # Lexical order stays and meaning only fills in after it: RRF fusion put a look-alike
        # above an exact name ("Hotel Grace Hakuba" → Hakuba Grace Inn) in the v1.4 eval.
        known = {e.id: e for e in index}
        seen = {s.id for s in local}
        for i in meaning:
            e = known.get(i)
            if e is None or i in seen:
                continue
            names = [e.name, *filter(None, [e.name_ja])]
            # a look-alike hotel or stop is a confidently wrong answer (same idea as Photon's)
            named = e.kind not in ("lodging", "stop") or names_a_place(query, " ".join(names))
            if named and fits_lodging_words(query, e.kind, names):
                local.append(_from_entry(e))
                seen.add(i)
        local = local[:limit]
    # semantic food/shop hits carry no name check, so only lexical hits can stand in for Photon
    if not use_photon or lexical_n >= MIN_LOCAL_HITS or len(query.strip()) < MIN_PHOTON_QUERY_LEN:
        return local
    try:
        remote = search_photon(query, limit)
    except UpstreamError as e:  # Photon is optional here
        log.warning("photon fallback failed: %s", e)
        return local
    extra = [
        s
        for s in map(from_place, remote)
        if in_hakuba(s.coord)
        and shares_distinctive_word(query, s.name)  # no confidently wrong hotels
        and fits_lodging_words(query, s.kind, [s.name])
        and not any(_close(s.coord, hit.coord) for hit in local)
    ]
    return (local + extra)[:limit]
