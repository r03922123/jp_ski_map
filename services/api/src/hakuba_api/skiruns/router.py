from fastapi import APIRouter, Response

from hakuba_api.skiruns.models import SkiLines
from hakuba_api.skiruns.store import load_ski_lines

router = APIRouter(prefix="/api")


@router.get("/ski-lines", response_model=SkiLines, response_model_by_alias=True)
def get_ski_lines(response: Response) -> SkiLines:
    """Every operating run and lift of the 10 resorts, as GeoJSON (SPEC-ski-runs)."""
    # the snapshot changes with a deploy, at most daily
    response.headers["Cache-Control"] = "public, max-age=86400"
    return load_ski_lines()
