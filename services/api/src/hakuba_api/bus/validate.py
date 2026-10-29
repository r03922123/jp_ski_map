"""Timetable checks that catch transcription mistakes (see SPEC-bus-schedules.md)."""

from collections import defaultdict

from hakuba_api.bus.check_sources import SourcesManifest
from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.common.geo import Coord
from hakuba_api.data.paths import data_dir

# Hakuba Valley plus the Omachi end of lines O and G6
BUS_BBOX = {"south": 36.45, "west": 137.70, "north": 36.90, "east": 137.95}


def _in_bus_area(c: Coord) -> bool:
    b = BUS_BBOX
    return b["south"] <= c.lat <= b["north"] and b["west"] <= c.lng <= b["east"]


def _validate_stops(stops: list[BusStop], resort_ids: set[str]) -> list[str]:
    errors: list[str] = []
    owner: dict[str, str] = {}
    for s in stops:
        for alias in s.aliases:
            if alias in owner:
                errors.append(f"alias '{alias}' belongs to {owner[alias]} and {s.id}")
            owner[alias] = s.id
        if s.serves_resort_id and s.serves_resort_id not in resort_ids:
            errors.append(f"{s.id}: unknown resort {s.serves_resort_id}")
        if s.coord and not _in_bus_area(s.coord):
            errors.append(f"{s.id}: coord outside the bus area")
    return errors


def _validate_timetable(t: Timetable, aliases: set[str], source_files: set[str]) -> list[str]:
    errors: list[str] = []
    if t.valid_from > t.valid_to:
        errors.append(f"{t.route_id}: validFrom after validTo")
    if t.source.file not in source_files:
        errors.append(f"{t.route_id}: source {t.source.file} not in sources.json")
    for d in t.directions:
        where = f"{t.route_id}/{d.id}"
        errors += [f"{where}: unknown stop '{s}'" for s in d.stops if s not in aliases]
        for trip in d.trips:
            if len(trip.times) != len(d.stops):
                errors.append(
                    f"{where} trip {trip.n}: {len(trip.times)} times for {len(d.stops)} stops"
                )
                continue
            if all(x is None for x in trip.times):
                errors.append(f"{where} trip {trip.n}: no times")
            last = None
            for stop, time in zip(d.stops, trip.times, strict=True):
                if time is None:
                    continue
                # equal is fine: neighbouring stops are often printed with the same minute
                if last is not None and time < last:
                    errors.append(
                        f"{where} trip {trip.n}: {time} at '{stop}' is earlier than {last}"
                    )
                last = time
    return errors


def _validate_periods(tables: list[Timetable]) -> list[str]:
    by_route: dict[str, list[Timetable]] = defaultdict(list)
    for t in tables:
        by_route[t.route_id].append(t)
    errors: list[str] = []
    for route, items in by_route.items():
        items.sort(key=lambda t: t.valid_from)
        for a, b in zip(items, items[1:], strict=False):
            if b.valid_from <= a.valid_to:
                errors.append(
                    f"{route}: periods overlap ({a.valid_from}..{a.valid_to}, "
                    f"{b.valid_from}..{b.valid_to})"
                )
    return errors


def validate_bus(
    stops: list[BusStop],
    timetables: list[Timetable],
    source_files: set[str],
    resort_ids: set[str],
) -> list[str]:
    aliases = {a for s in stops for a in s.aliases}
    errors = _validate_stops(stops, resort_ids)
    for t in timetables:
        errors += _validate_timetable(t, aliases, source_files)
    return errors + _validate_periods(timetables)


def validate_seasons(manifest_season: str, transcribed: list[str]) -> list[str]:
    """The sources manifest must name the latest transcribed season (or a newer one)."""
    latest = max(transcribed, default=None)
    if latest is not None and manifest_season < latest:
        return [
            f"bus/sources.json season {manifest_season} is older than transcribed season "
            f"{latest}; run check_sources --accept"
        ]
    return []


def validate_repository() -> list[str]:
    from hakuba_api.bus.store import load_stops, load_timetables
    from hakuba_api.catalog.store import load_resorts

    manifest_path = data_dir() / "bus" / "sources.json"
    manifest = SourcesManifest.model_validate_json(manifest_path.read_text())
    timetables = load_timetables()
    return validate_bus(
        load_stops(),
        timetables,
        {a.file for a in manifest.assets},
        {r.id for r in load_resorts()},
    ) + validate_seasons(manifest.season, [t.season for t in timetables])
