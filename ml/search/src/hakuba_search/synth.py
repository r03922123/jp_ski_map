"""Synthetic (query, entry) pairs for contrastive fine-tuning, generated from the index itself.

Each rule mimics a way people really type a place: dropped or added area words, typos,
romaji readings, Chinese characters for Japanese words, and stop or resort words. Rules like
these regenerate test queries word for word ("Goryu ski resort"), so `make_pairs` drops every
query equal to one in a hand-written eval set (evals/hard_queries.json, evals/heldout_v2.json)
after normalising. Near-duplicates ("Goryu ski resort hakuba") can remain.
"""

import hashlib
import json
import random
from dataclasses import dataclass
from pathlib import Path

from hakuba_api.places.index import Entry, normalize

EVALS = Path(__file__).parents[2] / "evals"
HELD_OUT = (EVALS / "hard_queries.json", EVALS / "heldout_v2.json")

# Japanese → Chinese (traditional) words and characters a Chinese-speaking visitor would type
ZH = {"スキー場": "滑雪場", "ホテル": "酒店", "温泉": "溫泉", "竜": "龍", "乗": "乘", "館": "館"}
KIND_WORDS = {
    "stop": ["bus stop", "公車站", "バス停"],
    "resort": ["ski resort", "滑雪場", "スキー場"],
}
AREA = ("Hakuba", "白馬", "hakuba")


@dataclass(frozen=True)
class Pair:
    query: str
    entry_id: str


def split_of(entry_id: str, dev_share: float = 0.2) -> str:
    """Stable train/dev split by entry, so dev names are never seen in training."""
    h = int(hashlib.sha1(entry_id.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return "dev" if h < dev_share else "train"


def typo(text: str, rng: random.Random) -> str:
    letters = [i for i, c in enumerate(text) if c.isalpha()]
    if len(letters) < 5:
        return text
    i = rng.choice(letters[1:-1])
    op = rng.choice(("drop", "swap", "double"))
    if op == "drop":
        return text[:i] + text[i + 1 :]
    if op == "swap":
        return text[: i - 1] + text[i] + text[i - 1] + text[i + 1 :]
    return text[:i] + text[i] + text[i:]


def to_zh(text: str) -> str:
    for ja, zh in ZH.items():
        text = text.replace(ja, zh)
    return text


def queries_for(e: Entry, rng: random.Random) -> list[str]:
    out: list[str] = []
    for name in filter(None, [e.name, e.name_ja]):
        out.append(name)
        bare = " ".join(w for w in name.split() if w not in AREA).strip()
        if bare and bare != name:
            out.append(bare)
        out.append(typo(name, rng))
        if (zh := to_zh(name)) != name:
            out.append(zh)
    out.extend(e.readings)
    out.extend(e.aliases)
    for word in KIND_WORDS.get(e.kind, []):
        out.append(f"{e.name.split(' · ')[0].split()[-1]} {word}")
    return list(dict.fromkeys(q for q in out if q.strip()))


def held_out() -> frozenset[str]:
    """Normalised queries of every hand-written eval set: never a training or calibration query."""
    return frozenset(
        normalize(c["q"]) for f in HELD_OUT for c in json.loads(f.read_text())["cases"]
    )


def rebalance(
    pairs: list[Pair], kind_of: dict[str, str], max_share: float, seed: int = 0
) -> list[Pair]:
    """Sample down any kind holding more than `max_share` of the pairs, so lodging names
    (three quarters of the index) don't crowd out stop and resort words. Keeps order."""
    if max_share >= 1:
        return pairs
    counts: dict[str, int] = {}
    for p in pairs:
        counts[kind_of[p.entry_id]] = counts.get(kind_of[p.entry_id], 0) + 1
    rng = random.Random(seed)
    keep: set[int] = set(range(len(pairs)))
    for kind, n in counts.items():
        cap = int(max_share / (1 - max_share) * (len(pairs) - n))
        if n > cap:
            idx = [i for i, p in enumerate(pairs) if kind_of[p.entry_id] == kind]
            keep -= set(idx) - set(rng.sample(idx, cap))
    return [p for i, p in enumerate(pairs) if i in keep]


def make_pairs(
    entries: list[Entry], seed: int = 0, exclude: frozenset[str] | None = None
) -> dict[str, list[Pair]]:
    banned = held_out() if exclude is None else exclude
    rng = random.Random(seed)
    pairs: dict[str, list[Pair]] = {"train": [], "dev": []}
    for e in entries:
        pairs[split_of(e.id)].extend(
            Pair(q, e.id) for q in queries_for(e, rng) if normalize(q) not in banned
        )
    return pairs
