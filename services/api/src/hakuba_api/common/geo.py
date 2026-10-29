from hakuba_api.common.models import ApiModel


class Coord(ApiModel):
    lat: float
    lng: float


class LocalizedName(ApiModel):
    en: str
    ja: str


# Hakuba Valley, Jigatake (south) to Cortina (north)
HAKUBA_BBOX = {"south": 36.55, "west": 137.75, "north": 36.90, "east": 137.95}


def in_hakuba(coord: Coord) -> bool:
    return (
        HAKUBA_BBOX["south"] <= coord.lat <= HAKUBA_BBOX["north"]
        and HAKUBA_BBOX["west"] <= coord.lng <= HAKUBA_BBOX["east"]
    )
