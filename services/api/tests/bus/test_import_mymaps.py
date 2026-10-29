from pathlib import Path

from hakuba_api.bus.import_mymaps import (
    Placemark,
    agreement_m,
    match_stop,
    merge_points,
    parse_kml,
)
from hakuba_api.bus.models import BusStop
from hakuba_api.common.geo import Coord

SAMPLE = Path(__file__).parents[1] / "fixtures" / "mymaps" / "sample.kml"


def stop(stop_id: str, en: str, ja: str | None, aliases: list[str]) -> BusStop:
    return BusStop.model_validate(
        {
            "id": stop_id,
            "name": {"en": en, "ja": ja},
            "coord": None,
            "servesResortId": None,
            "aliases": aliases,
            "coordSource": "unresolved",
        }
    )


STOPS = [
    stop(
        "stop-happo-bus-terminal",
        "Hakuba Happo Bus Terminal",
        "白馬八方バスターミナル",
        ["Hakuba Happo Bus Terminal"],
    ),
    stop("stop-satomi", "Satomi", "里見", ["Satomi"]),
    stop("stop-kanemaru", "Kanemaru", "かねまる", ["Kanemaru"]),
    stop("stop-happo-gondola", "Happo Gondola Lift", "八方ゴンドラリフト", ["Happo Gondola Lift"]),
]


def test_parses_point_placemarks_only() -> None:
    marks = parse_kml(SAMPLE.read_text(), layer="mid-x")

    assert [m.name for m in marks][:2] == [
        "Hakuba Happo Bus Terminal / 白馬八方バスターミナル",
        "Satomi / 里見 - Heading South/南方面行き",
    ]
    assert len(marks) == 4  # the LineString is skipped
    assert marks[0].coord == Coord(lat=36.7014088, lng=137.8457531)
    assert marks[2].name.startswith('Happo-One(Happo Gondola Lift "Adam")')


def test_matches_by_english_name() -> None:
    mark = Placemark("Hakuba Happo Bus Terminal / 白馬八方バスターミナル", Coord(lat=0, lng=0), "x")

    assert match_stop(mark, STOPS) == "stop-happo-bus-terminal"


def test_ignores_direction_suffix() -> None:
    mark = Placemark("Satomi / 里見 - Heading South/南方面行き", Coord(lat=0, lng=0), "x")

    assert match_stop(mark, STOPS) == "stop-satomi"


def test_matches_by_japanese_name_when_english_differs() -> None:
    mark = Placemark(
        'Happo-One(Happo Gondola Lift "Adam") / 八方ゴンドラリフト', Coord(lat=0, lng=0), "x"
    )

    assert match_stop(mark, STOPS) == "stop-happo-gondola"


def test_unknown_placemark_matches_nothing() -> None:
    mark = Placemark("Somewhere Else / どこか", Coord(lat=0, lng=0), "x")

    assert match_stop(mark, STOPS) is None


def test_merge_takes_the_median_and_reports_spread() -> None:
    points = [
        Coord(lat=36.7000, lng=137.8400),
        Coord(lat=36.7002, lng=137.8401),
        Coord(lat=36.7100, lng=137.8400),
    ]

    merged, spread_m = merge_points(points)

    assert merged == Coord(lat=36.7002, lng=137.8400)
    assert 1000 < spread_m < 1200


def test_agreement_with_verified_stops() -> None:
    verified = {"stop-a": Coord(lat=36.70153, lng=137.84561)}
    imported = {
        "stop-a": Coord(lat=36.7014088, lng=137.8457531),
        "stop-b": Coord(lat=36.0, lng=137.0),
    }

    distances = agreement_m(imported, verified)

    assert list(distances) == ["stop-a"]
    assert distances["stop-a"] < 25


def test_manual_table_connects_known_misspellings() -> None:
    mark = Placemark("Gakusui / 岳水", Coord(lat=0, lng=0), "x")

    assert match_stop(mark, STOPS) == "stop-the-gakusui"
