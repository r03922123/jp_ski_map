"""Refresh data/poi_osm.json from Overpass: `python -m hakuba_api.pois.refresh_pois`.

Run manually (or with the lodging refresh). Requests never hit Overpass live — they
read this snapshot. See SPEC-poi-destinations.md.
"""

import json
from typing import Any

from hakuba_api.common.geo import HAKUBA_BBOX, Coord
from hakuba_api.data.paths import data_dir
from hakuba_api.places.overpass import fetch_overpass
from hakuba_api.pois.models import FOOD_AMENITIES, Poi, PoiCategory


def poi_query() -> str:
    b = HAKUBA_BBOX
    bbox = f"{b['south']},{b['west']},{b['north']},{b['east']}"
    food = "|".join(FOOD_AMENITIES)
    return (
        "[out:json][timeout:90];"
        f'(nwr["amenity"~"^({food})$"]({bbox});nwr["shop"="convenience"]({bbox}););'
        "out tags center;"
    )


def _category(tags: dict[str, str]) -> PoiCategory | None:
    if tags.get("shop") == "convenience":
        return "convenience"
    if tags.get("amenity") in FOOD_AMENITIES:
        return "food"
    return None


def elements_to_pois(elements: list[dict[str, Any]]) -> list[Poi]:
    pois: list[Poi] = []
    for e in elements:
        tags: dict[str, str] = e.get("tags", {})
        category = _category(tags)
        name = tags.get("name:en") or tags.get("name") or tags.get("brand:en") or tags.get("brand")
        point = e.get("center") or e
        if category is None or not name or "lat" not in point:
            continue
        pois.append(
            Poi(
                id=f"osm:{e['type']}/{e['id']}",
                category=category,
                name=name,
                name_ja=tags.get("name:ja") or tags.get("name"),
                coord=Coord(lat=point["lat"], lng=point["lon"]),
                brand=tags.get("brand:en") or tags.get("brand"),
                cuisine=tags.get("cuisine"),
                opening_hours=tags.get("opening_hours"),
            )
        )
    return pois


def main() -> None:
    pois = elements_to_pois(fetch_overpass(poi_query())["elements"])
    pois.sort(key=lambda p: p.id)
    path = data_dir() / "poi_osm.json"
    rows = [p.model_dump(by_alias=True) for p in pois]
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n")
    counts = {c: sum(p.category == c for p in pois) for c in ("food", "convenience")}
    print(f"wrote {len(pois)} POIs to {path} ({counts})")


if __name__ == "__main__":
    main()
