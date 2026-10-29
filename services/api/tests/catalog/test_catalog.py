from typing import Any

from fastapi.testclient import TestClient

from hakuba_api.catalog.models import Resort
from hakuba_api.catalog.store import load_resorts
from hakuba_api.catalog.validate import validate_resorts
from hakuba_api.main import app


def make_resort(**overrides: Any) -> Resort:
    data: dict[str, Any] = {
        "id": "happo-one",
        "name": {"en": "Hakuba Happo-One Snow Resort", "ja": "白馬八方尾根スキー場"},
        "region": "hakuba-valley",
        "website": "https://www.happo-one.jp/en/",
        "accessPoints": [
            {
                "id": "happo-one-nakiyama",
                "name": {"en": "Nakiyama Slope", "ja": "名木山ゲレンデ"},
                "coord": {"lat": 36.69824, "lng": 137.83881},
                "coordSource": "osm:way/31895855",
            }
        ],
        "stats": {
            "baseElevationM": 760,
            "topElevationM": 1831,
            "verticalM": 1071,
            "gondolas": 1,
            "chairLifts": 22,
            "runs": 16,
            "longestRunM": 8000,
            "totalRunsM": 23300,
            "areaHa": 220,
            "terrainPct": {"beginner": 30, "intermediate": 50, "advanced": 20},
            "nightSkiing": None,
            "dayTicketJpy": None,
        },
        "hakubaValleyPass": True,
        "statsSource": "https://www.hakubavalley.com/en/ski_resort_info_en/",
    }
    data.update(overrides)
    return Resort.model_validate(data)


def test_valid_resort_has_no_errors() -> None:
    assert validate_resorts([make_resort()]) == []


def test_rejects_duplicate_resort_ids() -> None:
    errors = validate_resorts([make_resort(), make_resort()])

    assert "duplicate resort id: happo-one" in errors


def test_rejects_duplicate_access_point_ids_across_resorts() -> None:
    other = make_resort(id="other")

    errors = validate_resorts([make_resort(), other])

    assert errors == ["duplicate access point id: happo-one-nakiyama"]


def test_rejects_missing_japanese_name() -> None:
    resort = make_resort(name={"en": "Happo", "ja": " "})

    assert validate_resorts([resort]) == ["happo-one: name.ja is empty"]


def test_rejects_coordinates_outside_hakuba() -> None:
    resort = make_resort(
        accessPoints=[
            {
                "id": "tokyo",
                "name": {"en": "Tokyo", "ja": "東京"},
                "coord": {"lat": 35.68, "lng": 139.76},
                "coordSource": "manual",
            }
        ]
    )

    assert validate_resorts([resort]) == ["happo-one/tokyo: coord outside Hakuba bbox"]


def test_rejects_terrain_percentages_not_summing_to_100() -> None:
    resort = make_resort()
    assert resort.stats.terrain_pct is not None
    resort.stats.terrain_pct.advanced = 25

    assert validate_resorts([resort]) == ["happo-one: terrainPct sums to 105, expected 100"]


def test_rejects_resort_without_access_points() -> None:
    resort = make_resort(accessPoints=[])

    assert validate_resorts([resort]) == ["happo-one: no access points"]


def test_repository_data_has_all_ten_hakuba_valley_resorts() -> None:
    resorts = load_resorts()

    assert validate_resorts(resorts) == []
    assert {r.id for r in resorts} == {
        "jigatake",
        "kashimayari",
        "sanosaka",
        "goryu",
        "hakuba47",
        "happo-one",
        "iwatake",
        "tsugaike",
        "norikura",
        "cortina",
    }


def test_goryu_has_escal_plaza_and_iimori_access_points() -> None:
    goryu = next(r for r in load_resorts() if r.id == "goryu")

    assert [a.id for a in goryu.access_points] == ["goryu-escal-plaza", "goryu-iimori"]


def test_get_resorts_endpoint_returns_camel_case() -> None:
    response = TestClient(app).get("/api/resorts")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 10
    assert "accessPoints" in body[0]
    assert "hakubaValleyPass" in body[0]
