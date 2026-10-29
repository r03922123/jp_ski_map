from typing import Literal

from hakuba_api.common.models import ApiModel
from hakuba_api.routing.maneuvers import Maneuver

Mode = Literal["drive", "walk"]


class LineString(ApiModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]  # GeoJSON [lng, lat]


class Step(ApiModel):
    instruction: str
    distance_m: int
    duration_s: int
    maneuver: Maneuver = "straight"
    street_names: list[str] = []
    shape_range: tuple[int, int] = (0, 0)  # indices into Route.geometry.coordinates


class Route(ApiModel):
    mode: Mode
    duration_s: int
    distance_m: int
    geometry: LineString
    steps: list[Step]
    summary: str | None = None  # "via Route 148 and …"
    is_estimate: bool = True  # typical speeds, no live traffic or winter road conditions


class RouteSet(ApiModel):
    primary: Route
    alternates: list[Route]  # at most 2, each no slower than MAX_ALTERNATE_RATIO x primary


class MatrixCell(ApiModel):
    id: str
    duration_s: int | None  # None when Valhalla can't reach the target
    distance_m: int | None
