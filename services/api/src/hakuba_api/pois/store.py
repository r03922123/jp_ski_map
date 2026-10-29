from functools import cache

from pydantic import TypeAdapter

from hakuba_api.data.paths import data_dir
from hakuba_api.pois.models import Poi

_adapter = TypeAdapter(list[Poi])


@cache
def load_pois() -> list[Poi]:
    return _adapter.validate_json((data_dir() / "poi_osm.json").read_bytes())
