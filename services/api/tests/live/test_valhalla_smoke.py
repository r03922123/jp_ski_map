import os

import httpx
import pytest

VALHALLA_URL = os.environ.get("VALHALLA_URL", "http://localhost:8002")

JR_HAKUBA_STATION = {"lat": 36.6987, "lon": 137.8617}
HAPPO_AREA = {"lat": 36.6964, "lon": 137.8436}


@pytest.mark.live
def test_valhalla_routes_jr_hakuba_station_to_happo_by_car() -> None:
    response = httpx.post(
        f"{VALHALLA_URL}/route",
        json={"locations": [JR_HAKUBA_STATION, HAPPO_AREA], "costing": "auto"},
        timeout=10,
    )

    assert response.status_code == 200
    seconds = response.json()["trip"]["summary"]["time"]
    assert 2 * 60 <= seconds <= 15 * 60
