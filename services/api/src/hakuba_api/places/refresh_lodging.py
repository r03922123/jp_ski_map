"""Refresh data/lodging_osm.json from Overpass: `python -m hakuba_api.places.refresh_lodging`.

Run manually (or weekly). Requests never hit Overpass live — they read this snapshot.
"""

import json
from typing import Any

from hakuba_api.common.geo import HAKUBA_BBOX, Coord
from hakuba_api.data.paths import data_dir
from hakuba_api.places.models import LODGING_KINDS, Place, PlaceKind
from hakuba_api.places.overpass import fetch_overpass


def lodging_query() -> str:
    b = HAKUBA_BBOX
    bbox = f"{b['south']},{b['west']},{b['north']},{b['east']}"
    kinds = "|".join(LODGING_KINDS)
    return f'[out:json][timeout:60];nwr["tourism"~"^({kinds})$"]({bbox});out tags center;'


def elements_to_places(elements: list[dict[str, Any]]) -> list[Place]:
    places: list[Place] = []
    for e in elements:
        tags = e.get("tags", {})
        name = tags.get("name:en") or tags.get("name")
        point = e.get("center") or e
        if not name or "lat" not in point:
            continue
        tourism = tags.get("tourism")
        kind: PlaceKind = tourism if tourism in LODGING_KINDS else "other"
        address = ", ".join(x for x in (tags.get("addr:street"), tags.get("addr:city")) if x)
        places.append(
            Place(
                id=f"osm:{e['type']}/{e['id']}",
                name=name,
                name_ja=tags.get("name:ja") or (tags.get("name") if tags.get("name:en") else None),
                kind=kind,
                coord=Coord(lat=point["lat"], lng=point["lon"]),
                address=address or None,
                source="osm-snapshot",
            )
        )
    return places


def main() -> None:
    places = elements_to_places(fetch_overpass(lodging_query())["elements"])
    places.sort(key=lambda p: p.id)
    path = data_dir() / "lodging_osm.json"
    rows = [p.model_dump(by_alias=True) for p in places]
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {len(places)} lodgings to {path}")


if __name__ == "__main__":
    main()
