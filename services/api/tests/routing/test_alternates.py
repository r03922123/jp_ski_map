import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common.geo import Coord
from hakuba_api.main import app
from hakuba_api.routing.client import ValhallaClient

FIXTURES = Path(__file__).parents[1] / "fixtures" / "valhalla"
VALHALLA = "http://valhalla.test"
HAPPO = Coord(lat=36.6985, lng=137.8376)
IWATAKE = Coord(lat=36.7395, lng=137.8510)


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def valhalla() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=VALHALLA, assert_all_called=False) as mock:
        yield mock


def test_routes_returns_primary_and_alternates(valhalla: respx.MockRouter) -> None:
    call = valhalla.post("/route").respond(json=fixture("route_drive_alternates.json"))

    routes = ValhallaClient(VALHALLA).routes("drive", HAPPO, IWATAKE, alternates=2)

    assert json.loads(call.calls.last.request.content)["alternates"] == 2
    assert routes.primary.duration_s == 1048
    assert [a.duration_s for a in routes.alternates] == [1130]
    assert routes.alternates[0].steps  # alternates carry their own steps


def test_routes_drops_alternates_much_slower_than_primary(valhalla: respx.MockRouter) -> None:
    data = fixture("route_drive_alternates.json")
    data["alternates"][0]["trip"]["summary"]["time"] = 1048.229 * 1.6
    valhalla.post("/route").respond(json=data)

    routes = ValhallaClient(VALHALLA).routes("drive", HAPPO, IWATAKE, alternates=2)

    assert routes.alternates == []


def test_routes_without_alternates_does_not_ask_for_them(valhalla: respx.MockRouter) -> None:
    call = valhalla.post("/route").respond(json=fixture("route_drive.json"))

    routes = ValhallaClient(VALHALLA).routes("drive", HAPPO, IWATAKE, alternates=0)

    assert "alternates" not in json.loads(call.calls.last.request.content)
    assert routes.alternates == []


def test_path_passes_middle_points_as_through_locations(valhalla: respx.MockRouter) -> None:
    call = valhalla.post("/route").respond(json=fixture("route_path_through.json"))
    points = [Coord(lat=36.70153, lng=137.84561), Coord(lat=36.6985, lng=137.8616), IWATAKE]

    route = ValhallaClient(VALHALLA).path("drive", points)

    sent = json.loads(call.calls.last.request.content)["locations"]
    assert [loc.get("type") for loc in sent] == [None, "through", None]
    assert route.geometry.coordinates


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("VALHALLA_URL", VALHALLA)
    return TestClient(app)


def test_routes_endpoint_returns_route_set(valhalla: respx.MockRouter, api: TestClient) -> None:
    valhalla.post("/route").respond(json=fixture("route_drive_alternates.json"))

    response = api.get(
        "/api/routes",
        params={"mode": "drive", "from": "36.6985,137.8376", "to": "36.7395,137.851"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["primary"]["steps"][0]["maneuver"] == "depart"
    assert body["primary"]["steps"][0]["shapeRange"] == [0, 13]
    assert len(body["alternates"]) == 1


def test_routes_endpoint_rejects_too_many_alternates(api: TestClient) -> None:
    response = api.get(
        "/api/routes",
        params={"mode": "drive", "from": "36.7,137.8", "to": "36.7,137.85", "alternates": 3},
    )

    assert response.status_code == 422


def test_path_endpoint(valhalla: respx.MockRouter, api: TestClient) -> None:
    valhalla.post("/route").respond(json=fixture("route_path_through.json"))

    response = api.post(
        "/api/route/path",
        json={
            "mode": "drive",
            "points": [{"lat": 36.70153, "lng": 137.84561}, {"lat": 36.7395, "lng": 137.851}],
        },
    )

    assert response.status_code == 200
    assert response.json()["mode"] == "drive"


@pytest.mark.parametrize("n", [1, 26])
def test_path_endpoint_needs_2_to_25_points(api: TestClient, n: int) -> None:
    response = api.post(
        "/api/route/path",
        json={"mode": "drive", "points": [{"lat": 36.7, "lng": 137.8}] * n},
    )

    assert response.status_code == 422


def test_path_endpoint_maps_valhalla_down_to_503(
    valhalla: respx.MockRouter, api: TestClient
) -> None:
    valhalla.post("/route").mock(side_effect=httpx.ConnectError("refused"))

    response = api.post(
        "/api/route/path",
        json={"mode": "drive", "points": [{"lat": 36.7, "lng": 137.8}] * 2},
    )

    assert response.status_code == 503


@pytest.mark.live
def test_live_path_passes_near_every_point() -> None:
    import os

    from hakuba_api.bus.locate_stops import _km  # pyright: ignore[reportPrivateUsage]

    live = ValhallaClient(os.environ.get("VALHALLA_URL", "http://localhost:8002"))
    points = [  # consecutive located stops of Line E (data/bus_stops.json)
        Coord(lat=36.7015349, lng=137.8456096),  # Hakuba Happo Bus Terminal
        Coord(lat=36.7016428, lng=137.8436327),  # Mount
        Coord(lat=36.71091, lng=137.83063),  # Happo Sakka Slope
        Coord(lat=36.7094385, lng=137.8362778),  # Spicy Rental Wadano
    ]

    route = live.path("drive", points)

    line = [Coord(lat=lat, lng=lng) for lng, lat in route.geometry.coordinates]
    for p in points:
        assert min(_km(p, q) for q in line) * 1000 < 50


# --- v1.4: stops (SPEC-web-app "Edit the trip") -------------------------------------


def test_path_with_stops_sends_break_points_and_announces_each_stop(
    valhalla: respx.MockRouter,
) -> None:
    call = valhalla.post("/route").respond(json=fixture("route_path_stops.json"))
    points = [
        Coord(lat=36.69711, lng=137.85393),
        Coord(lat=36.69877, lng=137.86197),
        Coord(lat=36.70179, lng=137.83683),
    ]

    route = ValhallaClient(VALHALLA).path("drive", points, stop_at_points=True)

    sent = json.loads(call.calls.last.request.content)["locations"]
    assert [loc.get("type") for loc in sent] == [None, None, None]  # Valhalla's default: break
    arrivals = [s for s in route.steps if s.maneuver == "arrive"]
    assert [s.instruction.split(".")[0] for s in arrivals] == [
        "Arrive at stop 1",
        "You have arrived at your destination",
    ]
    stop = arrivals[0]
    assert stop.shape_range[0] > 0  # placed along the joined line, not at its start


def test_path_endpoint_accepts_stop_at_points(valhalla: respx.MockRouter, api: TestClient) -> None:
    valhalla.post("/route").respond(json=fixture("route_path_stops.json"))

    response = api.post(
        "/api/route/path",
        json={
            "mode": "drive",
            "points": [
                {"lat": 36.69711, "lng": 137.85393},
                {"lat": 36.69877, "lng": 137.86197},
                {"lat": 36.70179, "lng": 137.83683},
            ],
            "stopAtPoints": True,
        },
    )

    assert response.status_code == 200
    instructions = [s["instruction"] for s in response.json()["steps"]]
    assert any(i.startswith("Arrive at stop 1") for i in instructions)
