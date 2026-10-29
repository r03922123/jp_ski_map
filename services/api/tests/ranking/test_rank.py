from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from hakuba_api.catalog.models import Resort
from hakuba_api.catalog.store import get_resort
from hakuba_api.common.geo import Coord
from hakuba_api.crowd.models import CrowdEstimate
from hakuba_api.main import app
from hakuba_api.ranking.rank import Filters, RankInput, rank
from hakuba_api.ranking.router import get_crowd_for, get_snow_reports
from hakuba_api.routing.models import MatrixCell, Mode
from hakuba_api.routing.router import get_valhalla
from hakuba_api.snow.models import NewSnow, SnowDepth, SnowReport, SummitTemps

JST = ZoneInfo("Asia/Tokyo")


def resort(resort_id: str, **stats: Any) -> Resort:
    base = get_resort("happo-one")
    assert base is not None
    data = base.model_dump(by_alias=True)
    data["id"] = resort_id
    data["stats"].update(stats)
    return Resort.model_validate(data)


def snow(past24h: float | None, next24h: float | None, summit: int | None) -> SnowReport:
    return SnowReport(
        resort_id="x",
        as_of=datetime(2026, 1, 12, 7, tzinfo=JST),
        depth_cm=SnowDepth(base=50, summit=summit, source="model"),
        new_snow_cm=NewSnow(past24h=past24h, past72h=None, next24h=next24h, next72h=None),
        temp_c=SummitTemps(summit_min=None, summit_max=None),
    )


def crowd(score: float) -> CrowdEstimate:
    return CrowdEstimate(
        resort_id="x",
        date=date(2026, 1, 12),
        level="low",
        score=score,
        source="heuristic",
        reasons=[],
    )


def inputs() -> list[RankInput]:
    return [
        RankInput(
            resort=resort("a", runs=10, chairLifts=5, gondolas=0, verticalM=500, dayTicketJpy=6000),
            drive=MatrixCell(id="a-base", duration_s=600, distance_m=5000),
            snow=snow(past24h=10, next24h=10, summit=200),
            crowd=crowd(0.7),
        ),
        RankInput(
            resort=resort(
                "b", runs=20, chairLifts=10, gondolas=1, verticalM=900, dayTicketJpy=None
            ),
            drive=MatrixCell(id="b-base", duration_s=1200, distance_m=12000),
            snow=snow(past24h=30, next24h=0, summit=300),
            crowd=crowd(0.2),
        ),
        RankInput(
            resort=resort("c", runs=15, chairLifts=8, gondolas=0, verticalM=700, dayTicketJpy=5000),
            drive=MatrixCell(id="c-base", duration_s=300, distance_m=2000),
            snow=snow(past24h=None, next24h=5, summit=None),
            crowd=crowd(0.4),
        ),
    ]


@pytest.mark.parametrize(
    ("sort", "expected"),
    [
        ("drive_time", ["c", "a", "b"]),  # lower is better
        ("fresh_snow", ["b", "a", "c"]),  # b: 30, a: 10 + 5 = 15, c: unknown -> last
        ("snow_depth", ["b", "a", "c"]),  # c unknown -> last
        ("crowd", ["b", "c", "a"]),  # lower is better
        ("terrain_size", ["b", "c", "a"]),
        ("vertical", ["b", "c", "a"]),
        ("price", ["c", "a", "b"]),  # b unknown -> last
    ],
)
def test_each_sort_key_orders_resorts(sort: str, expected: list[str]) -> None:
    ranked = rank(inputs(), sort, Filters())  # type: ignore[arg-type]

    assert [r.resort_id for r in ranked] == expected
    assert [r.rank for r in ranked] == [1, 2, 3]


def test_sort_value_and_factors_carry_raw_values() -> None:
    ranked = rank(inputs(), "fresh_snow", Filters())

    assert ranked[1].sort_value == 15
    assert ranked[1].factors.drive_time == 600
    assert ranked[2].sort_value is None
    assert ranked[2].factors.price == 5000


def test_ties_break_by_drive_time_then_id() -> None:
    data = inputs()
    for item in data:
        item.resort.stats.vertical_m = 800

    ranked = rank(data, "vertical", Filters())

    assert [r.resort_id for r in ranked] == ["c", "a", "b"]


def test_terrain_size_ties_break_by_lift_count() -> None:
    data = inputs()
    data[0].resort.stats.runs = 20  # same runs as b, fewer lifts

    ranked = rank(data, "terrain_size", Filters())

    assert [r.resort_id for r in ranked][:2] == ["b", "a"]


def test_unreachable_resort_sorts_last_on_drive_time() -> None:
    data = inputs()
    data[2].drive = MatrixCell(id="c-base", duration_s=None, distance_m=None)

    ranked = rank(data, "drive_time", Filters())

    assert [r.resort_id for r in ranked] == ["a", "b", "c"]


def test_max_drive_filter_drops_far_and_unreachable_resorts() -> None:
    ranked = rank(inputs(), "drive_time", Filters(max_drive_min=15))

    assert [r.resort_id for r in ranked] == ["c", "a"]


def test_night_skiing_filter_keeps_only_confirmed_resorts() -> None:
    data = inputs()
    data[0].resort.stats.night_skiing = True
    data[1].resort.stats.night_skiing = False  # c stays unknown

    ranked = rank(data, "drive_time", Filters(night_skiing=True))

    assert [r.resort_id for r in ranked] == ["a"]


def test_valley_pass_filter() -> None:
    data = inputs()
    data[1].resort.hakuba_valley_pass = False

    ranked = rank(data, "drive_time", Filters(hakuba_valley_pass=True))

    assert [r.resort_id for r in ranked] == ["c", "a"]


def test_missing_snow_and_crowd_are_null_factors() -> None:
    data = inputs()
    data[0].snow = None
    data[0].crowd = None

    ranked = rank(data, "crowd", Filters())

    a = next(r for r in ranked if r.resort_id == "a")
    assert (a.factors.fresh_snow, a.factors.snow_depth, a.factors.crowd) == (None, None, None)
    assert ranked[-1].resort_id == "a"


# --- endpoint -----------------------------------------------------------------


class FakeValhalla:
    def matrix(
        self, mode: Mode, origin: Coord, targets: list[tuple[str, Coord]]
    ) -> list[MatrixCell]:
        # pretend every access point is (index + 1) minutes away
        return [
            MatrixCell(id=t[0], duration_s=60 * (i + 1), distance_m=1000)
            for i, t in enumerate(targets)
        ]


def no_crowd(_day: date) -> dict[str, CrowdEstimate]:
    return {}


@pytest.fixture
def api() -> Any:
    app.dependency_overrides[get_valhalla] = FakeValhalla
    app.dependency_overrides[get_snow_reports] = lambda: {}
    app.dependency_overrides[get_crowd_for] = lambda: no_crowd
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_rank_endpoint_returns_all_resorts_by_drive_time(api: TestClient) -> None:
    response = api.get("/api/rank", params={"from": "36.6987,137.8617", "sort": "drive_time"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 10
    assert body[0]["resortId"] == "jigatake"  # first access point in the fake matrix
    assert body[0]["accessPointId"] == "jigatake-base"
    assert body[0]["driveS"] == 60


def test_rank_endpoint_uses_nearest_access_point(api: TestClient) -> None:
    body = api.get("/api/rank", params={"from": "36.7,137.86"}).json()

    goryu = next(r for r in body if r["resortId"] == "goryu")
    assert goryu["accessPointId"] == "goryu-escal-plaza"  # listed before Iimori -> shorter


def test_rank_endpoint_rejects_unknown_sort(api: TestClient) -> None:
    response = api.get("/api/rank", params={"from": "36.7,137.86", "sort": "best"})

    assert response.status_code == 422


@pytest.mark.live
def test_live_rank_returns_all_resorts_quickly() -> None:
    import time

    live = TestClient(app)
    live.get("/api/rank", params={"from": "36.6987,137.8617"})  # warm the hourly snow cache

    started = time.perf_counter()
    response = live.get("/api/rank", params={"from": "36.6987,137.8617"})

    assert response.status_code == 200
    assert len(response.json()) == 10
    assert time.perf_counter() - started < 1.0
