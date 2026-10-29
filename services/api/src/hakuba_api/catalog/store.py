from functools import cache

from pydantic import TypeAdapter

from hakuba_api.catalog.models import Resort
from hakuba_api.data.paths import data_dir

_resorts_adapter = TypeAdapter(list[Resort])


@cache
def load_resorts() -> list[Resort]:
    return _resorts_adapter.validate_json((data_dir() / "resorts.json").read_bytes())


def get_resort(resort_id: str) -> Resort | None:
    return next((r for r in load_resorts() if r.id == resort_id), None)
