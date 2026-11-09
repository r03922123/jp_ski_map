"""Pins search quality on pasted booking-site hotel names (SPEC-place-search v1.3).

Thresholds only ever go up: raise them when a change improves the eval.
"""

from hakuba_api.common.geo import Coord
from hakuba_api.places.eval_search import evaluate, judge, summary
from hakuba_api.places.suggest import Suggestion

MIN_HITS = 26  # T49 Overture + T50 kana readings: all present hotels (T48 15, baseline 10)


def test_booking_names_quality() -> None:
    counts = summary(evaluate())
    assert counts.get("wrong", 0) == 0, counts
    assert counts.get("hit", 0) >= MIN_HITS, counts


def test_any_result_for_an_absent_place_is_wrong() -> None:
    stop = Suggestion(
        id="stop",
        kind="stop",
        name="Some Parking",
        name_ja=None,
        coord=Coord(lat=36.7, lng=137.85),
        detail="Bus stop",
        match=None,
        source="index",
    )
    assert judge({"absent": True}, stop, 150) == "wrong"
    assert judge({"absent": True}, None, 150) == "ok-absent"
