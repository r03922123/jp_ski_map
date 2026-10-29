from collections import Counter

from hakuba_api.catalog.models import Resort
from hakuba_api.common.geo import in_hakuba


def validate_resorts(resorts: list[Resort]) -> list[str]:
    """Cross-record rules Pydantic can't express. Returns human-readable errors."""
    errors: list[str] = []

    for resort_id, n in Counter(r.id for r in resorts).items():
        if n > 1:
            errors.append(f"duplicate resort id: {resort_id}")
    for point_id, n in Counter(a.id for r in resorts for a in r.access_points).items():
        if n > 1:
            errors.append(f"duplicate access point id: {point_id}")
    if errors:
        return errors

    for r in resorts:
        for lang in ("en", "ja"):
            if not getattr(r.name, lang).strip():
                errors.append(f"{r.id}: name.{lang} is empty")
        if not r.access_points:
            errors.append(f"{r.id}: no access points")
        for a in r.access_points:
            if not in_hakuba(a.coord):
                errors.append(f"{r.id}/{a.id}: coord outside Hakuba bbox")
        pct = r.stats.terrain_pct
        if pct is not None:
            total = pct.beginner + pct.intermediate + pct.advanced
            if total != 100:
                errors.append(f"{r.id}: terrainPct sums to {total}, expected 100")
    return errors
