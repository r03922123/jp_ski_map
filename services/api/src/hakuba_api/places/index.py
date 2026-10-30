"""In-memory place index for search-as-you-type. Pure matching; loaders are injected.

Sources: bus stops, resorts (+ base areas), the lodging snapshot and the POI snapshot —
about 350 names we already hold, so suggestions never wait on the network.
See SPEC-place-search.md v1.2.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from hakuba_api.bus.models import BusStop
from hakuba_api.catalog.models import Resort
from hakuba_api.common.geo import Coord
from hakuba_api.places.kana import sound_key, to_romaji
from hakuba_api.places.models import Place
from hakuba_api.pois.models import Poi

Kind = Literal["resort", "stop", "lodging", "food", "convenience", "place"]
KIND_ORDER: dict[str, int] = {k: i for i, k in enumerate(Kind.__args__)}  # type: ignore[attr-defined]

MIN_FUZZY_LEN = 4
MAX_EDITS = 2
LONG_WORD = 8  # from this length a query word may carry two typos
MISSING_GENERIC_PENALTY = 3

# Words that say what a place is, or where, rather than which one: a query may carry
# them ("The Ridge Hotel & Apartments Hakuba") without the name having them, and they
# never make two different hotels match (SPEC-place-search v1.3).
GENERIC = frozenset(
    {
        "the", "by", "and", "&", "of", "at", "in", "a",
        "hotel", "hotels", "inn", "lodge", "lodges", "chalet", "chalets", "apartment",
        "apartments", "resort", "house", "pension", "onsen", "ryokan", "villa", "villas",
        "cottage", "cottages", "hostel", "guesthouse", "guest", "condominium", "restaurant",
        "hakuba", "japan", "nagano", "mura",
        # areas: where a place is, not which one ("Granjam Tsugaike" ≠ "Tsugaike Berghaus")
        "happo", "echoland", "wadano", "goryu", "iwatake", "tsugaike", "kamishiro", "sakka",
        "misorano", "norikura", "cortina", "otari", "omachi", "hokujo", "kogen", "valley",
        "ほてる", "ぺんしょん", "白馬",
    }
)  # fmt: skip


@dataclass(frozen=True)
class Entry:
    id: str
    kind: Kind
    name: str
    name_ja: str | None
    aliases: list[str]
    coord: Coord
    detail: str
    # romaji of Japanese names (ホテルグレース白馬 → "hotel guresu hakuba"), matched by sound
    readings: tuple[str, ...] = ()


@dataclass(frozen=True)
class Hit:
    entry: Entry
    score: float
    match: tuple[int, int] | None  # span in `name` to highlight
    distance_km: float

    @property
    def name(self) -> str:
        return self.entry.name

    @property
    def detail(self) -> str:
        return self.entry.detail


@lru_cache(maxsize=16_384)  # index names repeat on every query
def normalize(text: str) -> str:
    """NFKC, case-folded, katakana folded to hiragana, whitespace collapsed."""
    folded = "".join(
        chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c
        for c in unicodedata.normalize("NFKC", text).casefold()
    )
    return " ".join(folded.split())


_TOKEN = re.compile(r"[^\s\-・,./()（）]+")


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text)


def _edits(a: str, b: str, cap: int = MAX_EDITS) -> int:
    """Levenshtein distance, capped (returns cap + 1 once exceeded)."""
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > cap:
            return cap + 1
        prev = cur
    return prev[-1]


def _token_match(q: str, tokens: list[str], by_sound: bool = False) -> float | None:
    """How well one query token matches some name token: 1 prefix (or, against a reading,
    the same sound), <1 fuzzy, None no."""
    if any(t.startswith(q) for t in tokens):
        return 1.0
    if by_sound and q not in GENERIC and len(q) >= MIN_FUZZY_LEN:
        key = sound_key(q)
        if len(key) >= 2 and any(sound_key(t) == key for t in tokens if t not in GENERIC):
            return 1.0
    if len(q) >= MIN_FUZZY_LEN:
        # one typo in a short word, two in a long one: "ridge" must not become "lodge"
        cap = MAX_EDITS if len(q) >= LONG_WORD else 1
        best = min((_edits(q, t, cap) for t in tokens), default=cap + 1)
        if best <= cap:
            return 1 - best / (len(q) + 1)
    return None


def distinctive(tokens: list[str]) -> list[str]:
    return [t for t in tokens if t not in GENERIC]


def shares_distinctive_word(query: str, name: str) -> bool:
    """True when `name` contains one of the query's distinctive words (all words when
    the query has none): the relevance check for results from outside our index."""
    q_tokens = _tokens(normalize(query))
    wanted = distinctive(q_tokens) or q_tokens
    tokens = _tokens(normalize(name))
    return any(_token_match(t, tokens) is not None for t in wanted)


def _score_name(q: str, name: str, by_sound: bool = False) -> float | None:
    """Score a normalised query against one normalised name, or None. `by_sound` is for
    readings of Japanese names, where "grace" and "guresu" are the same word."""
    if not q or not name:
        return None
    if q == name:
        return 100
    if name.startswith(q):
        return 90
    tokens = _tokens(name)
    q_tokens = _tokens(q)
    if not q_tokens:
        return None
    coverage = min(5, 5 * len(q_tokens) / max(len(tokens), 1))
    if len(q_tokens) == 1:
        m = _token_match(q_tokens[0], tokens, by_sound)
        if m == 1.0:
            return 80 + coverage
        if q in name:
            return 70 + coverage
        return 40 + 20 * m + coverage if m is not None else None
    # every distinctive word must match; a missing generic word only costs a little
    required = distinctive(q_tokens) or q_tokens
    matches = [_token_match(t, tokens, by_sound) for t in required]
    if any(m is None for m in matches):
        return None
    missing = sum(
        1 for t in q_tokens if t not in required and _token_match(t, tokens, by_sound) is None
    )
    penalty = MISSING_GENERIC_PENALTY * missing
    if all(m == 1.0 for m in matches):
        return 75 + coverage - penalty
    found = [m for m in matches if m is not None]
    return 40 + 15 * (sum(found) / len(found)) + coverage - penalty


def _span(q: str, name: str) -> tuple[int, int] | None:
    norm = normalize(name)
    if len(norm) != len(name):  # NFKC changed lengths; a span would be misaligned
        return None
    i = norm.find(q)
    if i < 0:
        first = _tokens(q)[0] if _tokens(q) else q
        i = norm.find(first)
        return (i, i + len(first)) if i >= 0 else None
    return (i, i + len(q))


def _km(a: Coord, b: Coord) -> float:
    import math

    la1, lo1, la2, lo2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
    h = (
        math.sin((la2 - la1) / 2) ** 2
        + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(h))


def rank(entries: list[Entry], query: str, near: Coord, limit: int) -> list[Hit]:
    q = normalize(query)
    hits: list[Hit] = []
    for e in entries:
        names = [e.name, *(([e.name_ja]) if e.name_ja else []), *e.aliases]
        scores = [s for n in names if (s := _score_name(q, normalize(n))) is not None]
        scores += [s for r in e.readings if (s := _score_name(q, r, by_sound=True)) is not None]
        if not scores:
            continue
        hits.append(Hit(e, max(scores), _span(q, e.name), _km(near, e.coord)))
    hits.sort(key=lambda h: (-h.score, h.distance_km, KIND_ORDER[h.entry.kind]))
    return hits[:limit]


def build_index(
    stops: list[BusStop], resorts: list[Resort], lodging: list[Place], pois: list[Poi]
) -> list[Entry]:
    entries: list[Entry] = []
    for s in stops:
        if s.coord:
            entries.append(
                Entry(s.id, "stop", s.name.en, s.name.ja, list(s.aliases), s.coord, "Bus stop")
            )
    for r in resorts:
        base = r.access_points[0]
        entries.append(Entry(r.id, "resort", r.name.en, r.name.ja, [], base.coord, "Ski resort"))
        if len(r.access_points) > 1:
            for ap in r.access_points:
                entries.append(
                    Entry(
                        f"{r.id}:{ap.id}",
                        "resort",
                        f"{r.name.en} · {ap.name.en}",
                        f"{r.name.ja} {ap.name.ja}" if r.name.ja and ap.name.ja else None,
                        [],
                        ap.coord,
                        "Ski resort base",
                    )
                )
    for p in lodging:
        japanese = p.name_ja or (None if p.name.isascii() else p.name)
        reading = to_romaji(japanese) if japanese else ""
        entries.append(
            Entry(
                p.id,
                "lodging",
                p.name,
                p.name_ja,
                [],
                p.coord,
                p.kind.replace("_", " ").title(),
                readings=(reading,) if reading else (),
            )
        )
    for poi in pois:
        label = "Konbini" if poi.category == "convenience" else "Restaurant"
        extra = poi.brand if poi.category == "convenience" else poi.cuisine
        entries.append(
            Entry(
                poi.id,
                poi.category,
                poi.name,
                poi.name_ja,
                [poi.brand] if poi.brand else [],
                poi.coord,
                f"{label} · {extra}" if extra else label,
            )
        )
    return entries
