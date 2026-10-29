"""Valhalla maneuver types → a small, stable icon vocabulary, and the "via …" route summary."""

from typing import Literal

Maneuver = Literal[
    "depart", "arrive", "straight", "slight-left", "left", "sharp-left", "slight-right", "right",
    "sharp-right", "uturn", "roundabout", "merge", "ramp-left", "ramp-right", "keep-left",
    "keep-right", "ferry",
]  # fmt: skip

# https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#maneuver-types
_BY_TYPE: dict[int, Maneuver] = {
    1: "depart", 2: "depart", 3: "depart",
    4: "arrive", 5: "arrive", 6: "arrive",
    9: "slight-right", 10: "right", 11: "sharp-right",
    12: "uturn", 13: "uturn",
    14: "sharp-left", 15: "left", 16: "slight-left",
    18: "ramp-right", 19: "ramp-left", 20: "ramp-right", 21: "ramp-left",
    23: "keep-right", 24: "keep-left",
    25: "merge", 37: "merge", 38: "merge",
    26: "roundabout", 27: "roundabout",
    28: "ferry", 29: "ferry",
}  # fmt: skip


def maneuver_for(valhalla_type: int) -> Maneuver:
    return _BY_TYPE.get(valhalla_type, "straight")


def _road_label(street_names: list[str]) -> str | None:
    """A road's name, else its route number ("433" → "Route 433")."""
    named = [n for n in street_names if not n.isdigit()]
    if named:
        return named[0]
    return f"Route {street_names[0]}" if street_names else None


def route_summary(legs: list[tuple[list[str], float]]) -> str | None:
    """'via A and B': the one or two roads the route spends the longest distance on."""
    totals: dict[str, float] = {}
    for street_names, length in legs:
        label = _road_label(street_names)
        if label:
            totals[label] = totals.get(label, 0.0) + length
    top = sorted(totals, key=lambda k: -totals[k])[:2]
    return f"via {' and '.join(top)}" if top else None
