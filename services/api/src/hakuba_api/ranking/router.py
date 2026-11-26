from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.params import parse_lat_lng
from hakuba_api.ranking.rank import Filters, RankedResort, RankInput, SortKey, rank
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.models import MatrixCell
from hakuba_api.routing.router import get_valhalla
from hakuba_api.snow.models import SnowReport
from hakuba_api.snow.router import get_snow_by_resort

router = APIRouter(prefix="/api")


def get_snow_reports() -> dict[str, SnowReport]:
    return get_snow_by_resort()


@router.get("/rank", response_model=list[RankedResort], response_model_by_alias=True)
def get_rank(
    origin: Annotated[str, Query(alias="from")],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
    snow: Annotated[dict[str, SnowReport], Depends(get_snow_reports)],
    sort: SortKey = "walk_time",
    night_skiing: Annotated[bool | None, Query(alias="nightSkiing")] = None,
    hakuba_valley_pass: Annotated[bool | None, Query(alias="hakubaValleyPass")] = None,
    max_walk_min: Annotated[float | None, Query(alias="maxWalkMin", gt=0)] = None,
) -> list[RankedResort]:
    resorts = load_resorts()
    targets = [(a.id, a.coord) for r in resorts for a in r.access_points]
    cells = {c.id: c for c in valhalla.matrix("walk", parse_lat_lng(origin, "from"), targets)}

    def nearest(resort_access_ids: list[str]) -> MatrixCell:
        candidates = [cells[i] for i in resort_access_ids]
        reachable = [c for c in candidates if c.duration_s is not None]
        return min(reachable, key=lambda c: c.duration_s or 0) if reachable else candidates[0]

    items = [
        RankInput(
            resort=r,
            walk=nearest([a.id for a in r.access_points]),
            snow=snow.get(r.id),
        )
        for r in resorts
    ]
    filters = Filters(
        night_skiing=night_skiing,
        hakuba_valley_pass=hakuba_valley_pass,
        max_walk_min=max_walk_min,
    )
    return rank(items, sort, filters)
