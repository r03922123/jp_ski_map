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
# A reading that sounds like the query word ("guresu" for "grace") counts as a full
# match, a hair below a spelled one (more for a one-word query, below); keys need 3
# consonants ("tokyu"/"tokiwa" are "tk").
SOUND_MATCH = 0.99
SOUND_PENALTY = 2
# a one-word query's sound match loses the whole coverage bonus (at most 5), so a
# one-word reading can't outrank a longer name that spells it ("haven": Haven Lodge)
SOLO_SOUND_PENALTY = 5
MIN_SOUND_KEY = 3
# A reading approximates a name (unknown kanji dropped), so it stays below the
# exact (100) and name-prefix (90) tiers: 乗鞍荘 reads "norikura" but isn't named it.
READING_MAX = 85
# Area-only queries mean the well-known place: this clears the name-prefix tier, so
# "goryu" gives the resort before the "Goryu Hon-dorinishi" bus stop.
RESORT_PROMINENCE = 15
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

# Generic words that say a query wants somewhere to stay. "resort", "house" and "onsen" are
# left out because ski resorts and baths use them too.
LODGING_WORDS = frozenset(
    {
        "hotel", "hotels", "inn", "lodge", "lodges", "chalet", "chalets", "apartment",
        "apartments", "pension", "ryokan", "villa", "villas", "cottage", "cottages", "hostel",
        "guesthouse",
    }
)  # fmt: skip
# Written in kana these sit inside unspaced names (パノラマホテル), so they match by substring.
KANA_LODGING_WORDS = {"ほてる": "hotel", "ぺんしょん": "pension"}


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
        if len(key) >= MIN_SOUND_KEY and any(
            sound_key(t) == key for t in tokens if t not in GENERIC
        ):
            return SOUND_MATCH
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


def fits_lodging_words(query: str, kind: str, names: list[str]) -> bool:
    """False for a place that isn't lodging when the query names a type of lodging the place
    doesn't carry: "Hakuba Park Hotel" must not answer with the "… Parking" bus stop. A bus stop
    named only for what the query names stays: "The Gakusui Hotel" keeps the "The Gakusui" stop."""
    q_tokens = _tokens(normalize(query))
    wanted = {KANA_LODGING_WORDS.get(t, t) for t in q_tokens} & LODGING_WORDS
    if kind == "lodging" or not wanted:
        return True
    q_distinctive = set(distinctive(q_tokens))
    for name in map(normalize, names):
        tokens = _tokens(name.replace("&", " "))
        named_only_for_it = (
            kind == "stop" and q_distinctive and q_distinctive == set(distinctive(tokens))
        )
        if wanted.intersection(tokens) or named_only_for_it:
            return True
        if any(word in wanted and kana in name for kana, word in KANA_LODGING_WORDS.items()):
            return True
    return False


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
        if m is not None and m >= SOUND_MATCH:
            return 80 + coverage - (SOLO_SOUND_PENALTY if m < 1.0 else 0)
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
    penalty += SOUND_PENALTY * sum(1 for m in matches if m is not None and m < 1.0)
    if all(m is not None and m >= SOUND_MATCH for m in matches):
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
    # Only area/generic words ("iwatake", "goryu"): the user means the well-known place,
    # so resorts come before nearer lodges and stops, like Google's prominence ranking.
    boost_resorts = not distinctive(_tokens(q))
    hits: list[Hit] = []
    for e in entries:
        names = [e.name, *(([e.name_ja]) if e.name_ja else []), *e.aliases]
        if not fits_lodging_words(q, e.kind, names):
            continue
        scores = [s for n in names if (s := _score_name(q, normalize(n))) is not None]
        # a reading approximates the name (unknown kanji dropped): never an exact/prefix hit
        scores += [
            min(s, READING_MAX)
            for r in e.readings
            if (s := _score_name(q, r, by_sound=True)) is not None
        ]
        if not scores:
            continue
        score = max(scores) + (RESORT_PROMINENCE if boost_resorts and e.kind == "resort" else 0)
        hits.append(Hit(e, score, _span(q, e.name), _km(near, e.coord)))
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
