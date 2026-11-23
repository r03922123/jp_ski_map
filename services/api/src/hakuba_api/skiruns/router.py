from fastapi import APIRouter, Response

from hakuba_api.catalog.router import STATIC_CACHE
from hakuba_api.skiruns.models import SkiLines
from hakuba_api.skiruns.store import load_ski_lines

router = APIRouter(prefix="/api")


@router.get("/ski-lines", response_model=SkiLines, response_model_by_alias=True)
def get_ski_lines(response: Response) -> SkiLines:
    """Every operating run and lift of the 10 resorts, as GeoJSON (SPEC-ski-runs)."""
    # the snapshot changes with a deploy: a refresh shows within the hour
    response.headers["Cache-Control"] = STATIC_CACHE
    return load_ski_lines()
