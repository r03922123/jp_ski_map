from typing import Literal

from hakuba_api.common.geo import Coord
from hakuba_api.common.models import ApiModel

PlaceKind = Literal["hotel", "guest_house", "hostel", "apartment", "chalet", "other"]
LODGING_KINDS: tuple[PlaceKind, ...] = ("hotel", "guest_house", "hostel", "apartment", "chalet")


class Place(ApiModel):
    id: str
    name: str
    name_ja: str | None = None
    kind: PlaceKind
    coord: Coord
    address: str | None
    source: Literal["photon", "osm-snapshot", "overture-snapshot", "gmaps-link"]
