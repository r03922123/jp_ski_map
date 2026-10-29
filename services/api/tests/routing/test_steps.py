import json
from pathlib import Path

import pytest
import respx

from hakuba_api.common.geo import Coord
from hakuba_api.routing.client import ValhallaClient
from hakuba_api.routing.maneuvers import maneuver_for, route_summary

FIXTURES = Path(__file__).parents[1] / "fixtures" / "valhalla"
VALHALLA = "http://valhalla.test"


@pytest.mark.parametrize(
    ("valhalla_type", "maneuver"),
    [
        (1, "depart"), (2, "depart"), (3, "depart"),
        (4, "arrive"), (5, "arrive"), (6, "arrive"),
        (8, "straight"), (9, "slight-right"), (10, "right"), (11, "sharp-right"),
        (12, "uturn"), (13, "uturn"), (14, "sharp-left"), (15, "left"), (16, "slight-left"),
        (18, "ramp-right"), (19, "ramp-left"), (20, "ramp-right"), (21, "ramp-left"),
        (23, "keep-right"), (24, "keep-left"), (25, "merge"), (37, "merge"), (38, "merge"),
        (26, "roundabout"), (27, "roundabout"), (28, "ferry"), (29, "ferry"),
    ],
)  # fmt: skip
def test_maps_valhalla_maneuver_types(valhalla_type: int, maneuver: str) -> None:
    assert maneuver_for(valhalla_type) == maneuver


@pytest.mark.parametrize("valhalla_type", [0, 7, 17, 22, 30, 36, 39, 99])
def test_other_and_unknown_types_read_as_straight(valhalla_type: int) -> None:
    assert maneuver_for(valhalla_type) == "straight"


def test_summary_names_the_two_longest_named_roads() -> None:
    legs: list[tuple[list[str], float]] = [
        (["白馬岳線", "322"], 0.7),
        (["白馬大橋"], 1.65),
        ([], 1.49),
        (["千国北城線", "433"], 1.23),
        (["白馬岳線", "322"], 0.2),
    ]

    assert route_summary(legs) == "via 白馬大橋 and 千国北城線"


def test_summary_uses_route_number_when_road_has_no_name() -> None:
    assert route_summary([(["148"], 3.0)]) == "via Route 148"
    assert route_summary([([], 3.0)]) is None


def test_route_steps_carry_maneuver_streets_and_shape_range() -> None:
    data = json.loads((FIXTURES / "route_drive_alternates.json").read_text())
    with respx.mock(base_url=VALHALLA) as mock:
        mock.post("/route").respond(json=data)
        route = ValhallaClient(VALHALLA).route(
            "drive", Coord(lat=36.6985, lng=137.8376), Coord(lat=36.7395, lng=137.8510)
        )

    assert route.steps[0].maneuver == "depart"
    assert route.steps[-1].maneuver == "arrive"
    assert route.steps[3].street_names == ["白馬岳線", "322"]
    assert route.summary == "via 白馬大橋 and 千国北城線"
    ranges = [s.shape_range for s in route.steps]
    assert ranges[0][0] == 0
    assert ranges[-1][1] == len(route.geometry.coordinates) - 1
    assert all(a[1] == b[0] for a, b in zip(ranges, ranges[1:], strict=False))
