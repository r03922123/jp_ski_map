"""Explainable crowd estimate. Weights live in CONFIG, except each peak period's own weight in
data/crowd_periods.json; every contribution is a reason."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from functools import cache

import holidays
from pydantic import TypeAdapter

from hakuba_api.catalog.models import Resort
from hakuba_api.crowd.models import CrowdEstimate, CrowdLevel, PeakPeriod
from hakuba_api.data.paths import data_dir
from hakuba_api.snow.models import SnowReport


@dataclass(frozen=True)
class CrowdConfig:
    long_weekend: float = 0.35
    holiday: float = 0.30
    saturday: float = 0.30
    sunday: float = 0.20
    powder_threshold_cm: float = 20
    powder: float = 0.15
    season_edge: float = -0.15
    # Size/popularity prior incl. closeness to the Happo/Echoland lodging cluster
    resort_prior: dict[str, float] = field(
        default_factory=lambda: {
            "happo-one": 0.25,
            "goryu": 0.20,
            "tsugaike": 0.20,
            "hakuba47": 0.15,
            "iwatake": 0.15,
            "cortina": 0.15,
            "norikura": 0.08,
            "kashimayari": 0.08,
            "sanosaka": 0.03,
            "jigatake": 0.0,
        }
    )
    default_prior: float = 0.10
    popular_prior_at_least: float = 0.20
    moderate_prior_at_least: float = 0.10


CONFIG = CrowdConfig()

LEVELS: list[tuple[float, CrowdLevel]] = [(0.3, "low"), (0.55, "medium"), (0.8, "high")]

_JP_HOLIDAYS = holidays.Japan(language="en_US", years=range(2024, 2031))
_periods_adapter = TypeAdapter(list[PeakPeriod])


@cache
def load_periods() -> list[PeakPeriod]:
    return _periods_adapter.validate_json((data_dir() / "crowd_periods.json").read_bytes())


def level_for(score: float) -> CrowdLevel:
    for limit, level in LEVELS:
        if score < limit:
            return level
    return "very_high"


def _is_off_day(day: date) -> bool:
    return day.weekday() >= 5 or day in _JP_HOLIDAYS


def _off_run(day: date) -> list[date]:
    """The run of consecutive weekend/holiday days that contains `day` (empty if a workday)."""
    if not _is_off_day(day):
        return []
    start, end = day, day
    while _is_off_day(start - timedelta(days=1)):
        start -= timedelta(days=1)
    while _is_off_day(end + timedelta(days=1)):
        end += timedelta(days=1)
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _day_type(day: date) -> tuple[float, str | None]:
    run = _off_run(day)
    if len(run) >= 3:
        names = [_JP_HOLIDAYS[d] for d in run if d in _JP_HOLIDAYS]
        return CONFIG.long_weekend, "3-day weekend" + (f" ({names[0]})" if names else "")
    if day in _JP_HOLIDAYS:
        return CONFIG.holiday, f"Public holiday ({_JP_HOLIDAYS[day]})"
    if day.weekday() == 5:
        return CONFIG.saturday, "Saturday"
    if day.weekday() == 6:
        return CONFIG.sunday, "Sunday"
    return 0.0, None


def _new_snow_for(day: date, snow: SnowReport | None) -> float | None:
    """Past 24 h for the report's own day, next 24 h for the day after; else unknown."""
    if snow is None:
        return None
    today = snow.as_of.date()
    if day == today:
        return snow.new_snow_cm.past24h
    if day == today + timedelta(days=1):
        return snow.new_snow_cm.next24h
    return None


def _is_season_edge(day: date) -> bool:
    return (day.month == 12 and day.day < 20) or (day.month == 3 and day.day > 15) or day.month == 4


class HeuristicCrowdSource:
    def __init__(self, periods: list[PeakPeriod]) -> None:
        self._periods = periods

    def estimate(self, resort: Resort, day: date, snow: SnowReport | None) -> CrowdEstimate:
        score = 0.0
        reasons: list[str] = []

        weight, reason = _day_type(day)
        score += weight
        if reason:
            reasons.append(reason)

        matching = [p for p in self._periods if p.start <= day <= p.end]
        for period in sorted(matching, key=lambda p: -p.weight):
            reasons.append(period.name)
        if matching:
            score += max(p.weight for p in matching)

        new_snow = _new_snow_for(day, snow)
        if new_snow is not None and new_snow >= CONFIG.powder_threshold_cm:
            score += CONFIG.powder
            reasons.append(f"Powder day ({round(new_snow)} cm new)")

        prior = CONFIG.resort_prior.get(resort.id, CONFIG.default_prior)
        score += prior
        if prior >= CONFIG.popular_prior_at_least:
            reasons.append("Large, popular resort")
        elif prior >= CONFIG.moderate_prior_at_least:
            reasons.append("Moderately popular resort")
        elif prior > 0:
            reasons.append("Less-visited resort")

        if _is_season_edge(day):
            score += CONFIG.season_edge
            reasons.append("Early/late season")

        score = round(min(max(score, 0.0), 1.0), 2)
        return CrowdEstimate(
            resort_id=resort.id,
            date=day,
            level=level_for(score),
            score=score,
            source="heuristic",
            reasons=reasons,
        )
