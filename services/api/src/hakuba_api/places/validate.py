"""Checks for the lodging snapshots (OSM + Overture), run by `hakuba_api.data.validate`."""

from collections import Counter

from hakuba_api.common.geo import in_hakuba
from hakuba_api.places.lodging_extras import AliasesFile, ReadingsFile
from hakuba_api.places.models import Place
from hakuba_api.places.refresh_overture import _same_place  # pyright: ignore[reportPrivateUsage]


def validate_lodging(osm: list[Place], overture: list[Place]) -> list[str]:
    errors: list[str] = []
    ids = Counter(p.id for p in [*osm, *overture])
    errors += [f"lodging: duplicate id {pid}" for pid, n in ids.items() if n > 1]
    for p in [*osm, *overture]:
        if not p.name.strip():
            errors.append(f"lodging: {p.id} has no name")
        if not in_hakuba(p.coord):
            errors.append(f"lodging: {p.id} is outside the Hakuba bbox")
    for p in overture:
        if twin := next((o for o in osm if _same_place(p, o)), None):
            errors.append(f"lodging: {p.id} duplicates {twin.id} ({p.name})")
    return errors


def validate_extras(
    lodging: list[Place], readings: ReadingsFile, aliases: AliasesFile
) -> list[str]:
    """Readings and aliases must name a lodging we hold; an alias needs the https page it
    came from, and one name is listed once per lodging (SPEC-place-search v1.5)."""
    errors: list[str] = []
    ids = {p.id for p in lodging}
    for r in readings.readings:
        if r.id not in ids:
            errors.append(f"lodging readings: unknown id {r.id}")
        if not r.romaji or not all(f.strip() for f in r.romaji):
            errors.append(f"lodging readings: {r.id} has an empty romaji form")
    seen: set[tuple[str, str]] = set()
    for a in aliases.aliases:
        if a.id not in ids:
            errors.append(f"lodging aliases: unknown id {a.id}")
        if not a.alias.strip():
            errors.append(f"lodging aliases: {a.id} has an empty alias")
        if not a.source.startswith("https://"):
            errors.append(f"lodging aliases: {a.id} '{a.alias}' needs an https source")
        key = (a.id, a.alias.casefold())
        if key in seen:
            errors.append(f"lodging aliases: {a.id} lists '{a.alias}' twice")
        seen.add(key)
    return errors
