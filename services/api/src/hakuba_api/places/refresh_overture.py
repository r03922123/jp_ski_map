"""Refresh data/lodging_overture.json from Overture Maps Places (SPEC-place-search v1.3).

Usage: `uv run --with duckdb python -m hakuba_api.places.refresh_overture`

Overture knows ~880 Hakuba lodgings where OpenStreetMap knows ~150, including most hotels
people find on booking sites. Each record keeps its providers' licences, named in its `sources`
(Meta and Microsoft: CDLA-Permissive-2.0; Foursquare: Apache-2.0; AllThePlaces: CC0-1.0), so
.meta.json is built from them. DuckDB reads only the Hakuba bbox from the public GeoParquet
release; it is a refresh-time tool, not a project dependency. Requests read the snapshot, never
Overture.
"""

import json
import re
import sys
from collections import Counter
from datetime import UTC, datetime
from typing import NotRequired, TypedDict

import httpx

from hakuba_api.common.geo import HAKUBA_BBOX, Coord
from hakuba_api.data.paths import data_dir
from hakuba_api.places.index import (
    _km,  # pyright: ignore[reportPrivateUsage]
    _tokens,  # pyright: ignore[reportPrivateUsage]
    normalize,
)
from hakuba_api.places.models import Place, PlaceKind

BUCKET_URL = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"
MIN_CONFIDENCE = 0.5
SAME_PLACE_M = 80

# Each licence Overture's attribution page gives for Places data, by the SPDX id a record's
# `sources` names: its URL, and the copy in LICENSES/ when the licence asks for its text
KNOWN_LICENSES: dict[str, tuple[str, str | None]] = {
    "CDLA-Permissive-2.0": ("https://cdla.dev/permissive-2-0/", "LICENSES/CDLA-Permissive-2.0.txt"),
    "Apache-2.0": ("https://www.apache.org/licenses/LICENSE-2.0", "LICENSES/Apache-2.0.txt"),
    "CC0-1.0": ("https://creativecommons.org/publicdomain/zero/1.0/", None),
}
# A provider's own NOTICE and credit, which go with its records (Apache-2.0 §4(d))
NOTICES: dict[str, tuple[str, str]] = {
    "Foursquare": ("LICENSES/Foursquare-NOTICE.txt", "© Foursquare Labs, Inc."),
}


class OvertureSource(TypedDict):
    dataset: str | None  # both optional in Overture's SourceItem schema
    license: str | None


class OvertureRow(TypedDict):
    id: str
    name: str | None
    tax: str | None
    conf: float
    lat: float
    lng: float
    addr: str | None
    sources: NotRequired[list[OvertureSource] | None]  # optional in Overture's schema


class DatasetLicense(TypedDict):
    dataset: str
    license: str
    licenseUrl: str
    places: int
    licenseText: NotRequired[str]
    notice: NotRequired[str]


_KIND: dict[str, PlaceKind] = {
    "hotel": "hotel",
    "resort": "hotel",
    "inn": "hotel",
    "lodge": "guest_house",
    "bed_and_breakfast": "guest_house",
    "hostel": "hostel",
    "holiday_rental_home": "apartment",
    "private_lodging": "apartment",
    "service_apartment": "apartment",
    "cabin": "chalet",
    "cottage": "chalet",
}

# A place whose own name says hotel is one, whatever a loose category says: Overture
# files some big hotels under "lodge" (Hakuba Tokyu Hotel showed as "Guest House").
_HOTEL_NAME = re.compile(r"\bhotel\b|ホテル", re.IGNORECASE)
# ...except a "hotel pension" (ホテルペンション): a small family-run guest house
_PENSION_NAME = re.compile(r"\bpension\b|ペンション", re.IGNORECASE)


def _kind(tax: str | None, name: str) -> PlaceKind:
    kind = _KIND.get(tax or "", "other")
    if (
        kind in ("guest_house", "other")
        and _HOTEL_NAME.search(name)
        and not _PENSION_NAME.search(name)
    ):
        return "hotel"
    return kind


_JA = r"　-ヿ㐀-鿿＀-￯"
# "Latin name - 日本語名" / "Latin name 日本語名", and "日本語名(Latin name)"
_LATIN_THEN_JA = re.compile(
    rf"^(?P<en>[^{_JA}]*[A-Za-z][^{_JA}]*?)[\s\-–—|/]*(?P<ja>[{_JA}][^A-Za-z]*)$"
)
_JA_THEN_LATIN = re.compile(
    rf"^(?P<ja>[{_JA}][^A-Za-z(（]*?)\s*[(（](?P<en>[^{_JA}()（）]*[A-Za-z][^{_JA}()（）]*)[)）]$"
)
_HAS_JA = re.compile(rf"[{_JA}]")
_HAS_LATIN = re.compile(r"[A-Za-z]")
# a booking feed's room listing: "Piremon - Economy Twin Room", "… - Three-Bedroom Villa"
_SPACED_DASH = re.compile(r"\s+[-–—]\s+")
_ROOM_WORDS = re.compile(
    r"\b(rooms?|bedrooms?|beds?|twin|double|single|dormitory|suite|studio)\b", re.IGNORECASE
)


def split_names(primary: str) -> tuple[str | None, str | None]:
    """(English, Japanese) from one mixed name; a name in one script fills one side."""
    primary = primary.strip()
    for pattern in (_LATIN_THEN_JA, _JA_THEN_LATIN):
        if m := pattern.match(primary):
            return m.group("en").strip(" -–—|/"), m.group("ja").strip()
    if _HAS_JA.search(primary) and not _HAS_LATIN.search(primary):
        return None, primary
    return primary, None


def strip_room_type(name: str) -> str:
    dashes = list(_SPACED_DASH.finditer(name))
    if dashes and _ROOM_WORDS.search(name[dashes[-1].end() :]):
        return name[: dashes[-1].start()].strip()
    return name.strip()


def rows_to_places(rows: list[OvertureRow], min_confidence: float = MIN_CONFIDENCE) -> list[Place]:
    places: list[Place] = []
    for r in rows:
        if r["conf"] < min_confidence or not r["name"]:
            continue
        en, ja = split_names(strip_room_type(r["name"]))
        name = en or ja
        if not name:
            continue
        places.append(
            Place(
                id=f"overture:{r['id']}",
                name=name,
                name_ja=ja,
                kind=_kind(r["tax"], r["name"]),
                coord=Coord(lat=r["lat"], lng=r["lng"]),
                address=r["addr"],
                source="overture-snapshot",
            )
        )
    return places


# Words that never tell two places apart. Unlike search's GENERIC set, type words
# (hotel, chalets, inn) stay: "Phoenix Hotel" and "Phoenix Chalets" are neighbours, not one.
_NOT_IDENTITY = {"the", "by", "and", "&", "of", "hakuba", "japan", "nagano", "resort"}


def _identity(name: str) -> set[str]:
    return {t for t in _tokens(normalize(name)) if t not in _NOT_IDENTITY}


def _same_place(a: Place, b: Place) -> bool:
    """Nearby, and one name's identifying words contained in the other's (or equal names)."""
    if _km(a.coord, b.coord) * 1000 > SAME_PLACE_M:
        return False
    names_a = {normalize(n) for n in (a.name, a.name_ja) if n}
    names_b = {normalize(n) for n in (b.name, b.name_ja) if n}
    if names_a & names_b:
        return True
    words_a, words_b = _identity(a.name), _identity(b.name)
    return bool(words_a and words_b) and (words_a <= words_b or words_b <= words_a)


def dedupe_against(places: list[Place], existing: list[Place]) -> list[Place]:
    """Drop places already present, first against `existing` (OSM wins), then among
    themselves."""
    kept: list[Place] = []
    for p in places:
        if any(_same_place(p, e) for e in existing) or any(_same_place(p, k) for k in kept):
            continue
        kept.append(p)
    return kept


def latest_release(listing_xml: str) -> str:
    releases = re.findall(r"<Prefix>release/(\d{4}-\d{2}-\d{2}\.\d+)/</Prefix>", listing_xml)
    if not releases:
        raise ValueError("no Overture releases in the bucket listing")
    return max(releases, key=lambda r: (r.split(".")[0], int(r.split(".")[1])))


def build_meta(
    release: str, fetched_at: str, rows: list[OvertureRow], places: list[Place]
) -> dict[str, object]:
    """The .meta.json: one licence entry per dataset in the kept places' `sources`, with how
    many places use it. A missing provider or licence, one not in KNOWN_LICENSES, or Apache-2.0
    data with no NOTICES entry stops the refresh, because a label that leaves any of these out
    breaks that licence."""
    sources = {f"overture:{r['id']}": r.get("sources") or [] for r in rows}
    counts: Counter[tuple[str, str]] = Counter()
    for p in places:
        if not sources[p.id]:
            raise ValueError(f"{p.id} names no source, so its licence is unknown")
        for dataset, lic in {(s["dataset"], s["license"]) for s in sources[p.id]}:
            if not dataset:
                raise ValueError(f"{p.id}: a source names no dataset, so it can't be credited")
            if lic is None or lic not in KNOWN_LICENSES:
                raise ValueError(f"{p.id}: {dataset} data under {lic!r} needs KNOWN_LICENSES")
            if lic == "Apache-2.0" and dataset not in NOTICES:
                raise ValueError(f"{p.id}: Apache-2.0 data from {dataset} needs NOTICES")
            counts[dataset, lic] += 1
    licenses: list[DatasetLicense] = []
    by_licence: dict[str, list[str]] = {}
    for (dataset, lic), n in sorted(counts.items(), key=lambda c: (c[0][0].casefold(), c[0][1])):
        url, text = KNOWN_LICENSES[lic]
        licenses.append(DatasetLicense(dataset=dataset, license=lic, licenseUrl=url, places=n))
        if text:
            licenses[-1]["licenseText"] = text
        if dataset in NOTICES:
            licenses[-1]["notice"] = NOTICES[dataset][0]
        by_licence.setdefault(lic, []).append(dataset)
    terms = "; ".join(f"{lic}: {', '.join(names)}" for lic, names in sorted(by_licence.items()))
    credits = sorted({NOTICES[d][1] for d, _ in counts if d in NOTICES})
    return {
        "release": release,
        "fetchedAt": fetched_at,
        "license": " AND ".join(sorted(by_licence)),  # an SPDX expression
        "licenses": licenses,
        "attribution": "; ".join([f"Overture Maps Foundation ({terms})", *credits]),
        "rows": len(rows),
        "places": len(places),
    }


def fetch_rows(release: str) -> list[OvertureRow]:  # pragma: no cover - network
    import duckdb  # pyright: ignore[reportMissingImports]  # `uv run --with duckdb`

    b = HAKUBA_BBOX
    con = duckdb.connect()  # pyright: ignore[reportUnknownVariableType, reportUnknownMemberType]
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")  # pyright: ignore[reportUnknownMemberType]
    rows = con.execute(  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        f"""
        SELECT id, names."primary", taxonomy."primary", confidence,
               (bbox.ymin + bbox.ymax) / 2, (bbox.xmin + bbox.xmax) / 2,
               addresses[1].freeform, sources
        FROM read_parquet(
          's3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*',
          hive_partitioning=1)
        WHERE bbox.xmin BETWEEN {b["west"]} AND {b["east"]}
          AND bbox.ymin BETWEEN {b["south"]} AND {b["north"]}
          AND list_contains(taxonomy.hierarchy, 'lodging')
          AND NOT list_contains(taxonomy.hierarchy, 'ski_resort')
        """
    ).fetchall()
    keys = ("id", "name", "tax", "conf", "lat", "lng", "addr", "sources")
    return [OvertureRow(**dict(zip(keys, r, strict=True))) for r in rows]  # type: ignore[typeddict-item]


def main() -> int:  # pragma: no cover - network
    from hakuba_api.places.lodging import load_osm_lodging

    listing = httpx.get(
        BUCKET_URL, params={"list-type": "2", "prefix": "release/", "delimiter": "/"}, timeout=30
    )
    listing.raise_for_status()
    release = latest_release(listing.text)
    rows = fetch_rows(release)
    places = dedupe_against(rows_to_places(rows), load_osm_lodging())
    places.sort(key=lambda p: p.id)
    # built before either file is written, so an unknown licence leaves both as they were
    meta = build_meta(release, datetime.now(UTC).isoformat(timespec="seconds"), rows, places)
    out = data_dir() / "lodging_overture.json"
    out.write_text(
        json.dumps([p.model_dump(by_alias=True) for p in places], ensure_ascii=False, indent=1)
        + "\n"
    )
    (data_dir() / "lodging_overture.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1) + "\n"
    )
    print(f"release {release}: {len(rows)} rows → {len(places)} lodgings (after OSM dedupe)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
