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


class Profile(ApiModel):
    """A run's height every `resolution_m` along it on the ground, top to end (v1.4)."""

    heights_m: list[int]
    resolution_m: float  # 2 dp: the ground length / (len(heights_m) - 1)


class SkiLineProps(ApiModel):
    id: str
    kind: Literal["run", "lift"]
    name: str | None
    difficulty: Difficulty | None  # runs only
    lift_type: LiftType | None  # lifts only
    resort_id: str
    # measured from OpenSkiMap's 3D line at refresh (SPEC-ski-runs v1.2); null for an area
    # (Polygon) or a line without elevations
    distance_m: int | None  # along the slope
    min_elevation_m: int | None
    max_elevation_m: int | None
    slope_pct: float | None  # average: vertical / ground length, 1 dp
    duration_s: int | None  # lifts only: ride time, from OSM's `duration`
    profile: Profile | None  # runs only (v1.4); null for an area or a run OpenSkiMap has none for


class SkiLine(ApiModel):
    type: Literal["Feature"] = "Feature"
    properties: SkiLineProps
    geometry: Geometry


class SkiLines(ApiModel):
    """data/ski_lines.json and GET /api/ski-lines: one GeoJSON FeatureCollection."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[SkiLine]
