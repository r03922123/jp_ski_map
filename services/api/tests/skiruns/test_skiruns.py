import copy
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from hakuba_api.catalog.store import load_resorts
from hakuba_api.main import app
from hakuba_api.skiruns.models import LineString, SkiLines
from hakuba_api.skiruns.refresh import API, OPENSKIMAP_NAMES, build, fetch
from hakuba_api.skiruns.validate import validate_ski_lines

FIXTURES = Path(__file__).parent / "fixtures"
RESORT_IDS = [r.id for r in load_resorts()]


def answer(kind: str) -> dict[str, Any]:
    """A trimmed OpenSkiMap answer recorded 2026-11-23 (5 runs; one lift per resort + 1 disused)."""
    return json.loads((FIXTURES / f"{kind}.json").read_text())


def by_name(lines: SkiLines) -> dict[str | None, str]:
    return {f.properties.name: f.properties.resort_id for f in lines.features}


# --- refresh -----------------------------------------------------------------------


def test_every_resort_has_an_openskimap_name() -> None:
    assert sorted(OPENSKIMAP_NAMES.values()) == sorted(RESORT_IDS)


def test_fetch_asks_for_one_kind_in_the_hakuba_bbox_as_west_south_east_north() -> None:
    with respx.mock() as upstream:
        route = upstream.get(API).mock(return_value=httpx.Response(200, json={"features": []}))
        fetch("lift")

    assert route.calls.last.request.url.params["bbox"] == "137.75,36.55,137.95,36.9"
    assert route.calls.last.request.url.params["types"] == "lift"


def test_the_fixtures_build_a_file_the_validator_accepts() -> None:
    lines, _ = build(answer("run"), answer("lift"))

    assert validate_ski_lines(lines, RESORT_IDS) == []
    assert {f.properties.resort_id for f in lines.features} == set(RESORT_IDS)


def test_a_happo_one_run_gets_its_resort_id() -> None:
    lines, _ = build(answer("run"), answer("lift"))

    run = by_name(lines)["リーゼングラートコース"]
    assert run == "happo-one"


def test_drops_a_run_with_no_ski_area_a_nordic_run_and_a_disused_lift() -> None:
    lines, _ = build(answer("run"), answer("lift"))

    names = by_name(lines)
    assert "黒菱ゲレンデ, Kurobishi" not in names  # no ski area in OpenSkiMap
    assert "Tsuga No.1 Pair" not in names  # disused
    kept_runs = [f for f in lines.features if f.properties.kind == "run"]
    assert len(kept_runs) == 3  # downhill + snow_park + the area run; nordic and no-area dropped


def test_coordinates_are_rounded_to_5_decimals() -> None:
    lines, _ = build(answer("run"), answer("lift"))

    first = lines.features[0].geometry.model_dump()["coordinates"][0]
    assert list(first) == [round(c, 5) for c in first]


def test_a_run_missing_difficulty_fails_the_refresh_with_the_field_name() -> None:
    runs = answer("run")
    del runs["features"][0]["properties"]["difficulty"]

    with pytest.raises(ValidationError, match="difficulty"):
        build(runs, answer("lift"))


def test_a_renamed_ski_area_fails_the_refresh_instead_of_dropping_the_resort() -> None:
    lifts = answer("lift")
    for f in lifts["features"]:
        for a in f["properties"]["skiAreas"]:
            if a["properties"]["name"] == "白馬五竜, Hakuba Goryu":
                a["properties"]["name"] = "Hakuba Goryu"

    with pytest.raises(ValueError, match="白馬五竜"):
        build(answer("run"), lifts)


# --- validator ---------------------------------------------------------------------


def test_validator_names_each_broken_rule() -> None:
    lines, _ = build(answer("run"), answer("lift"))
    good = lines.features[0]
    dup = copy.deepcopy(good)
    outside = copy.deepcopy(good)
    outside.properties.id = "outside"
    outside.geometry = LineString(type="LineString", coordinates=[(140.0, 36.7), (140.0, 36.8)])
    stray = copy.deepcopy(good)
    stray.properties.id = "stray"
    stray.properties.resort_id = "nowhere"
    dot = copy.deepcopy(good)
    dot.properties.id = "dot"
    dot.geometry = LineString(type="LineString", coordinates=[(137.85, 36.7)])
    no_goryu = [f for f in lines.features if f.properties.resort_id != "goryu"]
    broken = SkiLines(features=[*no_goryu, dup, outside, stray, dot])

    errors = validate_ski_lines(broken, RESORT_IDS)

    assert errors == [
        f"ski_lines.json: duplicate id {good.properties.id}",
        "ski_lines.json: outside leaves the Hakuba bbox",
        "ski_lines.json: stray has unknown resortId nowhere",
        "ski_lines.json: dot has fewer than 2 points",
        "ski_lines.json: goryu has no lift",
    ]


# --- endpoint (the committed snapshot) ---------------------------------------------


def test_endpoint_serves_the_snapshot_as_cached_geojson() -> None:
    response = TestClient(app).get("/api/ski-lines")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=86400"
    body = response.json()
    assert body["type"] == "FeatureCollection"
    kinds = [f["properties"]["kind"] for f in body["features"]]
    assert kinds.count("run") >= 200
    assert kinds.count("lift") >= 90
    assert {f["properties"]["resortId"] for f in body["features"]} == set(RESORT_IDS)
    assert set(body["features"][0]["properties"]) == {
        "id",
        "kind",
        "name",
        "difficulty",
        "liftType",
        "resortId",
    }
