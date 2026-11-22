import math
import random
from types import SimpleNamespace

import pytest
from hakuba_api.common.geo import Coord
from hakuba_api.places.index import Entry

from hakuba_search.evaluate import hit_at, matches, mean_se, paired_diff
from hakuba_search.synth import Pair, make_pairs, queries_for, rebalance, split_of, to_zh, typo

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


def test_threshold_is_the_lowest_score_that_keeps_the_precision() -> None:
    from hakuba_search.calibrate import threshold_for

    scores = [0.95, 0.9, 0.85, 0.8, 0.7]
    correct = [True, True, True, False, False]
    assert threshold_for(scores, correct, 1.0) == 0.85
    assert threshold_for(scores, correct, 0.75) == 0.8


def test_hit_at_k_looks_only_at_the_top_k() -> None:
    results = [place(kind="food"), place(kind="convenience")]
    assert not hit_at({"kind": "convenience"}, results, 1)  # type: ignore[arg-type]
    assert hit_at({"kind": "convenience"}, results, 2)  # type: ignore[arg-type]


def test_excluded_queries_never_become_pairs() -> None:
    es = [entry("r", "food", "Takahashi-ke", detail="Restaurant · ramen")]
    pairs = make_pairs(es, exclude=frozenset({"ramen", "拉麵"}))
    queries = {p.query for split in pairs.values() for p in split}
    assert "Takahashi-ke" in queries and "ramen" not in queries and "拉麵" not in queries


def test_no_hard_query_is_a_training_or_dev_query() -> None:
    # the review found 13 of 40 verbatim in train; the hard set must stay unseen
    from hakuba_api.places.index import normalize
    from hakuba_api.places.suggest import load_index

    from hakuba_search.synth import held_out

    pairs = make_pairs(load_index())
    seen = {normalize(p.query) for split in pairs.values() for p in split}
    # both hand-written sets: the v1.4 hard set (40) and the 2026-11-21 held-out set (55)
    assert len(held_out()) == 95 and not seen & held_out()


def test_rebalance_caps_the_largest_kind_and_keeps_the_rest() -> None:
    kind = {"h": "lodging", "f": "food", "s": "stop"}
    pairs = [Pair(f"q{i}", "h") for i in range(90)] + [
        *(Pair(f"f{i}", "f") for i in range(6)),
        *(Pair(f"s{i}", "s") for i in range(4)),
    ]
    out = rebalance(pairs, kind, max_share=0.5, seed=0)
    by = [kind[p.entry_id] for p in out]
    assert by.count("lodging") == 10 and by.count("food") == 6 and by.count("stop") == 4
    assert rebalance(pairs, kind, max_share=0.5, seed=0) == out  # reproducible
    assert rebalance(pairs, kind, max_share=1.0, seed=0) == pairs  # 1.0 turns it off


def test_mean_and_its_standard_error() -> None:
    mean, se = mean_se([1, 0, 1, 0])
    assert mean == 0.5 and se == pytest.approx(0.2887, abs=1e-4)
    assert mean_se([1.0]) == (1.0, 0.0)  # one item says nothing about spread


def test_a_paired_difference_is_tighter_than_an_unpaired_one() -> None:
    # hybrid finds 2 queries lexical missed and loses none, on the same 8 queries
    lexical = [True, False, False, True, False, False, True, False]
    hybrid = [True, True, False, True, True, False, True, False]
    diff, se = paired_diff(lexical, hybrid)
    assert diff == 0.25 and se == pytest.approx(0.1637, abs=1e-4)
    # treating the two hit rates as separate samples gives 0.259: the queries both modes
    # find hard (or easy) are counted as noise twice
    unpaired = math.hypot(mean_se(lexical)[1], mean_se(hybrid)[1])
    assert unpaired == pytest.approx(0.2588, abs=1e-4) and se < unpaired


def test_paired_lists_must_cover_the_same_queries() -> None:
    with pytest.raises(ValueError):
        paired_diff([True, False], [True])
