from datetime import datetime
from typing import Any, Self, cast

import httpx
from pydantic import BaseModel, TypeAdapter, ValidationError, field_validator, model_validator

from hakuba_api.common.ratelimit import spend_upstream
from hakuba_api.common.upstream import USER_AGENT, UpstreamError

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# (lat, lng, elevation_m)
Point = tuple[float, float, int]


class _Hourly(BaseModel):
    """The part of a location that snow/compute.py reads; extra keys are ignored."""

    time: list[str]
    snowfall: list[float | None]
    snow_depth: list[float | None]
    temperature_2m: list[float | None]

    @field_validator("time")
    @classmethod
    def _iso_times(cls, times: list[str]) -> list[str]:
        for t in times:
            datetime.fromisoformat(t)  # raises ValueError, which pydantic reports
        return times

    @model_validator(mode="after")
    def _same_length(self) -> Self:
        n = len(self.time)
        if not len(self.snowfall) == len(self.snow_depth) == len(self.temperature_2m) == n:
            raise ValueError("hourly series differ in length")
        return self


class _Location(BaseModel):
    hourly: _Hourly


_LOCATIONS = TypeAdapter(list[_Location])


def fetch_hourly(points: list[Point]) -> list[dict[str, Any]]:
    """One batched call for every point; `elevation` is set explicitly so values are
    downscaled to that height instead of the grid cell's average terrain.

    The response is checked before it is returned, so a malformed or partial payload is
    an UpstreamError like an outage, not a KeyError deep in snow/compute.py."""
    spend_upstream("open-meteo")
    try:
        response = httpx.get(
            OPEN_METEO_URL,
            params={
                "latitude": ",".join(str(p[0]) for p in points),
                "longitude": ",".join(str(p[1]) for p in points),
                "elevation": ",".join(str(p[2]) for p in points),
                "hourly": "snowfall,snow_depth,temperature_2m",
                "past_days": 3,
                "forecast_days": 4,
                "timezone": "Asia/Tokyo",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=15,
        )
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise UpstreamError("open-meteo", str(e)) from e
    try:
        data: Any = response.json()
        # a single location comes back as an object, several as a list
        locations = cast(list[dict[str, Any]], data if isinstance(data, list) else [data])
        _LOCATIONS.validate_python(locations)
    except (ValueError, ValidationError) as e:  # not JSON, or not the expected shape
        raise UpstreamError("open-meteo", "malformed response") from e
    if len(locations) != len(points):
        raise UpstreamError("open-meteo", f"{len(locations)} locations for {len(points)} points")
    return locations
