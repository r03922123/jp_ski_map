import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.main import app
from hakuba_api.places.photon import PHOTON_URL, clear_cache, search_photon, to_place

FIXTURES = Path(__file__).parents[1] / "fixtures" / "photon"


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def photon() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock


@pytest.fixture(autouse=True)
def fresh_photon_cache() -> None:
    clear_cache()


def test_maps_photon_feature_to_place() -> None:
    feature = fixture("hotel_hakuba.json")["features"][0]

    place = to_place(feature)

    assert place.id == "osm:node/6312753047"
    assert place.name == "Hotel Hakuba"
    assert place.kind == "hotel"
    assert (place.coord.lat, place.coord.lng) == (36.697108, 137.8539256)
    assert place.source == "photon"


def test_english_query_finds_hotel_hakuba_first(photon: respx.MockRouter) -> None:
    photon.get(PHOTON_URL).respond(json=fixture("hotel_hakuba.json"))

    names = [p.name for p in search_photon("Hotel Hakuba", 10)]

    assert names[0] == "Hotel Hakuba"


def test_japanese_query_finds_tokyu_hotel(photon: respx.MockRouter) -> None:
    photon.get(PHOTON_URL).respond(json=fixture("hakuba_tokyu_ja.json"))

    places = search_photon("白馬東急ホテル", 10)

    assert places[0].name == "白馬東急ホテル"
    assert places[0].kind == "hotel"


def test_results_outside_hakuba_are_ranked_last(photon: respx.MockRouter) -> None:
    data = fixture("hotel_hakuba.json")
    far = json.loads(json.dumps(data["features"][1]))
    far["geometry"]["coordinates"] = [139.76, 35.68]  # Tokyo
    far["properties"]["name"] = "Far Away Hotel"
    data["features"] = [far, data["features"][0]]
    photon.get(PHOTON_URL).respond(json=data)

    names = [p.name for p in search_photon("hotel", 10)]

    assert names == ["Hotel Hakuba", "Far Away Hotel"]


def test_identical_queries_hit_photon_once(photon: respx.MockRouter) -> None:
    route = photon.get(PHOTON_URL).respond(json=fixture("hotel_hakuba.json"))

    search_photon("Hotel Hakuba", 10)
    search_photon("  hotel hakuba ", 10)

    assert route.call_count == 1


def test_sends_neutral_user_agent(photon: respx.MockRouter) -> None:
    route = photon.get(PHOTON_URL).respond(json=fixture("hotel_hakuba.json"))

    search_photon("Hotel Hakuba", 10)

    user_agent = route.calls.last.request.headers["user-agent"]
    assert user_agent.startswith("hakuba-ski-map/")
    assert "@" not in user_agent


# --- HTTP endpoint ------------------------------------------------------------

client = TestClient(app)


def test_search_endpoint_returns_places(photon: respx.MockRouter) -> None:
    photon.get(PHOTON_URL).respond(json=fixture("hotel_hakuba.json"))

    response = client.get("/api/places/search", params={"q": "Hotel Hakuba"})

    assert response.status_code == 200
    assert response.json()[0]["name"] == "Hotel Hakuba"


def test_search_endpoint_parses_google_maps_link_without_photon(
    photon: respx.MockRouter,
) -> None:
    route = photon.get(PHOTON_URL)
    url = "https://www.google.com/maps/place/Phoenix+Hotel/@36.7,137.84,17z/data=!3d36.7015!4d137.8441"

    response = client.get("/api/places/search", params={"q": url})

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "gmaps-link",
            "name": "Phoenix Hotel",
            "kind": "other",
            "coord": {"lat": 36.7015, "lng": 137.8441},
            "address": None,
            "source": "gmaps-link",
        }
    ]
    assert route.call_count == 0


def test_unparseable_google_link_returns_empty_list() -> None:
    response = client.get(
        "/api/places/search", params={"q": "https://www.google.com/maps/search/hotels"}
    )

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize("q", ["", "   "])
def test_search_endpoint_rejects_empty_query(q: str) -> None:
    assert client.get("/api/places/search", params={"q": q}).status_code == 422


def test_search_endpoint_maps_photon_failure_to_502(photon: respx.MockRouter) -> None:
    photon.get(PHOTON_URL).mock(side_effect=httpx.ConnectError("down"))

    response = client.get("/api/places/search", params={"q": "Hotel Hakuba"})

    assert response.status_code == 502
    assert response.json() == {"error": "upstream_unavailable", "source": "photon"}


@pytest.mark.live
@pytest.mark.parametrize(
    ("query", "expected"),
    [("Hotel Hakuba", "Hotel Hakuba"), ("白馬東急ホテル", "白馬東急ホテル")],
)
def test_live_photon_finds_spot_check_hotels(query: str, expected: str) -> None:
    clear_cache()

    names = [p.name for p in search_photon(query, 10)[:3]]

    assert expected in names
