from collections.abc import Iterator

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common.upstream import UpstreamError
from hakuba_api.main import app
from hakuba_api.places.lodging import load_lodging
from hakuba_api.places.overpass import fetch_overpass
from hakuba_api.places.refresh_lodging import elements_to_places

MIRRORS = ["https://a.test/api/interpreter", "https://b.test/api/interpreter"]
OK_BODY: dict[str, list[object]] = {"elements": []}


@pytest.fixture
def mock() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as m:
        yield m


def test_retries_through_502s_then_succeeds(mock: respx.MockRouter) -> None:
    sleeps: list[float] = []
    mock.post(MIRRORS[0]).mock(
        side_effect=[httpx.Response(502), httpx.Response(502), httpx.Response(200, json=OK_BODY)]
    )

    result = fetch_overpass("[out:json];", MIRRORS[:1], attempts=3, sleep=sleeps.append)

    assert result == OK_BODY
    assert sleeps == [2, 4]  # exponential backoff


def test_falls_over_to_the_next_mirror(mock: respx.MockRouter) -> None:
    mock.post(MIRRORS[0]).respond(504)
    mock.post(MIRRORS[1]).respond(json=OK_BODY)

    assert fetch_overpass("[out:json];", MIRRORS, attempts=1, sleep=lambda _: None) == OK_BODY


def test_html_busy_page_counts_as_failure(mock: respx.MockRouter) -> None:
    # Overpass sometimes answers 200 with an HTML "server busy" page
    mock.post(MIRRORS[0]).respond(200, text="<html>busy</html>")
    mock.post(MIRRORS[1]).respond(json=OK_BODY)

    assert fetch_overpass("[out:json];", MIRRORS, attempts=1, sleep=lambda _: None) == OK_BODY


def test_raises_after_all_attempts_fail(mock: respx.MockRouter) -> None:
    mock.post(MIRRORS[0]).respond(502)

    with pytest.raises(UpstreamError):
        fetch_overpass("[out:json];", MIRRORS[:1], attempts=2, sleep=lambda _: None)


def test_converts_named_lodging_elements_and_skips_unnamed() -> None:
    elements = [
        {
            "type": "node",
            "id": 1,
            "lat": 36.7,
            "lon": 137.85,
            "tags": {"tourism": "guest_house", "name": "ペンション", "name:en": "Pension"},
        },
        {
            "type": "way",
            "id": 2,
            "center": {"lat": 36.71, "lon": 137.84},
            "tags": {"tourism": "hotel", "name": "Hotel X", "addr:street": "Main"},
        },
        {"type": "node", "id": 3, "lat": 36.7, "lon": 137.85, "tags": {"tourism": "hotel"}},
    ]

    places = elements_to_places(elements)

    assert [(p.id, p.name, p.kind) for p in places] == [
        ("osm:node/1", "Pension", "guest_house"),
        ("osm:way/2", "Hotel X", "hotel"),
    ]
    assert places[1].coord.lat == 36.71
    assert places[0].source == "osm-snapshot"


def test_repository_snapshot_has_20_plus_lodgings_around_happo_echoland() -> None:
    happo_echoland = [
        p
        for p in load_lodging()
        if 36.685 <= p.coord.lat <= 36.71 and 137.83 <= p.coord.lng <= 137.86
    ]

    assert len(happo_echoland) >= 20


client = TestClient(app)


def test_lodging_endpoint_filters_by_bbox() -> None:
    response = client.get("/api/places/lodging", params={"bbox": "36.685,137.83,36.71,137.86"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 20
    assert all(36.685 <= p["coord"]["lat"] <= 36.71 for p in body)


@pytest.mark.parametrize(
    "bbox", ["36.5,137.5,36.9,137.9", "1,2,3", "a,b,c,d", "36.71,137.83,36.685,137.86"]
)
def test_lodging_endpoint_rejects_large_or_malformed_bbox(bbox: str) -> None:
    assert client.get("/api/places/lodging", params={"bbox": bbox}).status_code == 422


def test_validate_lodging_flags_duplicates_strays_and_overlap() -> None:
    from hakuba_api.common.geo import Coord
    from hakuba_api.places.models import Place
    from hakuba_api.places.validate import validate_lodging

    def place(pid: str, name: str, lat: float, source: str) -> Place:
        return Place(
            id=pid,
            name=name,
            kind="hotel",
            coord=Coord(lat=lat, lng=137.84),
            address=None,
            source=source,  # type: ignore[arg-type]
        )

    osm = [place("osm:node/1", "Hotel Green Plaza Hakuba", 36.7754, "osm-snapshot")]
    overture = [
        place("overture:a", "Hotel Green Plaza Hakuba", 36.7755, "overture-snapshot"),  # dup
        place("overture:b", "Far Away Inn", 35.0, "overture-snapshot"),  # outside Hakuba
        place("osm:node/1", "Same Id", 36.70, "overture-snapshot"),  # id clash
    ]
    errors = validate_lodging(osm, overture)
    assert any("overture:a" in e and "duplicates" in e for e in errors)
    assert any("overture:b" in e and "outside" in e for e in errors)
    assert any("osm:node/1" in e and "duplicate id" in e for e in errors)


def test_the_committed_lodging_snapshots_are_valid() -> None:
    from hakuba_api.places.lodging import load_osm_lodging, load_overture_lodging
    from hakuba_api.places.validate import validate_lodging

    assert validate_lodging(load_osm_lodging(), load_overture_lodging()) == []
