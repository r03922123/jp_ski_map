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
from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError, ValhallaClient
from hakuba_api.routing.polyline import decode_polyline

FIXTURES = Path(__file__).parents[1] / "fixtures" / "valhalla"
VALHALLA = "http://valhalla.test"
HAPPO_BUS_TERMINAL = Coord(lat=36.70153, lng=137.84561)
NAKIYAMA = Coord(lat=36.69824, lng=137.83881)


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def valhalla() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=VALHALLA, assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def client() -> ValhallaClient:
    return ValhallaClient(VALHALLA)


# --- polyline ---------------------------------------------------------------


def test_decodes_google_reference_polyline_as_lng_lat() -> None:
    # https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    points = decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", precision=5)

    assert points == [(-120.2, 38.5), (-120.95, 40.7), (-126.453, 43.252)]


def test_decoded_valhalla_shape_starts_at_origin() -> None:
    shape = fixture("route_drive.json")["trip"]["legs"][0]["shape"]

    lng, lat = decode_polyline(shape)[0]

    # Valhalla snaps the origin onto the nearest road edge (~4 m here)
    assert (lat, lng) == pytest.approx((36.70153, 137.84561), abs=1e-4)


# --- client -----------------------------------------------------------------


def test_drive_route_maps_summary_geometry_and_steps(
    valhalla: respx.MockRouter, client: ValhallaClient
) -> None:
    route_call = valhalla.post("/route").respond(json=fixture("route_drive.json"))

    route = client.route("drive", HAPPO_BUS_TERMINAL, NAKIYAMA)

    assert json.loads(route_call.calls.last.request.content)["costing"] == "auto"
    assert route.duration_s == 172
    assert route.distance_m == 837
    assert route.geometry.type == "LineString"
    assert route.geometry.coordinates[0] == pytest.approx([137.84561, 36.70153], abs=1e-4)
    assert route.steps[0].instruction == "Drive south."
    assert route.is_estimate is True


def test_walk_route_uses_pedestrian_costing(
    valhalla: respx.MockRouter, client: ValhallaClient
) -> None:
    route_call = valhalla.post("/route").respond(json=fixture("route_walk.json"))

    route = client.route("walk", HAPPO_BUS_TERMINAL, NAKIYAMA)

    assert json.loads(route_call.calls.last.request.content)["costing"] == "pedestrian"
    assert route.mode == "walk"
    assert route.duration_s == 593


def test_no_path_raises_no_route(valhalla: respx.MockRouter, client: ValhallaClient) -> None:
    valhalla.post("/route").respond(400, json=fixture("route_no_edges.json"))

    with pytest.raises(NoRouteError):
        client.route("drive", HAPPO_BUS_TERMINAL, Coord(lat=35.68, lng=139.76))


def test_unreachable_valhalla_raises_unavailable(
    valhalla: respx.MockRouter, client: ValhallaClient
) -> None:
    valhalla.post("/route").mock(side_effect=httpx.ConnectError("refused"))

    with pytest.raises(RoutingUnavailableError):
        client.route("drive", HAPPO_BUS_TERMINAL, NAKIYAMA)


# --- HTTP endpoint ------------------------------------------------------------


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("VALHALLA_URL", VALHALLA)
    return TestClient(app)


def test_route_endpoint_returns_camel_case_route(
    valhalla: respx.MockRouter, api: TestClient
) -> None:
    valhalla.post("/route").respond(json=fixture("route_drive.json"))

    response = api.get(
        "/api/route",
        params={"mode": "drive", "from": "36.70153,137.84561", "to": "36.69824,137.83881"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["durationS"] == 172
    assert body["isEstimate"] is True


def test_route_endpoint_maps_no_route_to_404(valhalla: respx.MockRouter, api: TestClient) -> None:
    valhalla.post("/route").respond(400, json=fixture("route_no_edges.json"))

    response = api.get(
        "/api/route",
        params={"mode": "drive", "from": "36.7,137.8", "to": "35.68,139.76"},
    )

    assert response.status_code == 404
    assert response.json() == {"error": "no_route"}


def test_route_endpoint_maps_valhalla_down_to_503(
    valhalla: respx.MockRouter, api: TestClient
) -> None:
    valhalla.post("/route").mock(side_effect=httpx.ConnectError("refused"))

    response = api.get(
        "/api/route",
        params={"mode": "walk", "from": "36.7,137.8", "to": "36.69,137.83"},
    )

    assert response.status_code == 503
    assert response.json() == {"error": "routing_unavailable"}


@pytest.mark.parametrize("bad", ["36.7", "abc,137.8", "36.7,137.8,1", "91,137.8"])
def test_route_endpoint_rejects_malformed_coordinates(api: TestClient, bad: str) -> None:
    response = api.get(
        "/api/route",
        params={"mode": "drive", "from": bad, "to": "36.69,137.83"},
    )

    assert response.status_code == 422


def test_route_endpoint_rejects_unknown_mode(api: TestClient) -> None:
    response = api.get(
        "/api/route",
        params={"mode": "fly", "from": "36.7,137.8", "to": "36.69,137.83"},
    )

    assert response.status_code == 422


@pytest.mark.live
def test_live_walk_happo_bus_terminal_to_nakiyama_under_20_min() -> None:
    import os

    live = ValhallaClient(os.environ.get("VALHALLA_URL", "http://localhost:8002"))

    route = live.route("walk", HAPPO_BUS_TERMINAL, NAKIYAMA)

    assert route.duration_s < 20 * 60


# --- matrix -------------------------------------------------------------------


def test_matrix_maps_cells_back_to_target_ids(
    valhalla: respx.MockRouter, client: ValhallaClient
) -> None:
    call = valhalla.post("/sources_to_targets").respond(json=fixture("matrix_jr_hakuba.json"))
    targets = [(f"t{i}", Coord(lat=36.7, lng=137.8)) for i in range(12)]

    cells = client.matrix("drive", Coord(lat=36.6987, lng=137.8617), targets)

    assert json.loads(call.calls.last.request.content)["costing"] == "auto"
    assert [c.id for c in cells] == [f"t{i}" for i in range(12)]
    assert cells[0].duration_s == 1843
    assert cells[0].distance_m == 27408


def test_matrix_unreachable_target_has_null_duration(
    valhalla: respx.MockRouter, client: ValhallaClient
) -> None:
    data = fixture("matrix_jr_hakuba.json")
    data["sources_to_targets"][0][1].update({"time": None, "distance": None})
    valhalla.post("/sources_to_targets").respond(json=data)
    targets = [(f"t{i}", Coord(lat=36.7, lng=137.8)) for i in range(12)]

    cells = client.matrix("drive", Coord(lat=36.6987, lng=137.8617), targets)

    assert (cells[1].duration_s, cells[1].distance_m) == (None, None)
