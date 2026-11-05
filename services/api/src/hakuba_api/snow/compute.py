"""Pure snow maths over Open-Meteo hourly series (no I/O)."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from hakuba_api.snow.models import NewSnow, SnowDepth, SnowReport, SummitTemps

JST = ZoneInfo("Asia/Tokyo")


@dataclass
class HourlySeries:
    """Open-Meteo hourly values; snowfall at time t is the sum over the hour ending at t."""

    times: list[datetime]
    snowfall_cm: list[float | None]
    snow_depth_m: list[float | None]
    temperature_c: list[float | None]


def _window(series: HourlySeries, start: datetime, end: datetime) -> list[int] | None:
    """Indices with start < t <= end, or None if the data doesn't cover the window."""
    indices = [i for i, t in enumerate(series.times) if start < t <= end]
    expected_hours = int((end - start) / timedelta(hours=1))
    return indices if len(indices) == expected_hours else None


def _sum(values: list[float | None], indices: list[int] | None) -> float | None:
    if indices is None:
        return None
    picked = [values[i] for i in indices]
    if any(v is None for v in picked):
        return None
    return round(sum(v for v in picked if v is not None), 1)


def _at(values: list[float | None], series: HourlySeries, now: datetime) -> float | None:
    return next((values[i] for i, t in enumerate(series.times) if t == now), None)


def _depth_cm(series: HourlySeries, now: datetime) -> int | None:
    depth = _at(series.snow_depth_m, series, now)
    return None if depth is None else round(depth * 100)


def build_report(
    resort_id: str, base: HourlySeries, summit: HourlySeries, now: datetime
) -> SnowReport:
    now = now.astimezone(JST).replace(minute=0, second=0, microsecond=0)
    day = timedelta(hours=24)

    next_day = _window(summit, now, now + day)
    temps = (
        [summit.temperature_c[i] for i in next_day if summit.temperature_c[i] is not None]
        if next_day
        else []
    )

    return SnowReport(
        resort_id=resort_id,
        as_of=now,
        depth_cm=SnowDepth(
            base=_depth_cm(base, now), summit=_depth_cm(summit, now), source="model"
        ),
        new_snow_cm=NewSnow(
            past24h=_sum(summit.snowfall_cm, _window(summit, now - day, now)),
            past72h=_sum(summit.snowfall_cm, _window(summit, now - 3 * day, now)),
            next24h=_sum(summit.snowfall_cm, next_day),
            next72h=_sum(summit.snowfall_cm, _window(summit, now, now + 3 * day)),
        ),
        temp_c=SummitTemps(
            summit_min=min(temps) if temps else None,  # type: ignore[type-var]
            summit_max=max(temps) if temps else None,  # type: ignore[type-var]
        ),
    )
