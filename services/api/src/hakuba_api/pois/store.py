from functools import cache

from pydantic import TypeAdapter

from hakuba_api.data.paths import data_dir
from hakuba_api.pois.models import Poi

_adapter = TypeAdapter(list[Poi])
_ids = TypeAdapter(dict[str, str])


def load_osm_pois() -> list[Poi]:
    return _adapter.validate_json((data_dir() / "poi_osm.json").read_bytes())


@cache
def load_google_ids() -> dict[str, str]:
    """OSM POI id → Google place ID (SPEC-poi-destinations v1.2)."""
    return _ids.validate_json((data_dir() / "poi_google.json").read_bytes())


@cache
def load_pois() -> list[Poi]:
    ids = load_google_ids()
    return [p.model_copy(update={"google_place_id": ids.get(p.id)}) for p in load_osm_pois()]
