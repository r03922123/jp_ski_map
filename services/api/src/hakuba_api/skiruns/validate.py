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
        if isinstance(g, LineString):
            rings = [g.coordinates]
            if len(g.coordinates) < 2:
                errors.append(f"ski_lines.json: {p.id} has fewer than 2 points")
        else:
            rings = g.coordinates
            if not rings or any(len(r) < 4 or r[0] != r[-1] for r in rings):
                errors.append(
                    f"ski_lines.json: {p.id} has a ring that is not closed with >= 4 points"
                )
        if not all(in_hakuba(Coord(lat=lat, lng=lng)) for ring in rings for lng, lat in ring):
            errors.append(f"ski_lines.json: {p.id} leaves the Hakuba bbox")
        if p.resort_id not in resort_ids:
            errors.append(f"ski_lines.json: {p.id} has unknown resortId {p.resort_id}")
        low, high = p.min_elevation_m, p.max_elevation_m
        if low is not None and high is not None and low > high:
            errors.append(f"ski_lines.json: {p.id} has minElevationM above maxElevationM")
        if p.kind == "run" and p.duration_s is not None:
            errors.append(f"ski_lines.json: {p.id} is a run with a ride time")
        if p.duration_s is not None and p.duration_s <= 0:
            errors.append(f"ski_lines.json: {p.id} has a ride time of 0 s or less")
        if p.profile is not None and len(p.profile.heights_m) < 2:
            errors.append(f"ski_lines.json: {p.id} has a profile with fewer than 2 heights")
        if p.profile is not None and p.profile.resolution_m <= 0:
            errors.append(f"ski_lines.json: {p.id} has a profile spacing of 0 m or less")
        if p.profile is not None and (p.kind == "lift" or f.geometry.type == "Polygon"):
            errors.append(f"ski_lines.json: {p.id} has a profile but is not a run line")
    with_lift = {f.properties.resort_id for f in lines.features if f.properties.kind == "lift"}
    errors += [f"ski_lines.json: {r} has no lift" for r in resort_ids if r not in with_lift]
    return errors
