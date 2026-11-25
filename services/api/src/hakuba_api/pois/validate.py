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


def validate_google_ids(pois: list[Poi], ids: dict[str, str]) -> list[str]:
    category = {p.id: p.category for p in pois}
    errors: list[str] = []
    for poi_id, place in ids.items():
        if poi_id not in category:
            errors.append(f"poi_google.json: {poi_id} is not in poi_osm.json")
        elif category[poi_id] != "food":
            errors.append(f"poi_google.json: {poi_id} is not a food POI")
        if not place.strip():
            errors.append(f"poi_google.json: {poi_id} has an empty place ID")
    return errors
