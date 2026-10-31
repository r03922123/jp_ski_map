"""The Hakuba-only routing tiles (SPEC-deploy) must cover every place the app knows about."""

import json
import math
from collections.abc import Iterator
from pathlib import Path
from typing import cast

from hakuba_api.data.paths import data_dir

BBOX_FILE = Path(__file__).resolve().parents[4] / "infra" / "valhalla" / "hakuba.bbox"
MARGIN_KM = 5.0  # room for a route between two valley places that leaves the valley


def coords(node: object) -> Iterator[tuple[float, float]]:
    if isinstance(node, dict):
        d = cast("dict[str, object]", node)
        if "lat" in d and "lng" in d:
            yield float(cast("float", d["lat"])), float(cast("float", d["lng"]))
        for value in d.values():
            yield from coords(value)
    elif isinstance(node, list):
        for value in cast("list[object]", node):
            yield from coords(value)


def test_every_place_in_data_is_inside_the_tile_bbox_with_margin() -> None:
    west, south, east, north = (float(v) for v in BBOX_FILE.read_text().strip().split(","))
    dlat = MARGIN_KM / 111.0
    outside: list[str] = []
    count = 0
    for path in sorted(data_dir().rglob("*.json")):
        for lat, lng in coords(json.loads(path.read_text())):
            count += 1
            dlng = MARGIN_KM / (111.0 * math.cos(math.radians(lat)))
            if not (south + dlat <= lat <= north - dlat and west + dlng <= lng <= east - dlng):
                outside.append(f"{path.name}: {lat},{lng}")
    assert count > 1000  # resorts, stops, lodging, POIs were all read
    assert outside == []
