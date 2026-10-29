"""Import stop pins from Hakuba Valley's own per-line Google My Maps layers.

Usage: `python -m hakuba_api.bus.import_mymaps [--write]`

The official Shuttle Bus Map PDF prints a QR code per line ("check the location of each
bus stop"), each pointing at a My Maps layer authored by the operator. Their KML exports
(saved under data/bus/raw/<season>/mymaps/, listed in data/bus/mymaps_sources.json) are
matched to our stops by English and Japanese name. The import refuses to run if the
layers disagree with the stops we already verified, and only fills stops that are still
unresolved; `locate_stops` then runs the usual route checks on them.
"""

import html
import json
import re
import statistics
import sys
import unicodedata
from dataclasses import dataclass

from hakuba_api.bus.locate_stops import _km  # pyright: ignore[reportPrivateUsage]
from hakuba_api.bus.models import BusStop
from hakuba_api.common.geo import Coord

MAX_MEDIAN_DISAGREEMENT_M = 100  # layers must match already-verified stops this well
MAX_SPREAD_M = 300  # pins of one stop across layers (e.g. both sides of a road)


# Hand-checked spellings the name matcher can't connect (prefix of the placemark name).
MANUAL_MATCHES = {
    "Courtyard by Mariott Hakuba": "stop-courtyard-by-marriott-hakuba",
    "Gakusui / 岳水": "stop-the-gakusui",
    "Happo-One (Kokusai Slope": "stop-happo-kokusai",
    "Happo-One(Kokusai Slope": "stop-happo-kokusai",
    "Happo-One( Sakka Slope": "stop-happo-sakka",
    "Happo-One(Sakka Slope": "stop-happo-sakka",
    "Happo-One(Nakiyama Slope": "stop-happo-nakiyama",
    "Echoland (In front of Spicy)": "stop-echoland-spicy",
    "SPICY エコーランド店前": "stop-echoland-spicy",
    "Wadano(Hakuab Mominoki Hotel)": "stop-mominoki",
    "白馬駅": "stop-jr-hakuba",
    "スノーピーク": "stop-snow-peak-land-station-hakuba",
}


@dataclass(frozen=True)
class Placemark:
    name: str
    coord: Coord
    layer: str


def parse_kml(text: str, layer: str) -> list[Placemark]:
    marks: list[Placemark] = []
    for body in re.findall(r"<Placemark>(.*?)</Placemark>", text, re.S):
        point = re.search(r"<Point>\s*<coordinates>\s*([^<]+?)\s*</coordinates>", body)
        name = re.search(r"<name>(.*?)</name>", body, re.S)
        if not point or not name:
            continue  # route lines, polygons
        raw = re.sub(r"^<!\[CDATA\[(.*)\]\]>$", r"\1", name.group(1).strip(), flags=re.S)
        lng, lat = (float(x) for x in point.group(1).split(",")[:2])
        marks.append(Placemark(html.unescape(raw).strip(), Coord(lat=lat, lng=lng), layer))
    return marks


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"[\s\W_]+", "", text)


def _split(name: str) -> tuple[str, str]:
    name = re.split(r"\s+-\s+heading", name, flags=re.I)[0]  # "Satomi / 里見 - Heading South/…"
    en, _, ja = name.partition("/")
    return _norm(en), _norm(ja)


def match_stop(mark: Placemark, stops: list[BusStop]) -> str | None:
    """Manual table, exact EN/JA name, else the longest stop name contained in the placemark."""
    for prefix, stop_id in MANUAL_MATCHES.items():
        if mark.name.startswith(prefix):
            return stop_id
    en, ja = _split(mark.name)
    best: tuple[int, str] | None = None
    for s in stops:
        names_en = {_norm(a) for a in [*s.aliases, s.name.en]}
        name_ja = _norm(s.name.ja or "")
        if en in names_en or (ja and ja == name_ja):
            return s.id
        candidates = set(names_en)
        if len(name_ja) >= 3:
            candidates.add(name_ja)
        for candidate in candidates:
            contained = candidate in en or bool(ja and candidate in ja)
            if len(candidate) >= 6 and contained and (best is None or len(candidate) > best[0]):
                best = (len(candidate), s.id)
    return best[1] if best else None


def merge_points(points: list[Coord]) -> tuple[Coord, float]:
    """Median pin and the largest distance from it, in metres."""
    merged = Coord(
        lat=statistics.median(p.lat for p in points), lng=statistics.median(p.lng for p in points)
    )
    return merged, max(_km(merged, p) for p in points) * 1000


def agreement_m(imported: dict[str, Coord], verified: dict[str, Coord]) -> dict[str, float]:
    return {k: _km(c, verified[k]) * 1000 for k, c in imported.items() if k in verified}


def main(write: bool) -> int:
    from hakuba_api.bus.store import load_stops
    from hakuba_api.data.paths import data_dir

    sources = json.loads((data_dir() / "bus" / "mymaps_sources.json").read_text())
    folder = data_dir() / "bus" / "raw" / sources["season"] / "mymaps"
    stops = load_stops()

    marks: list[Placemark] = []
    for layer in sources["layers"]:
        marks += parse_kml((folder / f"{layer['mid']}.kml").read_text(), layer["mid"])

    by_stop: dict[str, list[Placemark]] = {}
    unmatched: list[str] = []
    for m in marks:
        stop_id = match_stop(m, stops)
        if stop_id:
            by_stop.setdefault(stop_id, []).append(m)
        else:
            unmatched.append(m.name)

    merged: dict[str, tuple[Coord, float]] = {
        k: merge_points([m.coord for m in v]) for k, v in by_stop.items()
    }
    verified = {s.id: s.coord for s in stops if s.coord}
    agree = agreement_m({k: v[0] for k, v in merged.items()}, verified)
    median_m = statistics.median(agree.values()) if agree else float("inf")
    print(f"{len(marks)} placemarks, {len(by_stop)} stops matched, {len(unmatched)} unmatched")
    print(f"agreement with {len(agree)} verified stops: median {median_m:.0f} m")
    for k, d in sorted(agree.items(), key=lambda kv: -kv[1])[:5]:
        print(f"   {k:38} {d:6.0f} m")
    if median_m > MAX_MEDIAN_DISAGREEMENT_M:
        print("layers disagree with verified stops; refusing to import")
        return 1

    evidence_path = data_dir() / "bus" / "stop_evidence.json"
    evidence = json.loads(evidence_path.read_text())
    viewer = {layer["mid"]: layer["url"] for layer in sources["layers"]}
    added = 0
    for stop_id, (coord, spread) in sorted(merged.items()):
        if stop_id in verified:
            continue
        if spread > MAX_SPREAD_M:
            print(f"SKIP    {stop_id:38} pins spread {spread:.0f} m across layers")
            continue
        layers = sorted({m.layer for m in by_stop[stop_id]})
        print(
            f"IMPORT  {stop_id:38} {coord.lat:.6f},{coord.lng:.6f}  ({len(by_stop[stop_id])} pins)"
        )
        evidence["stops"][stop_id] = {
            "osm": {
                "lat": round(coord.lat, 7),
                "lng": round(coord.lng, 7),
                "ref": f"operator My Maps pin ({by_stop[stop_id][0].name})",
            },
            "source": viewer[layers[0]],
        }
        added += 1
    for name in sorted(set(unmatched)):
        print(f"UNMATCHED  {name}")
    if write:
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=1) + "\n")
        print(f"wrote {added} stops to data/bus/stop_evidence.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(write="--write" in sys.argv[1:]))
