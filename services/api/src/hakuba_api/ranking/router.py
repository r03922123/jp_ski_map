from collections.abc import Callable
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.params import parse_lat_lng
from hakuba_api.crowd.heuristic import HeuristicCrowdSource, load_periods
from hakuba_api.crowd.models import CrowdEstimate
from hakuba_api.crowd.router import get_snow_by_resort, get_today
from hakuba_api.ranking.rank import Filters, RankedResort, RankInput, SortKey, rank
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.models import MatrixCell
from hakuba_api.routing.router import get_valhalla
from hakuba_api.snow.models import SnowReport

router = APIRouter(prefix="/api")

CrowdFor = Callable[[date], dict[str, CrowdEstimate]]


def get_snow_reports() -> dict[str, SnowReport]:
    return get_snow_by_resort()


def get_crowd_for(
    snow: Annotated[dict[str, SnowReport], Depends(get_snow_reports)],
) -> CrowdFor:
    source = HeuristicCrowdSource(load_periods())

    def crowd_for(day: date) -> dict[str, CrowdEstimate]:
        return {r.id: source.estimate(r, day, snow.get(r.id)) for r in load_resorts()}

    return crowd_for


@router.get("/rank", response_model=list[RankedResort], response_model_by_alias=True)
def get_rank(
    origin: Annotated[str, Query(alias="from")],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
    snow: Annotated[dict[str, SnowReport], Depends(get_snow_reports)],
    crowd_for: Annotated[CrowdFor, Depends(get_crowd_for)],
    today: Annotated[date, Depends(get_today)],
    sort: SortKey = "drive_time",
    day: Annotated[date | None, Query(alias="date")] = None,
    night_skiing: Annotated[bool | None, Query(alias="nightSkiing")] = None,
    hakuba_valley_pass: Annotated[bool | None, Query(alias="hakubaValleyPass")] = None,
    max_drive_min: Annotated[float | None, Query(alias="maxDriveMin", gt=0)] = None,
) -> list[RankedResort]:
    resorts = load_resorts()
    targets = [(a.id, a.coord) for r in resorts for a in r.access_points]
    cells = {c.id: c for c in valhalla.matrix("drive", parse_lat_lng(origin, "from"), targets)}
    crowd = crowd_for(day or today)

    def nearest(resort_access_ids: list[str]) -> MatrixCell:
        candidates = [cells[i] for i in resort_access_ids]
        reachable = [c for c in candidates if c.duration_s is not None]
        return min(reachable, key=lambda c: c.duration_s or 0) if reachable else candidates[0]

    items = [
        RankInput(
            resort=r,
            drive=nearest([a.id for a in r.access_points]),
            snow=snow.get(r.id),
            crowd=crowd.get(r.id),
        )
        for r in resorts
    ]
    filters = Filters(
        night_skiing=night_skiing,
        hakuba_valley_pass=hakuba_valley_pass,
        max_drive_min=max_drive_min,
    )
    return rank(items, sort, filters)
