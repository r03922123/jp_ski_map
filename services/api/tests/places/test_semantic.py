from collections.abc import Iterator

import httpx
import pytest
import respx

from hakuba_api.common.geo import Coord
from hakuba_api.places import photon, semantic
from hakuba_api.places.photon import PHOTON_URL
from hakuba_api.places.semantic import semantic_ids
from hakuba_api.places.suggest import load_index, suggest

URL = "http://127.0.0.1:9999"
NEAR = Coord(lat=36.70, lng=137.86)


@pytest.fixture
def mock() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as m:
        yield m


def test_no_server_configured_makes_no_call(
    mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("HAKUBA_SEMANTIC_URL", raising=False)
    assert semantic_ids("ramen", 5) == []
    assert not mock.calls


def test_server_hits_come_back_as_ids_in_order(
    mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HAKUBA_SEMANTIC_URL", URL)
    route = mock.get(f"{URL}/search").respond(
        json=[{"id": "x", "score": 0.9}, {"id": "y", "score": 0.8}]
    )
    assert semantic_ids("ramen", 5) == ["x", "y"]
    assert route.calls.last.request.url.params["k"] == "5"


@pytest.mark.parametrize(
    "effect",
    [httpx.ConnectError("down"), httpx.ReadTimeout("slow")],
)
def test_server_down_or_slow_falls_back_to_nothing(
    mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch, effect: Exception
) -> None:
    monkeypatch.setenv("HAKUBA_SEMANTIC_URL", URL)
    mock.get(f"{URL}/search").mock(side_effect=effect)
    assert semantic_ids("ramen", 5) == []


def test_malformed_server_reply_falls_back_to_nothing(
    mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HAKUBA_SEMANTIC_URL", URL)
    mock.get(f"{URL}/search").respond(json={"oops": 1})
    assert semantic_ids("ramen", 5) == []


def test_suggest_adds_a_semantic_only_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    ramen = next(e for e in load_index() if "ramen" in e.detail)
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: [ramen.id])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    names = [s.name for s in suggest("拉麵", NEAR, 5, use_photon=False)]
    assert ramen.name in names


def test_suggest_keeps_an_exact_lexical_hit_first(monkeypatch: pytest.MonkeyPatch) -> None:
    other = next(e for e in load_index() if "ramen" in e.detail)
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: [other.id])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    top = suggest("Hakuba Happo Bus Terminal", NEAR, 5, use_photon=False)[0]
    assert top.name == "Hakuba Happo Bus Terminal"


def test_suggest_drops_a_semantic_lodging_that_shares_no_word(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # booking_eval "absent" hotels: a look-alike hotel would be a confidently wrong answer
    tokyu = next(e for e in load_index() if e.kind == "lodging" and e.name == "Hakuba Tokyu Hotel")
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: [tokyu.id])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    assert suggest("Wadano Onsen Hotel", NEAR, 5, use_photon=False) == []


def test_suggest_drops_a_semantic_non_lodging_for_a_hotel_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ramen = next(e for e in load_index() if "ramen" in e.detail)
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: [ramen.id])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    assert suggest("Wadano Onsen Hotel", NEAR, 5, use_photon=False) == []


def test_suggest_drops_a_semantic_stop_that_shares_no_word(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # booking_eval: an absent onsen inn came back as "The Gakusui" bus stop
    stop = next(e for e in load_index() if e.id == "stop-the-gakusui")
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: [stop.id])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    assert suggest("Nakaoyama Onsen Shosenkaku", NEAR, 5, use_photon=False) == []


def test_suggest_keeps_the_lexical_order_and_appends_meaning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lexical = [s.id for s in suggest("Hotel Grace Hakuba", NEAR, 5, use_photon=False)]
    ramen = next(e for e in load_index() if "ramen" in e.detail)
    meaning = [ramen.id, *reversed(lexical)]
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: meaning)  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    ids = [s.id for s in suggest("Hotel Grace Hakuba", NEAR, 10, use_photon=False)]
    assert ids[: len(lexical)] == lexical


def test_a_repeated_semantic_id_is_added_once(monkeypatch: pytest.MonkeyPatch) -> None:
    ramen = next(e for e in load_index() if "ramen" in e.detail)
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: [ramen.id, ramen.id])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    ids = [s.id for s in suggest("拉麵", NEAR, 5, use_photon=False)]
    assert ids.count(ramen.id) == 1


def test_photon_hits_rank_before_semantic_fill(
    mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Photon fills in on too few *lexical* hits, and its name-checked hit must not be crowded
    # off the page by semantic food hits, which carry no name check
    food = [e.id for e in load_index() if e.kind == "food"][:5]
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: food)  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType]
    photon.clear_cache()
    feature = {
        "type": "Feature",
        "properties": {"osm_type": "N", "osm_id": 1, "osm_key": "amenity",
                       "osm_value": "restaurant", "name": "Zzyzx Shokudo"},
        "geometry": {"type": "Point", "coordinates": [137.86, 36.70]},
    }  # fmt: skip
    call = mock.get(PHOTON_URL).respond(json={"features": [feature]})
    out = suggest("Zzyzx Shokudo", NEAR, 5)
    assert call.call_count == 1
    assert out[0].name == "Zzyzx Shokudo" and out[0].source == "photon"
    assert len(out) == 5


def test_a_full_lexical_page_skips_the_semantic_call(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(semantic, "semantic_ids", lambda q, k: calls.append(q) or [])  # pyright: ignore[reportUnknownLambdaType, reportUnknownArgumentType, reportUnknownMemberType]
    assert len(suggest("hakuba", NEAR, 3, use_photon=False)) == 3
    assert calls == []
