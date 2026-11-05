from datetime import datetime
from typing import Any, Self

import httpx
from pydantic import (
    BaseModel,
    ConfigDict,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

from hakuba_api.common.ratelimit import spend_upstream
from hakuba_api.common.upstream import USER_AGENT, UpstreamError
from hakuba_api.snow.compute import JST, HourlySeries

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# (lat, lng, elevation_m)
Point = tuple[float, float, int]

# Strict: a value pydantic would only convert (the text "1.5", true, Infinity) means the
# answer is broken, so it is refused here instead of guessed at.
_STRICT = ConfigDict(strict=True, allow_inf_nan=False)


class _Hourly(BaseModel):
    """The part of a location that snow/compute.py reads; extra keys are ignored."""

    model_config = _STRICT

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
    model_config = _STRICT

    hourly: _Hourly


_LOCATIONS = TypeAdapter(list[_Location])


def parse_hourly(data: Any) -> list[HourlySeries]:
    """Open-Meteo's decoded JSON → one HourlySeries per location, built from the checked
    models, so compute.py never sees the raw dicts; raises ValidationError if malformed."""
    # a single location comes back as an object, several as a list
    locations = _LOCATIONS.validate_python(data if isinstance(data, list) else [data])
    return [
        HourlySeries(
            times=[datetime.fromisoformat(t).replace(tzinfo=JST) for t in loc.hourly.time],
            snowfall_cm=loc.hourly.snowfall,
            snow_depth_m=loc.hourly.snow_depth,
            temperature_c=loc.hourly.temperature_2m,
        )
        for loc in locations
    ]


def fetch_hourly(points: list[Point]) -> list[HourlySeries]:
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
        series = parse_hourly(response.json())
    except (ValueError, ValidationError) as e:  # not JSON, or not the expected shape
        raise UpstreamError("open-meteo", "malformed response") from e
    if len(series) != len(points):
        raise UpstreamError("open-meteo", f"{len(series)} locations for {len(points)} points")
    return series
