import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common.geo import Coord
from hakuba_api.main import app
from hakuba_api.pois.models import Poi
from hakuba_api.pois.query import PREFILTER, nearby
from hakuba_api.pois.refresh_pois import elements_to_pois, poi_query
from hakuba_api.pois.router import get_pois
from hakuba_api.pois.validate import validate_pois
from hakuba_api.routing.models import MatrixCell

VALHALLA = "http://valhalla.test"
JR_HAKUBA = Coord(lat=36.6987, lng=137.8617)


def poi(i: int, lat: float, lng: float, category: str = "convenience") -> Poi:
    return Poi.model_validate(
        {
            "id": f"osm:node/{i}",
            "category": category,
            "name": f"Place {i}",
            "nameJa": None,
            "coord": {"lat": lat, "lng": lng},
            "brand": None,
            "cuisine": None,
            "openingHours": None,
        }
    )


# --- snapshot ----------------------------------------------------------------------


def test_query_asks_for_food_and_convenience_in_hakuba() -> None:
    q = poi_query()

    assert '"amenity"~"^(restaurant|cafe|fast_food|food_court|pub|bar)$"' in q
    assert '"shop"="convenience"' in q
    assert "36.55,137.75,36.9,137.95" in q


def test_converts_elements_to_pois_and_skips_unnamed_or_unknown() -> None:
    elements: list[dict[str, Any]] = [
        {
            "type": "node",
            "id": 1,
            "lat": 36.70,
            "lon": 137.86,
            "tags": {
                "amenity": "restaurant",
                "name": "蕎麦 福",
                "name:en": "Soba Fuku",
                "cuisine": "soba",
                "opening_hours": "11:00-15:00",
            },
        },
        {
            "type": "node",
            "id": 2,
            "lat": 36.69,
            "lon": 137.84,
            "tags": {
                "shop": "convenience",
                "name": "セブン-イレブン 白馬八方店",
                "brand": "7-Eleven",
                "brand:en": "7-Eleven",
                "opening_hours": "24/7",
            },
        },
        {
            "type": "way",
            "id": 3,
            "center": {"lat": 36.71, "lon": 137.85},
            "tags": {"amenity": "cafe", "name": "Cafe Way"},
        },
        {"type": "node", "id": 4, "lat": 36.70, "lon": 137.86, "tags": {"amenity": "restaurant"}},
        {
            "type": "node",
            "id": 5,
            "lat": 36.70,
            "lon": 137.86,
            "tags": {"amenity": "bank", "name": "Bank"},
        },
        {
            "type": "node",
            "id": 6,
            "lat": 36.70,
            "lon": 137.86,
            "tags": {"shop": "convenience", "brand": "Lawson"},
        },
    ]

    pois = elements_to_pois(elements)

    assert [(p.id, p.category, p.name) for p in pois] == [
        ("osm:node/1", "food", "Soba Fuku"),
        ("osm:node/2", "convenience", "セブン-イレブン 白馬八方店"),
        ("osm:way/3", "food", "Cafe Way"),
        ("osm:node/6", "convenience", "Lawson"),  # brand stands in for a missing name
    ]
    assert pois[0].name_ja == "蕎麦 福"
    assert (pois[0].cuisine, pois[0].opening_hours) == ("soba", "11:00-15:00")
    assert pois[1].brand == "7-Eleven"
    assert pois[2].coord == Coord(lat=36.71, lng=137.85)


def test_validator_rejects_duplicates_and_points_outside_hakuba() -> None:
    assert validate_pois([poi(1, 36.70, 137.86), poi(2, 36.71, 137.85)]) == []

    errors = validate_pois([poi(1, 36.70, 137.86), poi(1, 36.70, 137.86), poi(3, 35.0, 139.0)])

    assert any("duplicate" in e for e in errors)
    assert any("osm:node/3" in e and "outside" in e for e in errors)


# --- nearby ------------------------------------------------------------------------


def test_nearby_sorts_by_travel_time_drops_unreachable_and_limits() -> None:
    pois = [poi(i, 36.70 + i * 0.001, 137.86) for i in range(5)]
    durations = {
        "osm:node/0": 300,
        "osm:node/1": None,
        "osm:node/2": 120,
        "osm:node/3": 600,
        "osm:node/4": 60,
    }

    def matrix(mode: str, origin: Coord, targets: list[tuple[str, Coord]]) -> list[MatrixCell]:
        assert mode == "walk"
        return [MatrixCell(id=t, duration_s=durations[t], distance_m=1) for t, _ in targets]

    result = nearby(pois, JR_HAKUBA, "convenience", "walk", limit=3, matrix=matrix)

    assert [r.id for r in result] == ["osm:node/4", "osm:node/2", "osm:node/0"]
    assert result[0].duration_s == 60


def test_nearby_prefilters_the_closest_by_straight_line_before_routing() -> None:
    pois = [poi(i, 36.70 + i * 0.002, 137.86) for i in range(40)]  # 0 is nearest JR Hakuba
    routed: list[str] = []

    def matrix(mode: str, origin: Coord, targets: list[tuple[str, Coord]]) -> list[MatrixCell]:
        routed.extend(t for t, _ in targets)
        return [MatrixCell(id=t, duration_s=10, distance_m=10) for t, _ in targets]

    nearby(pois, JR_HAKUBA, "convenience", "drive", limit=10, matrix=matrix)

    assert len(routed) == PREFILTER
    assert "osm:node/0" in routed and "osm:node/39" not in routed


def test_nearby_filters_by_category() -> None:
    pois = [poi(1, 36.70, 137.86, "food"), poi(2, 36.70, 137.86, "convenience")]

    def matrix(mode: str, origin: Coord, targets: list[tuple[str, Coord]]) -> list[MatrixCell]:
        return [MatrixCell(id=t, duration_s=10, distance_m=10) for t, _ in targets]

    assert [r.id for r in nearby(pois, JR_HAKUBA, "food", "walk", limit=10, matrix=matrix)] == [
        "osm:node/1"
    ]


# --- endpoint ----------------------------------------------------------------------


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("VALHALLA_URL", VALHALLA)
    app.dependency_overrides[get_pois] = lambda: [
        poi(i, 36.70 + i * 0.001, 137.86, "food" if i % 2 else "convenience") for i in range(6)
    ]
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def valhalla() -> Iterator[respx.MockRouter]:
    def matrix(request: httpx.Request) -> httpx.Response:
        n = len(json.loads(request.content)["targets"])
        cells = [{"to_index": i, "time": (n - i) * 60, "distance": (n - i) * 100} for i in range(n)]
        return httpx.Response(200, json={"sources_to_targets": [cells]})

    with respx.mock(base_url=VALHALLA, assert_all_called=False) as mock:
        mock.post("/sources_to_targets").mock(side_effect=matrix)
        yield mock


def test_nearby_endpoint_returns_camel_case_sorted_results(
    api: TestClient, valhalla: respx.MockRouter
) -> None:
    response = api.get(
        "/api/pois/nearby",
        params={"from": "36.6987,137.8617", "category": "convenience", "mode": "walk", "limit": 2},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["durationS"] <= body[1]["durationS"]
    assert body[0]["category"] == "convenience"
    assert "openingHours" in body[0]


def test_nearby_endpoint_rejects_unknown_category(api: TestClient) -> None:
    response = api.get(
        "/api/pois/nearby", params={"from": "36.6987,137.8617", "category": "onsen", "mode": "walk"}
    )

    assert response.status_code == 422


def test_nearby_endpoint_maps_valhalla_down_to_503(api: TestClient) -> None:
    with respx.mock(base_url=VALHALLA) as mock:
        mock.post("/sources_to_targets").mock(side_effect=httpx.ConnectError("refused"))
        response = api.get(
            "/api/pois/nearby",
            params={"from": "36.6987,137.8617", "category": "food", "mode": "drive"},
        )

    assert response.status_code == 503
    assert response.json() == {"error": "routing_unavailable"}
