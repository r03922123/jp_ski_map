"""Locate bus stops from researched evidence and verify them against the timetables.

Usage: `python -m hakuba_api.bus.locate_stops [--write]`

Evidence (data/bus/stop_evidence.json) is gathered by hand, like transcription: an address
from a booking/official page (geocoded via GSI, only when GSI matches the lot number) or an
OSM point. Every candidate must then survive the timetables: a car (Valhalla) must not need
much longer than the bus between neighbouring timed stops, and neighbouring untimed pickup
stops must be close. Coordinates that fail stay unresolved instead of being guessed.
"""

import json
import math
import re
import sys
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from hakuba_api.bus.models import BusStop, Timetable
from hakuba_api.bus.validate import BUS_BBOX
from hakuba_api.common.geo import Coord
from hakuba_api.common.upstream import USER_AGENT

GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch"

SLACK_FACTOR = 1.5  # bus gap × 1.5 + 3 min covers traffic-free car vs bus differences
SLACK_S = 180
MAX_UNTIMED_KM = 8.0
CORROBORATE_KM = 1.0  # a geocoded point must sit near a trusted stop on one of its routes


@dataclass(frozen=True)
class RouteLeg:
    a: str
    b: str
    scheduled_s: int | None  # None when either end has no published time


def _lot_number(address: str) -> str | None:
    m = re.search(r"(\d+)(?:-\d+)*\s*$", unicodedata.normalize("NFKC", address))
    return m.group(1) if m else None


def geocode_gsi(address: str) -> Coord | None:
    """GSI address search; None unless the match is at lot (番地) level."""
    response = httpx.get(
        GSI_URL, params={"q": address}, headers={"User-Agent": USER_AGENT}, timeout=20
    )
    response.raise_for_status()
    lot = _lot_number(address)
    for f in response.json():
        title = unicodedata.normalize("NFKC", f["properties"]["title"])
        if lot and re.search(rf"(?<!\d){lot}(?!\d)", title):
            lng, lat = f["geometry"]["coordinates"]
            return Coord(lat=lat, lng=lng)
    return None


def _parent_lot(address: str) -> str:
    """'…北城2937-730' -> '北城2937' (district + main lot number)."""
    m = re.search(r"([^\d\s]+?)(\d+)(?:-\d+)*\s*$", unicodedata.normalize("NFKC", address))
    return f"{m.group(1)[-2:]}{m.group(2)}" if m else address


def ambiguous_points(found: dict[str, tuple[Coord, str]]) -> set[str]:
    """GSI sometimes returns one representative point for many different lots; those
    points say nothing about where a building is. Sub-lots of one parent lot sharing a
    point is expected (lot-level precision) and is not counted."""
    lots_at: dict[tuple[float, float], set[str]] = {}
    for coord, address in found.values():
        key = (round(coord.lat, 5), round(coord.lng, 5))
        lots_at.setdefault(key, set()).add(_parent_lot(address))
    return {
        stop
        for stop, (coord, _) in found.items()
        if len(lots_at[(round(coord.lat, 5), round(coord.lng, 5))]) > 1
    }


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def legs_from_timetables(tables: list[Timetable], alias: dict[str, str]) -> set[RouteLeg]:
    legs: set[RouteLeg] = set()
    for t in tables:
        for d in t.directions:
            ids = [alias[s] for s in d.stops]
            for trip in d.trips[:1]:  # every trip of a direction shares the stop sequence
                for i in range(len(ids) - 1):
                    ta, tb = trip.times[i], trip.times[i + 1]
                    gap = (_minutes(tb) - _minutes(ta)) * 60 if ta and tb else None
                    if ids[i] != ids[i + 1]:
                        legs.add(RouteLeg(ids[i], ids[i + 1], gap))
    return legs


def _km(a: Coord, b: Coord) -> float:
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng) * math.cos(math.radians((a.lat + b.lat) / 2))
    return 6371 * math.hypot(dlat, dlng)


def find_violations(
    legs: set[RouteLeg] | list[RouteLeg],
    coords: dict[str, Coord],
    new: set[str],
    drive_s: Callable[[Coord, Coord], float],
    serves_resort: set[str],
) -> dict[str, str]:
    """Stop id -> reason, blaming only newly located stops (anchors are trusted)."""
    violations: dict[str, str] = {}
    for leg in legs:
        if leg.a not in coords or leg.b not in coords or not ({leg.a, leg.b} & new):
            continue
        a, b = coords[leg.a], coords[leg.b]
        if leg.scheduled_s is not None:
            seconds = drive_s(a, b)
            if seconds > leg.scheduled_s * SLACK_FACTOR + SLACK_S:
                reason = (
                    f"car needs {round(seconds / 60)} min to {leg.a if leg.b in new else leg.b}"
                    f" but the bus is scheduled {round(leg.scheduled_s / 60)} min"
                )
            else:
                continue
        else:
            if {leg.a, leg.b} & serves_resort:
                continue  # the last pickup -> resort leg may be long
            km = _km(a, b)
            if km <= MAX_UNTIMED_KM:
                continue
            reason = f"{km:.1f} km from its neighbour on an untimed pickup route"
        for stop in (leg.a, leg.b):
            if stop in new:
                violations[stop] = reason
    return violations


def uncorroborated(
    candidates: dict[str, Coord], trusted: dict[str, Coord], routes: list[list[str]]
) -> set[str]:
    """Geocoded stops with no trusted stop within CORROBORATE_KM on any shared route."""
    lonely: set[str] = set()
    for stop, coord in candidates.items():
        mates = {m for r in routes if stop in r for m in r if m in trusted}
        if not any(_km(coord, trusted[m]) <= CORROBORATE_KM for m in mates):
            lonely.add(stop)
    return lonely


def _in_bus_area(c: Coord) -> bool:
    b = BUS_BBOX
    return b["south"] <= c.lat <= b["north"] and b["west"] <= c.lng <= b["east"]


def main(write: bool) -> int:
    from hakuba_api.bus.store import load_stops, load_timetables
    from hakuba_api.data.paths import data_dir
    from hakuba_api.routing.client import NoRouteError
    from hakuba_api.routing.router import get_valhalla

    stops = load_stops()
    evidence = json.loads((data_dir() / "bus" / "stop_evidence.json").read_text())["stops"]
    coords = {s.id: s.coord for s in stops if s.coord}
    candidates: dict[str, tuple[Coord, str]] = {}
    rejected: dict[str, str] = {}
    geocoded: dict[str, tuple[Coord, str]] = {}

    for stop_id, ev in evidence.items():
        if stop_id in coords:
            continue
        if "osm" in ev:
            c = Coord(lat=ev["osm"]["lat"], lng=ev["osm"]["lng"])
            how = ev["osm"]["ref"]
        else:
            found = geocode_gsi(ev["address"])
            if found is None:
                rejected[stop_id] = f"GSI has no lot-level match for {ev['address']}"
                continue
            c, how = found, f"gsi:{ev['address']} (lot-level, approximate)"
            geocoded[stop_id] = (found, ev["address"])
        if not _in_bus_area(c):
            rejected[stop_id] = "outside the bus area"
            continue
        approx = " (approximate)" if ev.get("approx") else ""
        candidates[stop_id] = (c, f"{how}{approx} — {ev['source']}")

    for stop_id in ambiguous_points(geocoded):
        candidates.pop(stop_id, None)
        rejected[stop_id] = "GSI returned the same point for different lots (ambiguous)"

    alias = {a: s.id for s in stops for a in s.aliases}
    routes = [[alias[n] for n in d.stops] for t in load_timetables() for d in t.directions]
    gsi_left = {k: candidates[k][0] for k in geocoded if k in candidates}
    trusted = {**coords, **{k: v[0] for k, v in candidates.items() if k not in geocoded}}
    for stop_id in uncorroborated(gsi_left, trusted, routes):
        candidates.pop(stop_id)
        rejected[stop_id] = (
            f"GSI point has no trusted stop within {CORROBORATE_KM} km on its routes"
        )

    valhalla = get_valhalla()

    def drive_s(a: Coord, b: Coord) -> float:
        try:
            return valhalla.route("drive", a, b).duration_s
        except NoRouteError:
            return math.inf

    legs = legs_from_timetables(load_timetables(), alias)
    serves = {s.id for s in stops if s.serves_resort_id}
    all_coords = {**coords, **{k: v[0] for k, v in candidates.items()}}
    violations = find_violations(legs, all_coords, set(candidates), drive_s, serves)
    rejected.update(violations)
    accepted = {k: v for k, v in candidates.items() if k not in violations}

    for stop_id, (c, how) in sorted(accepted.items()):
        print(f"ACCEPT  {stop_id:38} {c.lat:.5f},{c.lng:.5f}  {how[:70]}")
    for stop_id, why in sorted(rejected.items()):
        print(f"REJECT  {stop_id:38} {why}")
    unresolved = [s.id for s in stops if s.coord is None and s.id not in accepted]
    print(f"{len(accepted)} accepted, {len(rejected)} rejected, {len(unresolved)} still unresolved")

    if write:
        updated: list[BusStop] = []
        for s in stops:
            if s.id in accepted:
                c, how = accepted[s.id]
                s = s.model_copy(update={"coord": c, "coord_source": how})
            elif s.id in rejected:
                s = s.model_copy(update={"coord_source": f"unresolved: {rejected[s.id]}"})
            updated.append(s)
        rows = [s.model_dump(by_alias=True) for s in updated]
        text = json.dumps(rows, ensure_ascii=False, indent=1) + "\n"
        (data_dir() / "bus_stops.json").write_text(text)
        print("wrote data/bus_stops.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(write="--write" in sys.argv[1:]))
