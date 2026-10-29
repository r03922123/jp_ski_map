from hakuba_api.common.geo import in_hakuba
from hakuba_api.pois.models import Poi


def validate_pois(pois: list[Poi]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for p in pois:
        if p.id in seen:
            errors.append(f"poi_osm.json: duplicate id {p.id}")
        seen.add(p.id)
        if not in_hakuba(p.coord):
            errors.append(f"poi_osm.json: {p.id} is outside the Hakuba bbox")
    return errors
