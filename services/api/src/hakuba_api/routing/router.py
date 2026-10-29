import os
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from hakuba_api.common.params import parse_lat_lng
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.models import Mode, Route

router = APIRouter(prefix="/api")


def get_valhalla() -> ValhallaClient:
    return ValhallaClient(os.environ.get("VALHALLA_URL", "http://localhost:8002"))


@router.get("/route", response_model=Route, response_model_by_alias=True)
def get_route(
    mode: Mode,
    origin: Annotated[str, Query(alias="from")],
    destination: Annotated[str, Query(alias="to")],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
) -> Route:
    return valhalla.route(mode, parse_lat_lng(origin, "from"), parse_lat_lng(destination, "to"))
