import os
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import Field

from hakuba_api.common.geo import Coord
from hakuba_api.common.models import ApiModel
from hakuba_api.common.params import parse_lat_lng
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.models import MatrixCell, Mode, Route, RouteSet

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


@router.get("/routes", response_model=RouteSet, response_model_by_alias=True)
def get_routes(
    mode: Mode,
    origin: Annotated[str, Query(alias="from")],
    destination: Annotated[str, Query(alias="to")],
    valhalla: Annotated[ValhallaClient, Depends(get_valhalla)],
    alternates: Annotated[int, Query(ge=0, le=2)] = 2,
) -> RouteSet:
    """Primary route plus up to two alternates, like a directions search."""
    return valhalla.routes(
        mode, parse_lat_lng(origin, "from"), parse_lat_lng(destination, "to"), alternates
    )


class PathRequest(ApiModel):
    mode: Mode
    points: Annotated[list[Coord], Field(min_length=2, max_length=25)]
    # true: the middle points are stops the trip makes ("Arrive at stop N"), not pass-through
    stop_at_points: bool = False


@router.post("/route/path", response_model=Route, response_model_by_alias=True)
def post_route_path(
    body: PathRequest, valhalla: Annotated[ValhallaClient, Depends(get_valhalla)]
) -> Route:
    """A route through ordered points: a bus ride's stops (pass-through), or a trip's
    stops (`stopAtPoints`)."""
    return valhalla.path(body.mode, body.points, stop_at_points=body.stop_at_points)


class MatrixTarget(ApiModel):
    id: str
    lat: float
    lng: float


class MatrixRequest(ApiModel):
    mode: Mode
    origin: Coord
    targets: list[MatrixTarget]


@router.post("/matrix", response_model=list[MatrixCell], response_model_by_alias=True)
def post_matrix(
    body: MatrixRequest, valhalla: Annotated[ValhallaClient, Depends(get_valhalla)]
) -> list[MatrixCell]:
    targets = [(t.id, Coord(lat=t.lat, lng=t.lng)) for t in body.targets]
    return valhalla.matrix(body.mode, body.origin, targets)
