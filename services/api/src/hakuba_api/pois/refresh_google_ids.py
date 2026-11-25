"""Match food POIs to Google place IDs: `python -m hakuba_api.pois.refresh_google_ids`.

Network, so never in CI: the owner runs it once per season with a server key in
GOOGLE_PLACES_SERVER_KEY. It stores place IDs only, which Google allows indefinitely (refresh
those older than 12 months). See SPEC-poi-destinations.md v1.2.
"""

import json
import math
import os
from collections.abc import Callable
from datetime import date
from typing import Any

import httpx

from hakuba_api.data.paths import data_dir
from hakuba_api.pois.models import Poi
from hakuba_api.pois.store import load_osm_pois

URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = "places.id"  # SKU "Text Search Essentials (IDs Only)": free and unlimited
HALF_SIDE_M = 100
M_PER_DEG_LAT = 111_320

Search = Callable[[dict[str, str], dict[str, Any]], dict[str, Any]]


def search_request(poi: Poi) -> tuple[dict[str, str], dict[str, Any]]:
    """Headers (without the key) and body of one Text Search (New) request."""
    d_lat = HALF_SIDE_M / M_PER_DEG_LAT
    d_lng = d_lat / math.cos(math.radians(poi.coord.lat))
    box = {
        "low": {"latitude": poi.coord.lat - d_lat, "longitude": poi.coord.lng - d_lng},
        "high": {"latitude": poi.coord.lat + d_lat, "longitude": poi.coord.lng + d_lng},
    }
    body = {
        "textQuery": poi.name_ja or poi.name,
        "locationRestriction": {"rectangle": box},
        "pageSize": 1,
    }
    return {"X-Goog-FieldMask": FIELD_MASK}, body


def place_id(response: dict[str, Any]) -> str | None:
    places: list[dict[str, str]] = response.get("places") or []  # no match answers {}
    return places[0]["id"] if places else None


def match_ids(pois: list[Poi], search: Search) -> dict[str, str]:
    ids: dict[str, str] = {}
    for poi in pois:
        if poi.category != "food":
            continue
        found = place_id(search(*search_request(poi)))
        if found:
            ids[poi.id] = found
    return ids


def main() -> None:
    key = os.environ["GOOGLE_PLACES_SERVER_KEY"]

    def search(headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        response = httpx.post(
            URL, headers={**headers, "X-Goog-Api-Key": key}, json=body, timeout=30
        )
        response.raise_for_status()
        return response.json()

    pois = load_osm_pois()
    ids = match_ids(pois, search)
    food = sum(p.category == "food" for p in pois)
    out = data_dir() / "poi_google.json"
    out.write_text(json.dumps(dict(sorted(ids.items())), indent=1) + "\n")
    meta = {"date": date.today().isoformat(), "matched": len(ids), "unmatched": food - len(ids)}
    (data_dir() / "poi_google.meta.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"wrote {len(ids)} of {food} food POIs to {out}")


if __name__ == "__main__":
    main()
