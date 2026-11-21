"""Generated readings and reviewed aliases for lodging (SPEC-place-search v1.5)."""

from hakuba_api.common.geo import Coord
from hakuba_api.places.index import Entry, Hit, build_index, rank
from hakuba_api.places.lodging import load_lodging
from hakuba_api.places.lodging_extras import (
    AliasesFile,
    LodgingAlias,
    LodgingReading,
    ReadingsFile,
    load_readings_file,
    readings_by_id,
    reviewed_aliases,
)
from hakuba_api.places.models import Place
from hakuba_api.places.refresh_readings import build_readings, read, word_kana
from hakuba_api.places.validate import validate_extras

HAPPO = Coord(lat=36.7005, lng=137.8436)
YUKINOSO_ID = "overture:b0c9aede-1e85-423a-b3b4-07fa674b3b18"


def _place(pid: str, name: str, name_ja: str | None = None) -> Place:
    return Place(
        id=pid,
        name=name,
        name_ja=name_ja,
        kind="hotel",
        coord=HAPPO,
        address=None,
        source="overture-snapshot",
    )


YUKINOSO = _place("lodging:yuki", "雪の荘", "雪の荘")


def _names(hits: list[Hit]) -> list[str]:
    return [h.entry.name for h in hits]


# --- generating readings --------------------------------------------------------------


def test_the_inn_suffix_reads_sou_not_the_dictionarys_shou() -> None:
    assert word_kana([("雪", "ユキ"), ("の", "ノ"), ("荘", "ショウ")]) == ["ユキ", "ノ", "ソウ"]


def test_a_word_without_kana_keeps_its_text() -> None:
    assert word_kana([("Hakuba", None)]) == ["Hakuba"]


def test_readings_are_spaced_by_word_and_also_joined() -> None:
    kana, forms = read([("雪", "ユキ"), ("の", "ノ"), ("荘", "ショウ")])
    assert kana == "ユキノソウ"
    assert forms == ["yuki no so", "yukinoso"]  # long vowels fold, as in kana.to_romaji


def test_loanwords_still_become_english_words() -> None:
    _, forms = read([("白馬", "ハクバ"), ("東急", "トウキュウ"), ("ホテル", "ホテル")])
    assert forms[0] == "hakuba tokyu hotel"


def test_only_japanese_names_get_readings() -> None:
    tagger = {"雪の荘": [("雪", "ユキ"), ("の", "ノ"), ("荘", "ソウ")]}
    out = build_readings([YUKINOSO, _place("lodging:en", "Hotel Hakuba")], tagger.__getitem__)
    assert [r.id for r in out] == ["lodging:yuki"]


# --- matching ---------------------------------------------------------------------------


def test_a_generated_reading_finds_a_kanji_name() -> None:
    readings = {"lodging:yuki": ("yuki no so", "yukinoso", "ユキノソウ")}
    index = build_index([], [], [YUKINOSO], [], readings=readings)
    for q in ("yukinoso", "yuki no so", "ゆきのそう", "ユキノソウ"):
        assert _names(rank(index, q, HAPPO, 3)) == ["雪の荘"], q


def test_a_reading_never_ties_a_spelled_name() -> None:
    # ホテル サニーバレー reads "sani bare": "bar" still means the bar
    index = [
        Entry("poi:bar", "food", "Endless Bar & Restaurant", None, [], HAPPO, "Restaurant"),
        Entry(
            "lodging:sunny",
            "lodging",
            "ホテル サニーバレー",
            None,
            [],
            HAPPO,
            "Hotel",
            readings=("hotel sani bare",),
        ),
    ]
    assert _names(rank(index, "bar", HAPPO, 2))[0] == "Endless Bar & Restaurant"


def test_only_reviewed_aliases_reach_the_index() -> None:
    def alias(name: str, status: str) -> LodgingAlias:
        return LodgingAlias.model_validate(
            {"id": "lodging:yuki", "alias": name, "source": "https://a.test/", "status": status}
        )

    f = AliasesFile(
        aliases=[
            alias("Hakuba Hospitality Inn Yukinoso", "reviewed"),
            alias("Snowfield Chalet", "unreviewed"),
            alias("Snow Lodge", "rejected"),
        ]
    )
    assert reviewed_aliases(f) == {"lodging:yuki": ("Hakuba Hospitality Inn Yukinoso",)}
    index = build_index([], [], [YUKINOSO], [], aliases=reviewed_aliases(f))
    assert _names(rank(index, "Hakuba Hospitality Inn Yukinoso", HAPPO, 3)) == ["雪の荘"]
    assert rank(index, "Snowfield Chalet", HAPPO, 3) == []  # unreviewed: not a name yet


# --- validation and the shipped data ------------------------------------------------------


def test_extras_must_name_a_known_lodging_with_an_https_source() -> None:
    readings = ReadingsFile(
        generator="t",
        readings=[LodgingReading(id="lodging:gone", name="x", kana="x", romaji=["x"])],
    )
    dup = {"id": "lodging:yuki", "alias": "Yukinoso", "status": "unreviewed"}
    aliases = AliasesFile.model_validate(
        {
            "aliases": [
                {**dup, "source": "http://insecure.test/"},
                {**dup, "alias": "yukinoso", "source": "https://a.test/"},
            ]
        }
    )
    errors = validate_extras([YUKINOSO], readings, aliases)
    assert any("unknown id lodging:gone" in e for e in errors)
    assert any("needs an https source" in e for e in errors)
    assert any("twice" in e for e in errors)


def test_the_shipped_readings_cover_yukinoso() -> None:
    readings = readings_by_id(load_readings_file())
    assert any(p.id == YUKINOSO_ID for p in load_lodging())
    assert "yukinoso" in readings[YUKINOSO_ID]
