from typing import Literal

from hakuba_api.common.geo import Coord
from hakuba_api.common.models import ApiModel

PoiCategory = Literal["food", "convenience"]

# OSM tags → category. Bars/pubs serve food in Hakuba, so they count as food.
FOOD_AMENITIES = ("restaurant", "cafe", "fast_food", "food_court", "pub", "bar")


class Poi(ApiModel):
    id: str  # "osm:node/123", like lodging
    category: PoiCategory
    name: str  # name:en → name → brand
    name_ja: str | None
    coord: Coord
    brand: str | None
    cuisine: str | None
    opening_hours: str | None  # raw OSM string, shown as-is


class NearbyPoi(Poi):
    duration_s: int
    distance_m: int
