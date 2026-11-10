"""Synthetic (query, entry) pairs for contrastive fine-tuning, generated from the index itself.

Each rule mimics a way people really type a place: dropped or added area words, typos,
romaji readings, Chinese characters for Japanese words, and food or shop words. Rules like
these regenerate test queries word for word ("ramen", 拉麵), so `make_pairs` drops every query
equal to one in evals/hard_queries.json after normalising. Near-duplicates ("ramen hakuba")
can remain.
"""

import hashlib
import json
import random
from dataclasses import dataclass
from pathlib import Path

from hakuba_api.places.index import Entry, normalize

HARD = Path(__file__).parents[2] / "evals" / "hard_queries.json"

# Japanese → Chinese (traditional) words and characters a Chinese-speaking visitor would type
ZH = {"スキー場": "滑雪場", "ホテル": "酒店", "温泉": "溫泉", "竜": "龍", "乗": "乘", "館": "館"}
CUISINE_WORDS = {
    "ramen": ["ramen", "拉麵", "ラーメン"],
    "noodle": ["noodles", "麵", "麺"],
    "soba": ["soba", "蕎麥麵", "そば"],
    "curry": ["curry", "咖哩", "カレー"],
    "pizza": ["pizza", "披薩", "ピザ"],
    "coffee_shop": ["coffee", "cafe", "咖啡", "カフェ"],
    "japanese": ["japanese food", "日本料理", "和食"],
    "mexican": ["mexican", "tacos", "墨西哥菜"],
    "indian": ["indian", "印度料理", "インド料理"],
    "chinese": ["chinese", "中華料理", "中餐"],
    "italian": ["italian", "義大利菜", "イタリアン"],
    "burger": ["burger", "漢堡", "ハンバーガー"],
    "steak_house": ["steak", "牛排", "ステーキ"],
    "breakfast": ["breakfast", "早餐", "朝食"],
}
KIND_WORDS = {
    "convenience": ["convenience store", "konbini", "便利商店", "コンビニ"],
    "food": ["restaurant", "餐廳", "レストラン"],
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
    cuisines = e.detail.split(" · ")[-1].split(";") if " · " in e.detail else []
    for c in cuisines:
        for word in CUISINE_WORDS.get(c, []):
            out.append(rng.choice([word, f"{word} {rng.choice(AREA)}"]))
    for word in KIND_WORDS.get(e.kind, []):
        if e.kind in ("stop", "resort"):
            out.append(f"{e.name.split(' · ')[0].split()[-1]} {word}")
        else:
            out.append(f"{word} {e.name}")
    return list(dict.fromkeys(q for q in out if q.strip()))


def held_out() -> frozenset[str]:
    """Normalised hard-set queries: never a training or calibration query."""
    return frozenset(normalize(c["q"]) for c in json.loads(HARD.read_text())["cases"])


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
