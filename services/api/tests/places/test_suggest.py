import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.main import app
from hakuba_api.places import photon
from hakuba_api.places.photon import PHOTON_URL
from hakuba_api.places.refresh_lodging import elements_to_places

FIXTURES = Path(__file__).parents[1] / "fixtures" / "photon"


@pytest.fixture
def api() -> Iterator[TestClient]:
    photon.clear_cache()
    yield TestClient(app)


@pytest.fixture
def mock() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as m:
        yield m


def test_local_hit_carries_kind_detail_and_match_span(
    api: TestClient, mock: respx.MockRouter
) -> None:
    mock.get(PHOTON_URL).respond(json={"features": []})

    body: Any = api.get(
        "/api/places/suggest", params={"q": "happo bus", "near": "36.70,137.845"}
    ).json()

    assert body[0]["name"] == "Hakuba Happo Bus Terminal"
    assert body[0]["kind"] == "stop"
    assert body[0]["source"] == "index"
    assert body[0]["detail"] == "Bus stop"
    assert body[0]["match"] == [7, 16]


def test_enough_local_hits_never_call_photon(api: TestClient, mock: respx.MockRouter) -> None:
    call = mock.get(PHOTON_URL).respond(json={"features": []})

    body: Any = api.get(
        "/api/places/suggest", params={"q": "hakuba", "near": "36.70,137.845"}
    ).json()

    assert len(body) >= 3
    assert call.call_count == 0


def test_photon_fills_in_when_few_local_hits(api: TestClient, mock: respx.MockRouter) -> None:
    call = mock.get(PHOTON_URL).respond(
        json=json.loads((FIXTURES / "hotel_hakuba.json").read_text())
    )

    body: Any = api.get(
        "/api/places/suggest", params={"q": "Pheonix", "near": "36.70,137.845"}
    ).json()

    assert call.call_count == 1
    photon_hits = [b for b in body if b["source"] == "photon"]
    assert [b["name"] for b in photon_hits] == ["Pheonix Hotel"]
    assert all(b["kind"] in ("lodging", "place") for b in photon_hits)


def test_photon_results_without_a_shared_distinctive_word_are_dropped(
    api: TestClient, mock: respx.MockRouter
) -> None:
    # Photon answers "Hotel 24sweets Hakuba" with other Hakuba hotels; none may be shown
    mock.get(PHOTON_URL).respond(json=json.loads((FIXTURES / "hotel_hakuba.json").read_text()))

    body: Any = api.get(
        "/api/places/suggest", params={"q": "Hotel 24sweets Hakuba", "near": "36.70,137.845"}
    ).json()

    assert [b for b in body if b["source"] == "photon"] == []


def test_a_photon_result_must_carry_the_querys_lodging_word(
    api: TestClient, mock: respx.MockRouter
) -> None:
    feature = json.loads((FIXTURES / "hotel_hakuba.json").read_text())["features"][0]
    feature["geometry"]["coordinates"] = [137.85, 36.70]
    feature["properties"] |= {"name": "Snow Parking", "osm_key": "amenity", "osm_value": "parking"}
    mock.get(PHOTON_URL).respond(json={"features": [feature]})

    body: Any = api.get(
        "/api/places/suggest", params={"q": "Snow Park Hotel", "near": "36.70,137.845"}
    ).json()

    assert [b for b in body if b["source"] == "photon"] == []


def test_a_chinese_word_for_hotel_finds_the_japanese_name(
    api: TestClient, mock: respx.MockRouter
) -> None:
    call = mock.get(PHOTON_URL).respond(json={"features": []})

    body: Any = api.get(
        "/api/places/suggest", params={"q": "東急飯店", "near": "36.70,137.845"}
    ).json()

    # the lodging and its bus stop tie, and either one is the right place
    assert "白馬東急ホテル" in (body[0]["name"], body[0]["nameJa"])
    assert call.calls.last.request.url.params["q"] == "東急ホテル"


def test_photon_keeps_the_original_words_when_the_retry_finds_nothing(
    api: TestClient, mock: respx.MockRouter
) -> None:
    call = mock.get(PHOTON_URL).respond(json={"features": []})

    api.get("/api/places/suggest", params={"q": "北京飯店", "near": "36.70,137.845"})

    assert call.calls.last.request.url.params["q"] == "北京飯店"


def test_a_place_really_named_hanten_is_still_found(
    api: TestClient, mock: respx.MockRouter
) -> None:
    mock.get(PHOTON_URL).respond(json={"features": []})

    body: Any = api.get(
        "/api/places/suggest", params={"q": "白馬飯店", "near": "36.70,137.845"}
    ).json()

    assert body[0]["name"] == "Hakuba Hanten"


def test_photon_failure_still_returns_local_hits(api: TestClient, mock: respx.MockRouter) -> None:
    # "Pheonix" has one local hit, so suggest asks Photon (a query with 3 local hits never would)
    call = mock.get(PHOTON_URL).mock(side_effect=httpx.ConnectError("down"))

    response = api.get("/api/places/suggest", params={"q": "Pheonix", "near": "36.70,137.845"})

    assert call.call_count == 1
    assert response.status_code == 200
    assert response.json()[0]["source"] == "index"


@pytest.mark.parametrize("answer", [{"json": {"oops": 1}}, {"text": "<html>"}])
def test_malformed_photon_answer_still_returns_local_hits(
    api: TestClient, mock: respx.MockRouter, answer: dict[str, Any]
) -> None:
    # "Pheonix" has one local hit, so Photon is asked
    call = mock.get(PHOTON_URL).respond(**answer)

    response = api.get("/api/places/suggest", params={"q": "Pheonix", "near": "36.70,137.845"})

    assert call.call_count == 1
    assert response.status_code == 200
    assert [b["source"] for b in response.json()] == ["index"]


def test_short_queries_never_call_photon(api: TestClient, mock: respx.MockRouter) -> None:
    call = mock.get(PHOTON_URL).respond(json={"features": []})

    api.get("/api/places/suggest", params={"q": "zq", "near": "36.70,137.845"})

    assert call.call_count == 0


def test_google_maps_link_is_handled_first(api: TestClient) -> None:
    body: Any = api.get(
        "/api/places/suggest",
        params={
            "q": "https://www.google.com/maps/place/Hotel+X/@36.7,137.84,17z",
            "near": "36.70,137.845",
        },
    ).json()

    assert body[0]["source"] == "gmaps-link"
    assert body[0]["name"] == "Hotel X"


def test_lodging_refresh_keeps_the_japanese_name() -> None:
    places = elements_to_places(
        [
            {
                "type": "node",
                "id": 1,
                "lat": 36.7,
                "lon": 137.85,
                "tags": {
                    "tourism": "hotel",
                    "name": "白馬東急ホテル",
                    "name:en": "Hakuba Tokyu Hotel",
                    "name:ja": "白馬東急ホテル",
                },
            },
            {
                "type": "node",
                "id": 2,
                "lat": 36.7,
                "lon": 137.85,
                "tags": {"tourism": "hotel", "name": "Hotel Hakuba"},
            },
        ]
    )

    assert (places[0].name, places[0].name_ja) == ("Hakuba Tokyu Hotel", "白馬東急ホテル")
    assert (places[1].name, places[1].name_ja) == ("Hotel Hakuba", None)
