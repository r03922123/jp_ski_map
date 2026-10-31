from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.params import PlausibleDate
from hakuba_api.common.upstream import UpstreamError
from hakuba_api.crowd.heuristic import HeuristicCrowdSource, load_periods
from hakuba_api.crowd.models import CrowdEstimate
from hakuba_api.snow.compute import JST
from hakuba_api.snow.models import SnowReport
from hakuba_api.snow.router import get_hourly_fetcher, get_now, get_snow

router = APIRouter(prefix="/api")


def get_today() -> date:
    return datetime.now(JST).date()


def get_snow_by_resort() -> dict[str, SnowReport]:
    """Snow only sharpens the estimate; an Open-Meteo outage must not break crowd."""
    try:
        reports = get_snow(get_hourly_fetcher(), get_now())
    except UpstreamError:
        return {}
    return {r.resort_id: r for r in reports}


@router.get("/crowd", response_model=list[CrowdEstimate], response_model_by_alias=True)
def get_crowd(
    today: Annotated[date, Depends(get_today)],
    snow: Annotated[dict[str, SnowReport], Depends(get_snow_by_resort)],
    day: Annotated[PlausibleDate | None, Query(alias="date")] = None,
) -> list[CrowdEstimate]:
    source = HeuristicCrowdSource(load_periods())
    target = day or today
    return [source.estimate(r, target, snow.get(r.id)) for r in load_resorts()]
