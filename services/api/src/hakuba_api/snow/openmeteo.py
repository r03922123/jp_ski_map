from typing import Any, cast

import httpx

from hakuba_api.common.ratelimit import spend_upstream
from hakuba_api.common.upstream import USER_AGENT, UpstreamError

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# (lat, lng, elevation_m)
Point = tuple[float, float, int]


def fetch_hourly(points: list[Point]) -> list[dict[str, Any]]:
    """One batched call for every point; `elevation` is set explicitly so values are
    downscaled to that height instead of the grid cell's average terrain."""
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
    data: Any = response.json()
    # a single location comes back as an object, several as a list
    return cast(list[dict[str, Any]], data if isinstance(data, list) else [data])
