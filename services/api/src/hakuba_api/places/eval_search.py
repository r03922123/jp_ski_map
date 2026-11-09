"""Score search against hotel names pasted from booking sites (SPEC-place-search v1.3).

Usage: `python -m hakuba_api.places.eval_search [--photon]` (default: local index only,
no network; `--photon` adds the live Photon fallback, as the API does).
"""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from hakuba_api.common.geo import Coord
from hakuba_api.places.index import Entry
from hakuba_api.places.suggest import Suggestion, suggest

EVAL_FILE = Path(__file__).parents[3] / "tests" / "places" / "booking_eval.json"
NEAR = Coord(lat=36.70, lng=137.86)


@dataclass(frozen=True)
class CaseResult:
    query: str
    verdict: str  # "hit" | "miss" | "wrong" | "ok-absent" | "skip"
    top: Suggestion | None


def _m(a: Coord, b: tuple[float, float]) -> float:
    from hakuba_api.places.index import _km  # pyright: ignore[reportPrivateUsage]

    return _km(a, Coord(lat=b[0], lng=b[1])) * 1000


def judge(case: dict[str, object], top: Suggestion | None, tolerance_m: float) -> str:
    if case.get("skip"):
        return "skip"
    if case.get("absent"):
        return "wrong" if top is not None else "ok-absent"  # any other place is a wrong answer
    expect = case["expect"]
    assert isinstance(expect, list)
    if top is None:
        return "miss"
    near = any(_m(top.coord, (p[0], p[1])) <= tolerance_m for p in expect)  # type: ignore[index]
    if near:
        return "hit"
    # a different place: confidently wrong when it is another lodging
    return "wrong" if top.kind == "lodging" else "miss"


def evaluate(entries: list[Entry] | None = None, photon: bool = False) -> list[CaseResult]:
    data = json.loads(EVAL_FILE.read_text())
    out: list[CaseResult] = []
    for case in data["cases"]:
        hits = suggest(case["q"], NEAR, 5, entries=entries, use_photon=photon)
        top = hits[0] if hits else None
        out.append(CaseResult(case["q"], judge(case, top, data["toleranceM"]), top))
    return out


def summary(results: list[CaseResult]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in results:
        counts[r.verdict] = counts.get(r.verdict, 0) + 1
    return counts


def main() -> int:
    results = evaluate(photon="--photon" in sys.argv[1:])
    for r in results:
        top = f"{r.top.name} ({r.top.kind})" if r.top else "-"
        print(f"{r.verdict:9} {r.query[:48]:48} → {top}")
    s = summary(results)
    present = s.get("hit", 0) + s.get("miss", 0) + s.get("wrong", 0)
    print(f"\n{s}  recall@1 {s.get('hit', 0)}/{present}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
