from typing import Literal

from hakuba_api.common.models import ApiModel

Mode = Literal["drive", "walk"]


class LineString(ApiModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[list[float]]  # GeoJSON [lng, lat]


class Step(ApiModel):
    instruction: str
    distance_m: int
    duration_s: int


class Route(ApiModel):
    mode: Mode
    duration_s: int
    distance_m: int
    geometry: LineString
    steps: list[Step]
    is_estimate: bool = True  # typical speeds, no live traffic or winter road conditions
