import random
from types import SimpleNamespace

from hakuba_api.common.geo import Coord
from hakuba_api.places.index import Entry

from hakuba_search.evaluate import hit_at, matches
from hakuba_search.synth import make_pairs, queries_for, split_of, to_zh, typo

AT = Coord(lat=36.7, lng=137.86)


def entry(id: str, kind: str, name: str, ja: str | None = None, detail: str = "") -> Entry:
    return Entry(id, kind, name, ja, [], AT, detail)  # type: ignore[arg-type]


def test_split_is_stable_and_by_entry() -> None:
    assert split_of("osm:node/1") == split_of("osm:node/1")
    shares = [split_of(f"id-{i}") for i in range(1000)]
    assert 150 < shares.count("dev") < 250


def test_dev_entries_never_appear_in_train() -> None:
    es = [entry(f"e{i}", "lodging", f"Hotel Number{i}") for i in range(200)]
    pairs = make_pairs(es)
    train = {p.entry_id for p in pairs["train"]}
    dev = {p.entry_id for p in pairs["dev"]}
    assert train and dev and not train & dev


def test_typo_changes_one_letter_and_keeps_short_words() -> None:
    rng = random.Random(1)
    out = typo("Mominoki", rng)
    assert out != "Mominoki" and abs(len(out) - 8) <= 1
    assert typo("Inn", rng) == "Inn"


def test_chinese_variants_of_japanese_words() -> None:
    assert to_zh("白馬八方尾根スキー場") == "白馬八方尾根滑雪場"
    assert to_zh("エイブル白馬五竜") == "エイブル白馬五龍"


def test_food_entries_get_cuisine_queries() -> None:
    qs = queries_for(
        entry("r", "food", "Takahashi-ke", detail="Restaurant · ramen"), random.Random(0)
    )
    assert any("拉麵" in q for q in qs) and "Takahashi-ke" in qs


def place(**kw: object) -> SimpleNamespace:
    base = {"id": "x", "kind": "food", "name": "n", "name_ja": None, "detail": ""}
    return SimpleNamespace(**(base | kw))


def test_case_predicates() -> None:
    assert matches({"id_prefix": ["goryu"]}, place(id="goryu:goryu-iimori"))  # type: ignore[arg-type]
    assert matches({"detail_any": ["noodle"]}, place(detail="Restaurant · noodle;soba"))  # type: ignore[arg-type]
    assert matches({"kind": "convenience"}, place(kind="convenience"))  # type: ignore[arg-type]
    assert matches({"name_any": ["東急"]}, place(name="x", name_ja="白馬東急ホテル"))  # type: ignore[arg-type]
    assert not matches({"name_any": ["東急"]}, place(name="Tokyo"))  # type: ignore[arg-type]


def test_hit_at_k_looks_only_at_the_top_k() -> None:
    results = [place(kind="food"), place(kind="convenience")]
    assert not hit_at({"kind": "convenience"}, results, 1)  # type: ignore[arg-type]
    assert hit_at({"kind": "convenience"}, results, 2)  # type: ignore[arg-type]
