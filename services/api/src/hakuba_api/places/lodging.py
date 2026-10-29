from functools import cache

from pydantic import TypeAdapter

from hakuba_api.data.paths import data_dir
from hakuba_api.places.models import Place

MAX_BBOX_DEG = 0.25

_places_adapter = TypeAdapter(list[Place])


@cache
def load_lodging() -> list[Place]:
    return _places_adapter.validate_json((data_dir() / "lodging_osm.json").read_bytes())


def lodging_in_bbox(south: float, west: float, north: float, east: float) -> list[Place]:
    return [
        p for p in load_lodging() if south <= p.coord.lat <= north and west <= p.coord.lng <= east
    ]
