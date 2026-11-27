from functools import cache
from typing import TYPE_CHECKING

from pydantic import TypeAdapter

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.data.paths import data_dir

if TYPE_CHECKING:
    from hakuba_api.bus.check_sources import SourcesManifest

_stops_adapter = TypeAdapter(list[BusStop])


@cache
def load_stops() -> list[BusStop]:
    return _stops_adapter.validate_json((data_dir() / "bus_stops.json").read_bytes())


@cache
def load_timetables() -> list[Timetable]:
    folder = data_dir() / "bus" / "timetables"
    tables = [
        Timetable.model_validate_json(p.read_bytes()) for p in sorted(folder.glob("*/*.json"))
    ]
    manifest = load_manifest()
    urls = {a.file: a.url for a in manifest.assets} if manifest else {}
    for t in tables:
        t.source.url = urls.get(t.source.file)  # None once a newer season's page drops the file
    return tables


@cache
def load_manifest() -> "SourcesManifest | None":
    """The operator's page at the last `check_sources --accept`."""
    from hakuba_api.bus.check_sources import SourcesManifest

    path = data_dir() / "bus" / "sources.json"
    if not path.exists():
        return None
    return SourcesManifest.model_validate_json(path.read_bytes())


def load_manifest_season() -> str | None:
    """Season named by the operator's page at the last `check_sources --accept`."""
    manifest = load_manifest()
    return manifest.season if manifest else None


def stop_by_alias() -> dict[str, BusStop]:
    return {alias: s for s in load_stops() for alias in s.aliases}
