import math

from hakuba_api.common.models import ApiModel


class Coord(ApiModel):
    lat: float
    lng: float


class LocalizedName(ApiModel):
    en: str
    ja: str


# Hakuba Valley, Jigatake (south) to Cortina (north)
HAKUBA_BBOX = {"south": 36.55, "west": 137.75, "north": 36.90, "east": 137.95}


def km(a: Coord, b: Coord) -> float:
    """Great-circle distance on a 6,371 km sphere."""
    lat1, lng1, lat2, lng2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


def in_hakuba(coord: Coord) -> bool:
    return (
        HAKUBA_BBOX["south"] <= coord.lat <= HAKUBA_BBOX["north"]
        and HAKUBA_BBOX["west"] <= coord.lng <= HAKUBA_BBOX["east"]
    )
