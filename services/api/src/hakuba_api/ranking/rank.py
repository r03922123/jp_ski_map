"""Single-criterion resort ranking (pure; no I/O). See SPEC-resort-ranking.md."""

from dataclasses import dataclass
from typing import Literal

from hakuba_api.catalog.models import Resort
from hakuba_api.common.models import ApiModel
from hakuba_api.crowd.models import CrowdEstimate
from hakuba_api.routing.models import MatrixCell
from hakuba_api.snow.models import SnowReport

SortKey = Literal[
    "walk_time", "fresh_snow", "snow_depth", "crowd", "terrain_size", "vertical", "price"
]
LOWER_IS_BETTER: set[SortKey] = {"walk_time", "crowd", "price"}


class Factors(ApiModel):
    """Raw values, in their natural units; None = unknown."""

    walk_time: float | None  # seconds
    fresh_snow: float | None  # cm: past 24 h + half of next 24 h
    snow_depth: float | None  # cm at the summit
    crowd: float | None  # 0..1 estimate
    terrain_size: float | None  # number of runs
    vertical: float | None  # m
    price: float | None  # JPY day ticket


class RankedResort(ApiModel):
    resort_id: str
    name: str
    rank: int
    sort_value: float | None
    walk_s: int | None
    walk_distance_m: int | None
    access_point_id: str
    factors: Factors
    snow: SnowReport | None
    crowd: CrowdEstimate | None
    stats_source: str  # free text with URLs, as stored in the catalog
    website: str


@dataclass
class RankInput:
    resort: Resort
    walk: MatrixCell  # nearest access point (id = access point id)
    snow: SnowReport | None
    crowd: CrowdEstimate | None


@dataclass(frozen=True)
class Filters:
    night_skiing: bool | None = None
    hakuba_valley_pass: bool | None = None
    max_walk_min: float | None = None


def _fresh_snow(snow: SnowReport | None) -> float | None:
    if snow is None:
        return None
    past, upcoming = snow.new_snow_cm.past24h, snow.new_snow_cm.next24h
    if past is None or upcoming is None:
        return None
    return past + 0.5 * upcoming


def factors_for(item: RankInput) -> Factors:
    stats = item.resort.stats
    return Factors(
        walk_time=item.walk.duration_s,
        fresh_snow=_fresh_snow(item.snow),
        snow_depth=item.snow.depth_cm.summit if item.snow else None,
        crowd=item.crowd.score if item.crowd else None,
        terrain_size=stats.runs,
        vertical=stats.vertical_m,
        price=stats.day_ticket_jpy,
    )


def _lifts(resort: Resort) -> int:
    return (resort.stats.gondolas or 0) + (resort.stats.chair_lifts or 0)


def _keep(item: RankInput, filters: Filters) -> bool:
    if filters.night_skiing and item.resort.stats.night_skiing is not True:
        return False
    if filters.hakuba_valley_pass and not item.resort.hakuba_valley_pass:
        return False
    if filters.max_walk_min is not None:
        seconds = item.walk.duration_s
        if seconds is None or seconds > filters.max_walk_min * 60:
            return False
    return True


def rank(items: list[RankInput], sort: SortKey, filters: Filters) -> list[RankedResort]:
    sign = 1 if sort in LOWER_IS_BETTER else -1
    scored = [(item, factors_for(item)) for item in items if _keep(item, filters)]

    def order(entry: tuple[RankInput, Factors]) -> tuple[bool, float, int, float, str]:
        item, factors = entry
        value: float | None = getattr(factors, sort)
        lift_tiebreak = -_lifts(item.resort) if sort == "terrain_size" else 0
        walk = item.walk.duration_s
        return (
            value is None,  # unknowns last
            sign * (value or 0),
            lift_tiebreak,
            float("inf") if walk is None else walk,
            item.resort.id,
        )

    return [
        RankedResort(
            resort_id=item.resort.id,
            name=item.resort.name.en,
            rank=position,
            sort_value=getattr(factors, sort),
            walk_s=item.walk.duration_s,
            walk_distance_m=item.walk.distance_m,
            access_point_id=item.walk.id,
            factors=factors,
            snow=item.snow,
            crowd=item.crowd,
            stats_source=item.resort.stats_source,
            website=item.resort.website,
        )
        for position, (item, factors) in enumerate(sorted(scored, key=order), start=1)
    ]
