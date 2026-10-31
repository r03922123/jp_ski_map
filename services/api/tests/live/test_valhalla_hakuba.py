"""The Hakuba-only tiles give the same answers as the full Chubu build (measured 2026-10-31).

Without default_speeds.json, drive times came out up to 37% too fast; walking was unaffected.
"""

import os

import httpx
import pytest

VALHALLA_URL = os.environ.get("VALHALLA_URL", "http://localhost:8002")
HAPPO = (36.69711, 137.85393)

# (from, to, costing) -> (km, minutes) from the Chubu build
EXPECTED = {
    (HAPPO, (36.7006, 137.8320), "auto"): (2.80, 11.5),
    (HAPPO, (36.7006, 137.8320), "pedestrian"): (2.52, 29.8),
    (HAPPO, (36.7835, 137.8650), "auto"): (17.16, 29.9),
    (HAPPO, (36.7835, 137.8650), "pedestrian"): (16.86, 198.4),
    (HAPPO, (36.5622, 137.8278), "auto"): (18.14, 23.4),
    (HAPPO, (36.5622, 137.8278), "pedestrian"): (16.96, 199.6),
    ((36.6977, 137.8622), (36.7880, 137.8530), "auto"): (22.46, 57.8),
}


@pytest.mark.live
@pytest.mark.parametrize(("key", "expected"), list(EXPECTED.items()))
def test_hakuba_tiles_match_the_full_build(
    key: tuple[tuple[float, float], tuple[float, float], str], expected: tuple[float, float]
) -> None:
    (a, b, costing), (km, minutes) = key, expected
    response = httpx.post(
        f"{VALHALLA_URL}/route",
        json={
            "locations": [{"lat": a[0], "lon": a[1]}, {"lat": b[0], "lon": b[1]}],
            "costing": costing,
        },
        timeout=10,
    )
    summary = response.json()["trip"]["summary"]
    assert summary["length"] == pytest.approx(km, rel=0.02)
    assert summary["time"] / 60 == pytest.approx(minutes, rel=0.02)
