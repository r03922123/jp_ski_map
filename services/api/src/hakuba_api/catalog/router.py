from fastapi import APIRouter

from hakuba_api.catalog.models import Resort
from hakuba_api.catalog.store import load_resorts

router = APIRouter(prefix="/api")


@router.get("/resorts", response_model=list[Resort], response_model_by_alias=True)
def list_resorts() -> list[Resort]:
    return load_resorts()
