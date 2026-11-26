import logging
import threading
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.cache import TtlCache
from hakuba_api.common.upstream import UpstreamBusyError, UpstreamError
from hakuba_api.snow.compute import JST, HourlySeries, build_report
from hakuba_api.snow.models import SnowReport
from hakuba_api.snow.openmeteo import Point, fetch_hourly

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

HourlyFetcher = Callable[[list[Point]], list[HourlySeries]]

_cache = TtlCache[str, list[SnowReport]](ttl_s=3600)

# When Open-Meteo fails, the last good reports are served instead (HTTP's stale-if-error,
# RFC 5861): a few hours old beats no snow at all, and each report's `as_of` says how old
# it is. Past this age the forecast windows have moved too far to show.
STALE = timedelta(hours=6)
# A failure is remembered this long, so later requests answer at once instead of each
# waiting on a dead upstream (its timeout is 15 s).
RETRY_AFTER_FAILURE = timedelta(seconds=60)
# Both are keyed by the fetcher, like `_cache`, and aged by the request's `now`, not by a
# process clock: the limit is on the report's own time.
_last_good: dict[int, list[SnowReport]] = {}
_failed: dict[int, tuple[datetime, str]] = {}  # when, and which source
# One fetch at a time: requests that miss the cache together wait for the first one's
# answer instead of each calling Open-Meteo, or each waiting out its timeout.
_fetching = threading.Lock()


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
    with _fetching:
        if (cached := _cache.get(key)) is not None:  # fetched while this request waited
            return cached
        failed = _failed.get(id(fetch))
        if failed is not None and now - failed[0] < RETRY_AFTER_FAILURE:
            source, busy = failed[1], False
        else:
            try:
                reports = snow_reports(fetch, now)
            except UpstreamError as e:
                # Over our own request budget Open-Meteo wasn't called, so nothing failed:
                # nothing is remembered, and with no report to serve the answer stays "busy"
                source, busy = e.source, isinstance(e, UpstreamBusyError)
                if not busy:
                    _failed[id(fetch)] = (now, source)
                    log.warning(
                        "snow fetch failed, not retried for %.0f s: %s",
                        RETRY_AFTER_FAILURE.total_seconds(),
                        e,
                    )
            else:
                _cache.set(key, reports)
                _last_good[id(fetch)] = reports
                return reports
    stale = _last_good.get(id(fetch))
    if stale is None or now - stale[0].as_of > STALE:
        # A new error, not the caught one kept in a local: raising that from here would tie
        # it to this frame in a reference cycle
        if busy:
            raise UpstreamBusyError(source)
        raise UpstreamError(source, "failed, and no report recent enough to serve")
    return stale


def get_snow_by_resort() -> dict[str, SnowReport]:
    """Snow by resort id for ranking; an Open-Meteo outage gives {} so ranking still works."""
    try:
        reports = get_snow(get_hourly_fetcher(), get_now())
    except UpstreamError:
        return {}
    return {r.resort_id: r for r in reports}
