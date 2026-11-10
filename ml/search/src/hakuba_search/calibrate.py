"""Pick a model's cosine threshold on the synthetic dev split, never on the test sets.

Run: `uv run python -m hakuba_search.calibrate [--model models/e5-hakuba] [--precision 0.9]`
Prints the lowest threshold whose top-1 answers on dev are at least `precision` correct:
the score scale moves when a model is fine-tuned, so each model needs its own.
"""

import argparse

import numpy as np
from hakuba_api.places.suggest import load_index
from sentence_transformers import SentenceTransformer

from hakuba_search.embed import BASE_MODEL, PASSAGE, QUERY, device, entry_text
from hakuba_search.synth import make_pairs


def threshold_for(scores: list[float], correct: list[bool], precision: float) -> float:
    """Lowest score s such that top-1 answers scoring >= s are `precision` correct."""
    order = np.argsort(scores)[::-1]
    best = float("inf")
    right = 0
    for n, i in enumerate(order, start=1):
        right += correct[i]
        if right / n >= precision:
            best = scores[i]
    return float(best)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=BASE_MODEL)
    parser.add_argument("--precision", type=float, default=0.9)
    args = parser.parse_args()
    entries = load_index()
    ids = [e.id for e in entries]
    dev = make_pairs(entries)["dev"]
    model = SentenceTransformer(args.model, device=device())
    docs = model.encode([PASSAGE + entry_text(e) for e in entries], normalize_embeddings=True)
    qs = model.encode([QUERY + p.query for p in dev], normalize_embeddings=True)
    sims = qs @ docs.T
    top = sims.argmax(axis=1)
    scores = [float(sims[r, j]) for r, j in enumerate(top)]
    correct = [ids[j] == p.entry_id for j, p in zip(top, dev, strict=True)]
    t = threshold_for(scores, correct, args.precision)
    kept = sum(s >= t for s in scores) / len(scores)
    print(f"model={args.model} precision>={args.precision}: min_score={t:.4f} keeps {kept:.0%}")


if __name__ == "__main__":
    main()
