from functools import cache

from pydantic import TypeAdapter

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.data.paths import data_dir

_stops_adapter = TypeAdapter(list[BusStop])


@cache
def load_stops() -> list[BusStop]:
    return _stops_adapter.validate_json((data_dir() / "bus_stops.json").read_bytes())


@cache
def load_timetables() -> list[Timetable]:
    folder = data_dir() / "bus" / "timetables"
    return [Timetable.model_validate_json(p.read_bytes()) for p in sorted(folder.glob("*/*.json"))]


@cache
def load_manifest_season() -> str | None:
    """Season named by the operator's page at the last `check_sources --accept`."""
    from hakuba_api.bus.check_sources import SourcesManifest

    path = data_dir() / "bus" / "sources.json"
    if not path.exists():
        return None
    return SourcesManifest.model_validate_json(path.read_bytes()).season


def stop_by_alias() -> dict[str, BusStop]:
    return {alias: s for s in load_stops() for alias in s.aliases}
