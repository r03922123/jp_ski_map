from collections import Counter

from hakuba_api.common.geo import Coord, in_hakuba
from hakuba_api.skiruns.models import LineString, SkiLines


def validate_ski_lines(lines: SkiLines, resort_ids: list[str]) -> list[str]:
    """Rules Pydantic can't express (it already checks the difficulty and lift-type enums)."""
    errors: list[str] = []
    for line_id, n in Counter(f.properties.id for f in lines.features).items():
        if n > 1:
            errors.append(f"ski_lines.json: duplicate id {line_id}")
    for f in lines.features:
        p = f.properties
        g = f.geometry
        rings = [g.coordinates] if isinstance(g, LineString) else g.coordinates
        if not rings or any(len(ring) < 2 for ring in rings):
            errors.append(f"ski_lines.json: {p.id} has fewer than 2 points")
        if not all(in_hakuba(Coord(lat=lat, lng=lng)) for ring in rings for lng, lat in ring):
            errors.append(f"ski_lines.json: {p.id} leaves the Hakuba bbox")
        if p.resort_id not in resort_ids:
            errors.append(f"ski_lines.json: {p.id} has unknown resortId {p.resort_id}")
    with_lift = {f.properties.resort_id for f in lines.features if f.properties.kind == "lift"}
    errors += [f"ski_lines.json: {r} has no lift" for r in resort_ids if r not in with_lift]
    return errors
