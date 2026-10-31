from fastapi import APIRouter, Response

from hakuba_api.catalog.models import Resort
from hakuba_api.catalog.store import load_resorts

router = APIRouter(prefix="/api")

STATIC_CACHE = "public, max-age=3600"


@router.get("/resorts", response_model=list[Resort], response_model_by_alias=True)
def list_resorts(response: Response) -> list[Resort]:
    # the catalogue changes with a deploy, not during a visit
    response.headers["Cache-Control"] = STATIC_CACHE
    return load_resorts()
