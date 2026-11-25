"""SPEC-poi-destinations v1.2: Google place IDs for food POIs (only IDs are stored)."""

import json
from pathlib import Path
from typing import Any

import pytest

from hakuba_api.pois.models import Poi
from hakuba_api.pois.refresh_google_ids import FIELD_MASK, match_ids, place_id, search_request
from hakuba_api.pois.refresh_pois import prune_google_ids
from hakuba_api.pois.validate import validate_google_ids

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "google_places"


def food(i: int, name_ja: str | None = None, category: str = "food") -> Poi:
    return Poi.model_validate(
        {
            "id": f"osm:node/{i}",
            "category": category,
            "name": f"Place {i}",
            "nameJa": name_ja,
            "coord": {"lat": 36.70, "lng": 137.86},
            "brand": None,
            "cuisine": None,
            "openingHours": None,
        }
    )


def recorded() -> dict[str, Any]:
    return json.loads((FIXTURES / "text_search_match.json").read_text())


def test_fixture_holds_no_key() -> None:
    text = (FIXTURES / "text_search_match.json").read_text()

    assert "X-Goog-Api-Key" not in text and "AIza" not in text


def test_request_asks_for_ids_only_with_japanese_name_in_a_200_m_box() -> None:
    headers, body = search_request(food(1, name_ja="蕎麦 福"))

    assert headers == {"X-Goog-FieldMask": "places.id"} == {"X-Goog-FieldMask": FIELD_MASK}
    assert body["textQuery"] == "蕎麦 福"
    assert body["pageSize"] == 1
    box = body["locationRestriction"]["rectangle"]
    lat_m = (box["high"]["latitude"] - box["low"]["latitude"]) * 111_320
    lng_m = (box["high"]["longitude"] - box["low"]["longitude"]) * 111_320 * 0.8021  # cos 36.7°
    assert lat_m == pytest.approx(200, rel=0.01)
    assert lng_m == pytest.approx(200, rel=0.01)
    assert box["low"]["latitude"] < 36.70 < box["high"]["latitude"]
    assert box["low"]["longitude"] < 137.86 < box["high"]["longitude"]


def test_request_falls_back_to_the_name() -> None:
    assert search_request(food(1))[1]["textQuery"] == "Place 1"


def test_parses_the_first_place_id_and_none_without_places() -> None:
    assert place_id(recorded()) == "ChIJtest-soba-fuku-hakuba"
    assert place_id({}) is None
    assert place_id({"places": []}) is None


def test_matches_food_only_leaves_unmatched_out_and_the_output_validates() -> None:
    pois = [food(1, "蕎麦 福"), food(2, "無い店"), food(3, category="convenience")]
    queried: list[str] = []

    def search(headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        queried.append(body["textQuery"])
        return recorded() if body["textQuery"] == "蕎麦 福" else {}

    ids = match_ids(pois, search)

    assert ids == {"osm:node/1": "ChIJtest-soba-fuku-hakuba"}
    assert queried == ["蕎麦 福", "無い店"]
    assert validate_google_ids(pois, ids) == []


def test_validator_rejects_unknown_non_food_and_empty_ids() -> None:
    pois = [food(1), food(2, category="convenience")]

    errors = validate_google_ids(pois, {"osm:node/1": "", "osm:node/2": "x", "osm:node/9": "y"})

    assert len(errors) == 3
    assert any("osm:node/1" in e and "empty" in e for e in errors)
    assert any("osm:node/2" in e and "food" in e for e in errors)
    assert any("osm:node/9" in e and "poi_osm.json" in e for e in errors)


def test_validator_rejects_one_place_id_matched_to_two_pois() -> None:
    errors = validate_google_ids([food(1), food(2)], {"osm:node/1": "ChIJ1", "osm:node/2": "ChIJ1"})

    assert errors == ["poi_google.json: osm:node/2 has the same place ID as osm:node/1"]


def test_poi_refresh_drops_place_ids_of_vanished_or_non_food_pois() -> None:
    pois = [food(1), food(2, category="convenience")]

    kept = prune_google_ids({"osm:node/1": "a", "osm:node/2": "b", "osm:node/9": "c"}, pois)

    assert kept == {"osm:node/1": "a"}


def test_store_joins_place_ids_at_load(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from hakuba_api.pois import store

    rows = [food(1).model_dump(by_alias=True), food(2).model_dump(by_alias=True)]
    (tmp_path / "poi_osm.json").write_text(json.dumps(rows))
    (tmp_path / "poi_google.json").write_text('{"osm:node/1": "ChIJ1"}')
    monkeypatch.setenv("HAKUBA_DATA_DIR", str(tmp_path))
    store.load_pois.cache_clear()
    store.load_google_ids.cache_clear()
    try:
        pois = store.load_pois()
    finally:
        store.load_pois.cache_clear()
        store.load_google_ids.cache_clear()

    assert [p.google_place_id for p in pois] == ["ChIJ1", None]
