"""Checks for the lodging snapshots (OSM + Overture), run by `hakuba_api.data.validate`."""

from collections import Counter

from hakuba_api.common.geo import in_hakuba
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
