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
