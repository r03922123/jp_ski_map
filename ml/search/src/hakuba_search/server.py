"""Local embedding server the API calls when HAKUBA_SEMANTIC_URL is set.

Run: `uv run python -m hakuba_search.server --port 8032 [--model models/e5-hakuba]`
"""

import argparse
import os
from typing import Annotated

import uvicorn
from fastapi import FastAPI, Query
from hakuba_api.places.suggest import load_index

from hakuba_search.embed import Embedder

# Below this cosine a "nearest" entry is usually unrelated. Each model has its own scale, so
# take the value from `python -m hakuba_search.calibrate --model ...` (0.9127 for the base model).
MIN_SCORE = float(os.environ.get("HAKUBA_SEMANTIC_MIN_SCORE", "0.9127"))

app = FastAPI(title="hakuba-search")
_embedder: Embedder | None = None


def embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder(load_index())
    return _embedder


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "entries": len(embedder().ids)}


@app.get("/search")
def search(
    q: Annotated[str, Query(min_length=1, max_length=200)],
    k: Annotated[int, Query(ge=1, le=20)] = 8,
) -> list[dict[str, object]]:
    return [{"id": h.id, "score": round(h.score, 4)} for h in embedder().search(q, k, MIN_SCORE)]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8032)
    parser.add_argument("--model")
    parser.add_argument("--min-score", type=float, help="from hakuba_search.calibrate")
    args = parser.parse_args()
    if args.model:
        os.environ["HAKUBA_EMBED_MODEL"] = args.model
    if args.min_score is not None:
        MIN_SCORE = args.min_score
    embedder()  # load before serving, so the first request is not slow
    # the access log would print every ?q=, and queries are user data
    uvicorn.run(app, host="127.0.0.1", port=args.port, access_log=False)
