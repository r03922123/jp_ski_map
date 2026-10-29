from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.cache import TtlCache
from hakuba_api.snow.compute import JST, build_report, parse_series
from hakuba_api.snow.models import SnowReport
from hakuba_api.snow.openmeteo import Point, fetch_hourly

router = APIRouter(prefix="/api")

HourlyFetcher = Callable[[list[Point]], list[dict[str, Any]]]

_cache = TtlCache[str, list[SnowReport]](ttl_s=3600)


def get_hourly_fetcher() -> HourlyFetcher:
    return fetch_hourly


def get_now() -> datetime:
    return datetime.now(JST)


def snow_reports(fetch: HourlyFetcher, now: datetime) -> list[SnowReport]:
    resorts = load_resorts()
    points: list[Point] = []
    for r in resorts:
        coord = r.access_points[0].coord
        # Unknown elevations fall back to Open-Meteo's own terrain height (0 = "use DEM")
        points.append((coord.lat, coord.lng, r.stats.base_elevation_m or 0))
        points.append((coord.lat, coord.lng, r.stats.top_elevation_m or 0))
    locations = fetch(points)
    return [
        build_report(
            r.id,
            base=parse_series(locations[2 * i]),
            summit=parse_series(locations[2 * i + 1]),
            now=now,
        )
        for i, r in enumerate(resorts)
    ]


@router.get("/snow", response_model=list[SnowReport], response_model_by_alias=True)
def get_snow(
    fetch: Annotated[HourlyFetcher, Depends(get_hourly_fetcher)],
    now: Annotated[datetime, Depends(get_now)],
) -> list[SnowReport]:
    key = f"{now:%Y-%m-%dT%H}|{id(fetch)}"
    if (cached := _cache.get(key)) is not None:
        return cached
    reports = snow_reports(fetch, now)
    _cache.set(key, reports)
    return reports
