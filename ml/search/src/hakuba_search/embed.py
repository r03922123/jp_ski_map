"""Embed the place index and search it by cosine similarity (exact, one matrix product)."""

import os
from dataclasses import dataclass

import numpy as np
from hakuba_api.places.index import Entry
from sentence_transformers import SentenceTransformer

BASE_MODEL = "intfloat/multilingual-e5-small"
# e5 was trained with these prefixes; leaving them out costs accuracy
QUERY, PASSAGE = "query: ", "passage: "


def entry_text(e: Entry) -> str:
    parts = [e.name, e.name_ja or "", *e.aliases, e.detail]
    return " | ".join(dict.fromkeys(p for p in parts if p))


def device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else "cpu"


@dataclass
class Hit:
    id: str
    score: float


class Embedder:
    def __init__(self, entries: list[Entry], model: str | None = None) -> None:
        self.model = SentenceTransformer(
            model or os.environ.get("HAKUBA_EMBED_MODEL", BASE_MODEL), device=device()
        )
        self.ids = [e.id for e in entries]
        self.matrix = self.model.encode(
            [PASSAGE + entry_text(e) for e in entries],
            normalize_embeddings=True,
            batch_size=64,
            convert_to_numpy=True,
        )

    def search(self, query: str, k: int, min_score: float = 0.0) -> list[Hit]:
        q = self.model.encode([QUERY + query], normalize_embeddings=True, convert_to_numpy=True)
        scores = (self.matrix @ q[0]).astype(float)
        top = np.argsort(-scores)[:k]
        return [Hit(self.ids[i], float(scores[i])) for i in top if scores[i] >= min_score]
