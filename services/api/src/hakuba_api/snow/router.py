import logging
from collections.abc import Callable
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.cache import TtlCache
from hakuba_api.common.upstream import UpstreamError
from hakuba_api.snow.compute import JST, HourlySeries, build_report
from hakuba_api.snow.models import SnowReport
from hakuba_api.snow.openmeteo import Point, fetch_hourly

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

HourlyFetcher = Callable[[list[Point]], list[HourlySeries]]

_cache = TtlCache[str, list[SnowReport]](ttl_s=3600)

# When Open-Meteo fails, the last good reports are served instead (HTTP's stale-if-error,
# RFC 5861): a few hours old beats no snow at all, and `as_of` already tells the reader
# how old they are. Past this age the forecast windows have moved too far to show.
STALE_S = 6 * 3600
# A failure is remembered this long, so one request a minute waits on a dead upstream
# (its timeout is 15 s), not every request.
RETRY_AFTER_FAILURE_S = 60
# both keyed by the fetcher, like `_cache`
_last_good = TtlCache[int, list[SnowReport]](ttl_s=STALE_S)
_failed = TtlCache[int, str](ttl_s=RETRY_AFTER_FAILURE_S)  # value: the failing source


def clear_cache() -> None:
    _cache.clear()
    _last_good.clear()
    _failed.clear()


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
    series = fetch(points)
    return [
        build_report(r.id, base=series[2 * i], summit=series[2 * i + 1], now=now)
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
    source = _failed.get(id(fetch))
    if source is None:
        try:
            reports = snow_reports(fetch, now)
        except UpstreamError as e:
            source = e.source
            _failed.set(id(fetch), source)
        else:
            _cache.set(key, reports)
            _last_good.set(id(fetch), reports)
            return reports
    stale = _last_good.get(id(fetch))
    if stale is None:
        raise UpstreamError(source, "failed, and no earlier report to serve")
    log.warning("%s failed; serving the snow reports as of %s", source, stale[0].as_of)
    return stale
