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
from hakuba_api.data.paths import data_dir
from hakuba_api.main import app
from hakuba_api.skiruns import refresh
from hakuba_api.skiruns.models import LineString, Polygon, SkiLines
from hakuba_api.skiruns.refresh import API, OPENSKIMAP_NAMES, build, fetch
from hakuba_api.skiruns.validate import validate_ski_lines

FIXTURES = Path(__file__).parent / "fixtures"
REPO_DATA = data_dir()
NORDIC_RUN = "5890df0eda76e657e30aded013c6283c7ec83a37"
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
    lines = build(answer("run"), answer("lift"))

    assert validate_ski_lines(lines, RESORT_IDS) == []
    assert {f.properties.resort_id for f in lines.features} == set(RESORT_IDS)


def test_a_happo_one_run_gets_its_resort_id() -> None:
    lines = build(answer("run"), answer("lift"))

    run = by_name(lines)["リーゼングラートコース"]
    assert run == "happo-one"


def test_drops_a_run_with_no_ski_area_a_nordic_run_and_a_disused_lift() -> None:
    lines = build(answer("run"), answer("lift"))

    names = by_name(lines)
    assert "黒菱ゲレンデ, Kurobishi" not in names  # no ski area in OpenSkiMap
    assert "Tsuga No.1 Pair" not in names  # disused
    ids = {f.properties.id for f in lines.features}
    assert NORDIC_RUN not in ids  # its ski area (Happo One) matches, so only `uses` drops it
    kept_runs = [f for f in lines.features if f.properties.kind == "run"]
    assert len(kept_runs) == 3  # downhill + snow_park + the area run


def test_a_run_that_is_not_operating_is_dropped() -> None:
    runs = answer("run")
    runs["features"][0]["properties"]["status"] = "abandoned"

    names = by_name(build(runs, answer("lift")))

    assert "リーゼングラートコース" not in names


def test_main_writes_a_file_the_store_loads_and_the_validator_accepts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(refresh, "fetch", answer)
    monkeypatch.setenv("HAKUBA_DATA_DIR", str(tmp_path))
    (tmp_path / "resorts.json").write_bytes((REPO_DATA / "resorts.json").read_bytes())
    load_resorts.cache_clear()
    try:
        refresh.main()
    finally:
        load_resorts.cache_clear()

    written = SkiLines.model_validate_json((tmp_path / "ski_lines.json").read_bytes())
    assert written == build(answer("run"), answer("lift"))
    assert validate_ski_lines(written, RESORT_IDS) == []


def test_coordinates_are_rounded_to_5_decimals() -> None:
    lines = build(answer("run"), answer("lift"))

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

    with pytest.raises(ValueError, match="unknown OpenSkiMap ski area 'Hakuba Goryu'"):
        build(answer("run"), lifts)


def test_cortina_is_not_matched_to_iwatake_although_its_name_contains_it() -> None:
    lines = build(answer("run"), answer("lift"))

    assert by_name(lines)["コルチナ第１ペアリフト, Cortina Number 1 Pair Lift"] == "cortina"


def test_a_ski_area_without_a_name_is_dropped() -> None:
    runs = answer("run")
    happo = runs["features"][0]
    happo["properties"]["skiAreas"][0]["properties"]["name"] = None

    names = by_name(build(runs, answer("lift")))

    assert happo["properties"]["name"] not in names


def test_elevation_is_stripped_from_every_coordinate() -> None:
    runs = answer("run")
    runs["features"][0]["geometry"]["coordinates"] = [
        [137.8, 36.7, 1234.5],
        [137.81, 36.71, 1200.0],
    ]

    lines = build(runs, answer("lift"))

    for f in lines.features:
        rings = f.geometry.coordinates if f.geometry.type == "Polygon" else [f.geometry.coordinates]
        assert all(len(point) == 2 for ring in rings for point in ring)


def test_length_and_elevation_come_from_the_3d_coordinates_before_they_are_dropped() -> None:
    runs = answer("run")
    first = runs["features"][0]
    first["geometry"] = {
        "type": "LineString",
        "coordinates": [[137.8, 36.7, 1234.6], [137.81, 36.71, 1200.0]],
    }

    lines = build(runs, answer("lift")).features
    p = next(f.properties for f in lines if f.properties.id == first["properties"]["id"])

    # 0.01 deg north (1112 m) and 0.01 deg east at 36.7 N (892 m): 1425 m apart
    assert p.length_m == pytest.approx(1425, abs=2)
    assert (p.min_ele_m, p.max_ele_m) == (1200, 1235)


def test_an_area_run_has_no_length_and_a_point_without_elevation_none() -> None:
    runs = answer("run")
    area, flat = runs["features"][0], runs["features"][1]
    area["geometry"] = {
        "type": "Polygon",
        "coordinates": [
            [[137.8, 36.7, 900], [137.81, 36.7, 950], [137.81, 36.71, 1000], [137.8, 36.7, 900]]
        ],
    }
    flat["geometry"] = {"type": "LineString", "coordinates": [[137.8, 36.7, 900], [137.81, 36.71]]}
    flat["properties"]["skiAreas"] = area["properties"]["skiAreas"]

    props = {f.properties.id: f.properties for f in build(runs, answer("lift")).features}
    a, b = props[area["properties"]["id"]], props[flat["properties"]["id"]]

    assert (a.length_m, a.min_ele_m, a.max_ele_m) == (None, 900, 1000)
    assert b.length_m is not None
    assert (b.min_ele_m, b.max_ele_m) == (None, None)


# --- validator ---------------------------------------------------------------------


def test_validator_names_each_broken_rule() -> None:
    lines = build(answer("run"), answer("lift"))
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
    open_ring = copy.deepcopy(good)
    open_ring.properties.id = "open-ring"
    open_ring.geometry = Polygon(
        type="Polygon",
        coordinates=[[(137.85, 36.7), (137.86, 36.7), (137.86, 36.71), (137.85, 36.71)]],
    )
    no_goryu = [f for f in lines.features if f.properties.resort_id != "goryu"]
    broken = SkiLines(features=[*no_goryu, dup, outside, stray, dot, open_ring])

    errors = validate_ski_lines(broken, RESORT_IDS)

    assert errors == [
        f"ski_lines.json: duplicate id {good.properties.id}",
        "ski_lines.json: outside leaves the Hakuba bbox",
        "ski_lines.json: stray has unknown resortId nowhere",
        "ski_lines.json: dot has fewer than 2 points",
        "ski_lines.json: open-ring has a ring that is not closed with >= 4 points",
        "ski_lines.json: goryu has no lift",
    ]


# --- endpoint (the committed snapshot) ---------------------------------------------


def test_endpoint_serves_the_snapshot_as_cached_geojson() -> None:
    response = TestClient(app).get("/api/ski-lines")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=3600"
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
        "lengthM",
        "minEleM",
        "maxEleM",
    }
