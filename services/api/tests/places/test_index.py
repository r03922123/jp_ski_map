import dataclasses

from hakuba_api.common.geo import Coord
from hakuba_api.places.index import Entry, Hit, build_index, normalize, rank

HAPPO = Coord(lat=36.70, lng=137.845)
CORTINA = Coord(lat=36.83, lng=137.89)


def entry(
    name: str,
    kind: str,
    coord: Coord = HAPPO,
    ja: str | None = None,
    aliases: list[str] | None = None,
    detail: str | None = None,
) -> Entry:
    return Entry(
        id=f"{kind}:{name}",
        kind=kind,  # type: ignore[arg-type]
        name=name,
        name_ja=ja,
        aliases=aliases or [],
        coord=coord,
        detail=detail or kind,
    )


ENTRIES = [
    entry("Hakuba Tokyu Hotel", "stop", ja="白馬東急ホテル", detail="Bus stop · Line H"),
    entry("Hakuba Tokyu Hotel", "lodging", ja="白馬東急ホテル"),
    entry("Hotel Hakuba", "lodging"),
    entry(
        "Hakuba Happo Bus Terminal",
        "stop",
        ja="白馬八方バスターミナル",
        aliases=["Happo Bus Terminal"],
    ),
    entry("7-Eleven Hakuba Happo", "convenience", ja="セブン-イレブン 白馬八方店"),
    entry("Hakuba Cortina Snow Resort", "resort", CORTINA, ja="白馬コルチナスキー場"),
    entry("Hakuba Happo-One Snow Resort", "resort", ja="白馬八方尾根スキー場"),
    entry("Tsugaike Mountain Resort", "resort", Coord(lat=36.79, lng=137.86)),
]


def names(results: list[Hit]) -> list[str]:
    return [r.name for r in results]


TYPED = [
    entry("Hakuba Inn Bloom Parking", "stop"),
    entry("Hakuba 47 Winter Sports Park", "stop"),
    entry("Hotel Hakuba", "stop"),
    entry("Kanemaru", "stop", aliases=["Hotel Kanemaru"]),
    entry("Park View Lodge", "lodging"),
]


def test_a_hotel_query_drops_places_that_are_not_called_a_hotel() -> None:
    assert names(rank(TYPED, "Hakuba Park Hotel", HAPPO, 5)) == ["Park View Lodge"]


def test_a_place_carrying_the_querys_own_lodging_word_stays() -> None:
    assert names(rank(TYPED, "Bloom Inn", HAPPO, 5)) == ["Hakuba Inn Bloom Parking"]
    assert "Hotel Hakuba" in names(rank(TYPED, "Hotel Hakuba", HAPPO, 5))
    assert names(rank(TYPED, "Kanemaru Hotel", HAPPO, 5)) == ["Kanemaru"]


def test_a_kana_lodging_word_matches_the_same_word_in_any_script() -> None:
    panorama = [entry("Panorama Hotel", "stop", ja="パノラマホテル")]
    assert names(rank(panorama, "パノラマ ホテル", HAPPO, 5)) == ["Panorama Hotel"]
    momi = [entry("Mominoki", "stop", ja="白馬樅の木ホテル")]
    assert names(rank(momi, "白馬樅の木 ホテル", HAPPO, 5)) == ["Mominoki"]


def test_a_lodging_word_joined_by_an_ampersand_still_counts() -> None:
    heyza = [entry("HEYZA food&guesthouse", "food")]
    assert names(rank(heyza, "HEYZA guesthouse", HAPPO, 5)) == ["HEYZA food&guesthouse"]


def test_a_stop_named_only_for_the_hotel_stays() -> None:
    gakusui = [entry("The Gakusui", "stop"), entry("Ryokusuitei Keisui", "stop")]
    assert names(rank(gakusui, "The Gakusui Hotel", HAPPO, 5)) == ["The Gakusui"]
    assert names(rank(gakusui, "Ryokusuitei Keisui Ryokan", HAPPO, 5)) == ["Ryokusuitei Keisui"]


def test_a_query_with_no_lodging_word_is_not_filtered() -> None:
    assert "Hakuba Inn Bloom Parking" in names(rank(TYPED, "Parking", HAPPO, 5))
    assert "Hakuba 47 Winter Sports Park" in names(rank(TYPED, "47 Park", HAPPO, 5))


def test_normalises_width_case_and_katakana() -> None:
    assert normalize("Ｈｏｔｅｌ  HAKUBA") == "hotel hakuba"
    assert normalize("ホテル") == normalize("ほてる")


def test_prefix_of_a_name_beats_a_substring() -> None:
    results = rank(ENTRIES, "tokyu", HAPPO, limit=5)

    assert names(results)[:2] == ["Hakuba Tokyu Hotel", "Hakuba Tokyu Hotel"]
    assert results[0].match == (7, 12)  # "Tokyu" inside "Hakuba Tokyu Hotel"


def test_japanese_query_matches_japanese_names() -> None:
    results = rank(ENTRIES, "白馬東急", HAPPO, limit=5)

    assert names(results)[:2] == ["Hakuba Tokyu Hotel", "Hakuba Tokyu Hotel"]


def test_multi_word_query_matches_token_prefixes_and_aliases() -> None:
    assert names(rank(ENTRIES, "happo bus", HAPPO, limit=3))[0] == "Hakuba Happo Bus Terminal"
    assert names(rank(ENTRIES, "7-eleven", HAPPO, limit=3))[0] == "7-Eleven Hakuba Happo"


def test_equal_matches_rank_nearest_first() -> None:
    near_cortina = names(rank(ENTRIES, "hakuba", CORTINA, limit=8))
    near_happo = names(rank(ENTRIES, "hakuba", HAPPO, limit=8))

    assert near_cortina[0] == "Hakuba Cortina Snow Resort"
    assert near_happo[0] != "Hakuba Cortina Snow Resort"


def test_typo_is_forgiven_when_the_query_is_long_enough() -> None:
    assert names(rank(ENTRIES, "hotl hakuba", HAPPO, limit=3))[0] == "Hotel Hakuba"
    assert rank(ENTRIES, "zzz", HAPPO, limit=3) == []


def test_build_index_covers_every_source() -> None:
    from hakuba_api.bus.store import load_stops
    from hakuba_api.catalog.store import load_resorts
    from hakuba_api.places.lodging import load_lodging
    from hakuba_api.pois.store import load_pois

    index = build_index(load_stops(), load_resorts(), load_lodging(), load_pois())

    kinds = {e.kind for e in index}
    assert kinds >= {"stop", "resort", "lodging", "food", "convenience"}
    assert len(index) > 300
    assert names(rank(index, "happo bus terminal", HAPPO, limit=1)) == ["Hakuba Happo Bus Terminal"]
    assert "Bus stop" in rank(index, "happo bus terminal", HAPPO, limit=1)[0].detail


# --- v1.3: generic words weigh little; every distinctive word must match ----------


def test_extra_generic_words_in_the_query_dont_block_a_match() -> None:
    entries = [entry("The Ridge Hotel & Apartments", "lodging")]
    assert names(rank(entries, "The Ridge Hotel & Apartments Hakuba", HAPPO, 5)) == [
        "The Ridge Hotel & Apartments"
    ]


def test_a_different_distinctive_word_is_not_a_match() -> None:
    entries = [entry("Hakuba Mominoki Hotel", "lodging"), entry("Hakuba Tokyu Hotel", "lodging")]
    assert rank(entries, "Hakuba Park Hotel", HAPPO, 5) == []
    assert rank(entries, "Hotel 24sweets Hakuba", HAPPO, 5) == []


def test_the_fuller_name_beats_a_bare_namesake() -> None:
    entries = [
        entry("Meteor", "stop"),
        entry("Hakuba Valley Pension Meteor Garden", "lodging"),
    ]
    assert names(rank(entries, "Hakuba Pension Meteor", HAPPO, 5))[0] == (
        "Hakuba Valley Pension Meteor Garden"
    )


def test_all_generic_queries_still_need_every_word() -> None:
    # "Hotel Hakuba" has no distinctive word, so it must not match every "… Hotel" in Hakuba
    assert names(rank(ENTRIES, "Hotel Hakuba", HAPPO, 5))[0] == "Hotel Hakuba"


def test_short_words_allow_one_typo_only() -> None:
    entries = [entry("Hakuba Powder Lodge", "lodging"), entry("Hakuba Braze Club", "lodging")]
    assert rank(entries, "The Ridge Hotel Hakuba", HAPPO, 5) == []  # ridge→lodge is 2 edits
    assert rank(entries, "Hotel Grace Hakuba", HAPPO, 5) == []  # grace→braze is 2 edits
    assert names(rank(entries, "Hakuba Powdr Lodge", HAPPO, 5)) == ["Hakuba Powder Lodge"]


def test_an_area_name_alone_is_not_a_shared_word() -> None:
    from hakuba_api.places.index import shares_distinctive_word

    assert not shares_distinctive_word(
        "Hotel Granjam Tsugaike", "Tsugaike Kogen Hotel Hakuba Berghaus"
    )
    assert shares_distinctive_word("Lift Inn Hakuba Goryu", "Lift Inn Hakuba Goryu")


# --- v1.3: English queries find katakana-only names ---------------------------------


def test_english_finds_a_katakana_only_hotel_over_a_namesake() -> None:
    entries = build_index([], [], [], []) + [
        Entry("lodging:inn", "lodging", "Hakuba Grace Inn", None, [], CORTINA, "Inn"),
        Entry(
            "lodging:grace",
            "lodging",
            "ホテルグレース白馬",
            "ホテルグレース白馬",
            [],
            HAPPO,
            "Hotel",
            readings=("hotel guresu hakuba",),
        ),
    ]
    assert names(rank(entries, "Hotel Grace Hakuba", HAPPO, 5))[0] == "ホテルグレース白馬"


def test_readings_come_from_japanese_names() -> None:
    from hakuba_api.places.models import Place

    granjam = Place(
        id="overture:1",
        name="グランジャム栂池",
        name_ja="グランジャム栂池",
        kind="hotel",
        coord=HAPPO,
        address=None,
        source="overture-snapshot",
    )
    entries = build_index([], [], [granjam], [])
    assert names(rank(entries, "Hotel Granjam Tsugaike", HAPPO, 5)) == ["グランジャム栂池"]


def test_sound_matching_never_touches_generic_words() -> None:
    entries = [
        Entry(
            "lodging:x",
            "lodging",
            "パウダーロッジ",
            None,
            [],
            HAPPO,
            "Lodge",
            readings=("pauda lodge",),
        )
    ]
    assert rank(entries, "The Ridge Hotel", HAPPO, 5) == []


def test_short_sound_keys_never_match() -> None:
    # "tokyu" and "tokiwa" both reduce to "tk": two consonants say nothing
    entries = [
        *ENTRIES,
        Entry(
            "lodging:tokiwa",
            "lodging",
            "ときわ亭",
            "ときわ亭",
            [],
            HAPPO,
            "Inn",
            readings=("tokiwa",),
        ),
    ]
    assert "ときわ亭" not in names(rank(entries, "tokyu", HAPPO, 5))


def test_a_spelling_match_beats_a_sound_match() -> None:
    entries = [
        Entry("lodging:a", "lodging", "Grace Lodge", None, [], HAPPO, "Lodge"),
        Entry(
            "lodging:b", "lodging", "グレース", "グレース", [], HAPPO, "Lodge", readings=("guresu",)
        ),
    ]
    assert names(rank(entries, "grace", HAPPO, 5))[0] == "Grace Lodge"


def test_an_area_name_puts_its_ski_resort_first() -> None:
    # Google-style prominence: "iwatake" means the resort, even with lodges nearer
    far = Coord(lat=36.72, lng=137.86)
    entries = [
        entry("Hakuba Iwatake Snow Field", "resort", far),
        entry("岩岳セブンロッジ", "lodging", HAPPO),
        entry("ABLE Hakuba GORYU", "resort", far),
        entry("Goryu Hon-dorinishi", "stop", HAPPO),
    ]
    entries[1] = dataclasses.replace(entries[1], readings=("iwatake sebun lodge",))
    assert names(rank(entries, "iwatake", HAPPO, 5))[0] == "Hakuba Iwatake Snow Field"
    assert names(rank(entries, "goryu", HAPPO, 5))[0] == "ABLE Hakuba GORYU"
    # a distinctive word keeps plain relevance: no resort boost
    assert names(rank(entries, "sebun", HAPPO, 5)) == ["岩岳セブンロッジ"]


def test_a_reading_never_counts_as_an_exact_name() -> None:
    # 乗鞍荘 reads "norikura" once 荘 is dropped; it isn't *named* Norikura
    far = Coord(lat=36.62, lng=137.85)
    entries = [
        entry("Hakuba Norikura Onsen Snow Resort", "resort", far),
        Entry("lodging:n", "lodging", "乗鞍荘", "乗鞍荘", [], HAPPO, "Inn", readings=("norikura",)),
    ]
    entries_no_boost = [entries[1], entry("Norikura Lodge", "lodging", far)]
    assert names(rank(entries, "norikura", HAPPO, 5))[0] == "Hakuba Norikura Onsen Snow Resort"
    assert names(rank(entries_no_boost, "norikura lodge", HAPPO, 5))[0] == "Norikura Lodge"
