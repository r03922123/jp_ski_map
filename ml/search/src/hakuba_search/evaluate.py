"""Compare lexical, semantic and hybrid search on the hard set and the booking regression set.

Run: `uv run python -m hakuba_search.evaluate [--model models/e5-hakuba] --min-score <calibrated>`
Every run is logged to the local MLflow store (`mlflow ui --backend-store-uri sqlite:///mlflow.db`).
"""

import argparse
import json
import math
import statistics
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, Protocol

from hakuba_api.common.geo import Coord
from hakuba_api.places import eval_search, semantic
from hakuba_api.places.index import Entry
from hakuba_api.places.suggest import load_index, suggest

from hakuba_search.embed import BASE_MODEL, Embedder

HARD = Path(__file__).parents[2] / "evals" / "hard_queries.json"
NEAR = Coord(lat=36.70, lng=137.86)
K = 5


class Place(Protocol):
    id: str
    kind: str
    name: str
    name_ja: str | None
    detail: str | None


def matches(case: dict[str, Any], p: Place) -> bool:
    """Does one result satisfy a hard-set case (see the `about` text in the JSON)?"""
    if "id_prefix" in case:
        return any(p.id.startswith(x) for x in case["id_prefix"])
    if "detail_any" in case:
        return any(x in (p.detail or "") for x in case["detail_any"])
    if "kind" in case:
        return p.kind == case["kind"]
    names = p.name + " " + (p.name_ja or "")
    return any(x in names for x in case["name_any"])


def hit_at(case: dict[str, Any], results: list[Place], k: int) -> bool:
    return any(matches(case, p) for p in results[:k])


def mean_se(xs: Sequence[float]) -> tuple[float, float]:
    """Mean and its standard error (sample sd / sqrt(n)); the error is 0 for a single item."""
    n = len(xs)
    return statistics.fmean(xs), statistics.stdev(xs) / math.sqrt(n) if n > 1 else 0.0


def paired_diff(base: Sequence[bool], new: Sequence[bool]) -> tuple[float, float]:
    """Mean of `new - base` per query and its standard error. Both modes ran the same
    queries, so a query's own difficulty cancels and the error is smaller than comparing
    two separate hit rates."""
    return mean_se([int(b) - int(a) for a, b in zip(base, new, strict=True)])


def searcher(mode: str, emb: Embedder | None, min_score: float) -> Callable[[str], list[Place]]:
    index: dict[str, Entry] = {e.id: e for e in load_index()}

    def by_meaning(q: str, k: int) -> list[str]:
        assert emb is not None
        return [h.id for h in emb.search(q, k, min_score)]

    if mode == "semantic":
        return lambda q: [index[i] for i in by_meaning(q, K)]
    semantic.semantic_ids = by_meaning if mode == "hybrid" else (lambda q, k: [])
    return lambda q: list(suggest(q, NEAR, K, use_photon=False))


def run(mode: str, emb: Embedder | None, min_score: float) -> dict[str, Any]:
    search = searcher(mode, emb, min_score)
    cases = json.loads(HARD.read_text())["cases"]
    rows, ms = [], []
    for case in cases:
        start = time.perf_counter()
        results = search(case["q"])
        ms.append((time.perf_counter() - start) * 1000)
        rows.append((case, hit_at(case, results, 1), hit_at(case, results, K), results[:1]))
    hit5, hit5_se = mean_se([r[2] for r in rows])
    out: dict[str, Any] = {
        "n": len(rows),
        "hit1": sum(r[1] for r in rows) / len(rows),
        "hit5": hit5,
        "hit5_se": hit5_se,
        "hits5": [r[2] for r in rows],  # per query, for the paired comparison
        "p50_ms": statistics.median(ms),
        "p95_ms": statistics.quantiles(ms, n=20)[-1],
    }
    for group in sorted({c["group"] for c in cases}):
        sub = [r for r in rows if r[0]["group"] == group]
        out[f"hit5_{group}"] = sum(r[2] for r in sub) / len(sub)
    if mode != "semantic":  # the regression set goes through suggest(), as the API does
        verdicts = eval_search.summary(eval_search.evaluate())
        out["booking_hit"] = verdicts.get("hit", 0)
        out["booking_ok_absent"] = verdicts.get("ok-absent", 0)
        out["booking_wrong"] = verdicts.get("wrong", 0)
    out["misses"] = [r[0]["q"] for r in rows if not r[2]]
    return out


def main() -> None:
    import mlflow

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=BASE_MODEL)
    # each model's own value from hakuba_search.calibrate: a shared one silently filters all
    parser.add_argument("--min-score", type=float, required=True)
    parser.add_argument("--modes", default="lexical,semantic,hybrid")
    args = parser.parse_args()
    emb = Embedder(load_index(), args.model)
    mlflow.set_tracking_uri(f"sqlite:///{Path(__file__).parents[2] / 'mlflow.db'}")
    mlflow.set_experiment("place-search")
    print(f"model={args.model} min_score={args.min_score}")
    lexical: list[bool] | None = None
    for mode in args.modes.split(","):
        res = run(mode, emb if mode != "lexical" else None, args.min_score)
        if mode == "lexical":
            lexical = res["hits5"]
        elif lexical is not None:
            res["hit5_vs_lexical"], res["hit5_vs_lexical_se"] = paired_diff(lexical, res["hits5"])
        with mlflow.start_run(run_name=f"{mode}:{Path(args.model).name}"):
            mlflow.log_params({"mode": mode, "model": args.model, "min_score": args.min_score})
            mlflow.log_metrics({k: v for k, v in res.items() if isinstance(v, int | float)})
            mlflow.log_dict({"misses": res["misses"]}, "misses.json")
        nums = {k: round(v, 3) for k, v in res.items() if isinstance(v, int | float)}
        print(f"{mode:9} {nums}\n          misses@5: {res['misses']}")


if __name__ == "__main__":
    main()
