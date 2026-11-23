from typing import Annotated, Literal

from pydantic import Field

from hakuba_api.common.models import ApiModel

Difficulty = Literal["novice", "easy", "intermediate", "advanced", "expert", "freeride", "extreme"]
LiftType = Literal[
    "cable_car",
    "gondola",
    "chair_lift",
    "mixed_lift",
    "drag_lift",
    "t-bar",
    "j-bar",
    "platter",
    "rope_tow",
    "magic_carpet",
    "funicular",
    "railway",
]
Position = tuple[float, float]  # [lng, lat], GeoJSON order


class LineString(ApiModel):
    type: Literal["LineString"]
    coordinates: list[Position]


class Polygon(ApiModel):
    type: Literal["Polygon"]
    coordinates: list[list[Position]]


Geometry = Annotated[LineString | Polygon, Field(discriminator="type")]


class SkiLineProps(ApiModel):
    id: str
    kind: Literal["run", "lift"]
    name: str | None
    difficulty: Difficulty | None  # runs only
    lift_type: LiftType | None  # lifts only
    resort_id: str


class SkiLine(ApiModel):
    type: Literal["Feature"] = "Feature"
    properties: SkiLineProps
    geometry: Geometry


class SkiLines(ApiModel):
    """data/ski_lines.json and GET /api/ski-lines: one GeoJSON FeatureCollection."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[SkiLine]
