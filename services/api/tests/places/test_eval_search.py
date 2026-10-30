"""Pins search quality on pasted booking-site hotel names (SPEC-place-search v1.3).

Thresholds only ever go up: raise them when a change improves the eval.
"""

from hakuba_api.places.eval_search import evaluate, summary

MIN_HITS = 15  # T48 weighted words + Photon gate (T47: 14, baseline 10 of 25)


def test_booking_names_quality() -> None:
    counts = summary(evaluate())
    assert counts.get("wrong", 0) == 0, counts
    assert counts.get("hit", 0) >= MIN_HITS, counts
