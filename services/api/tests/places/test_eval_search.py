"""Pins search quality on pasted booking-site hotel names (SPEC-place-search v1.3).

Thresholds only ever go up: raise them when a change improves the eval.
"""

from hakuba_api.places.eval_search import evaluate, summary

MIN_HITS = 25  # T49 Overture + T50 kana readings: all present hotels (T48 15, baseline 10)


def test_booking_names_quality() -> None:
    counts = summary(evaluate())
    assert counts.get("wrong", 0) == 0, counts
    assert counts.get("hit", 0) >= MIN_HITS, counts
