from collections.abc import Iterator

import httpx
import pytest
import respx

from hakuba_api.common.geo import Coord
from hakuba_api.places import semantic
from hakuba_api.places.semantic import rrf_merge, semantic_ids
from hakuba_api.places.suggest import load_index, suggest

URL = "http://127.0.0.1:9999"
NEAR = Coord(lat=36.70, lng=137.86)


@pytest.fixture
def mock() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as m:
        yield m


def test_rrf_puts_an_item_both_lists_agree_on_first() -> None:
    assert rrf_merge(["a", "b"], ["b", "c"]) == ["b", "a", "c"]


def test_rrf_breaks_ties_in_favour_of_the_lexical_list() -> None:
    # both ranked first in one list only: same RRF score, lexical wins
    assert rrf_merge(["lex"], ["sem"]) == ["lex", "sem"]


def test_rrf_with_an_empty_semantic_list_keeps_lexical_order() -> None:
    assert rrf_merge(["a", "b", "c"], []) == ["a", "b", "c"]


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
