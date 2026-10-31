"""Rate limits for going public (SPEC-deploy v1.5): protect the free upstreams, then the API."""

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
import respx
from fastapi.testclient import TestClient

from hakuba_api.common import ratelimit
from hakuba_api.common.ratelimit import Limits, TokenBucket, client_key
from hakuba_api.common.upstream import user_agent
from hakuba_api.main import app
from hakuba_api.places.photon import PHOTON_URL, clear_cache

PHOTON = json.loads(
    (Path(__file__).parent / "fixtures" / "photon" / "hotel_hakuba.json").read_text()
)
client = TestClient(app)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# --- token bucket ------------------------------------------------------------------


def test_bucket_allows_a_burst_then_refuses() -> None:
    bucket = TokenBucket(rate_per_s=1, burst=3, clock=Clock())

    assert [bucket.take() for _ in range(4)] == [True, True, True, False]


def test_bucket_refills_at_its_rate_up_to_the_burst() -> None:
    clock = Clock()
    bucket = TokenBucket(rate_per_s=2, burst=2, clock=clock)
    assert bucket.take() and bucket.take() and not bucket.take()

    clock.now += 0.5  # one token back
    assert bucket.take() and not bucket.take()

    clock.now += 60  # never more than the burst
    assert [bucket.take() for _ in range(3)] == [True, True, False]


def test_bucket_says_when_the_next_token_is_due() -> None:
    clock = Clock()
    bucket = TokenBucket(rate_per_s=0.5, burst=1, clock=clock)
    bucket.take()

    assert bucket.retry_after_s() == pytest.approx(2.0)


# --- who is the client -------------------------------------------------------------


def test_reached_directly_the_socket_peer_is_the_client() -> None:
    assert client_key("6.6.6.6", "10.0.0.5", trusted_hops=0) == "10.0.0.5"


def test_unconfigured_means_no_per_client_limit() -> None:
    # behind Next the peer is always 127.0.0.1: limiting it would lump everyone together
    assert client_key("203.0.113.7", "127.0.0.1", trusted_hops=None) is None
    assert Limits.from_env().trusted_hops is None  # TRUSTED_PROXY_HOPS unset in tests


def test_the_hop_our_proxy_appended_is_the_client_and_earlier_hops_are_ignored() -> None:
    # a client forged "6.6.6.6"; Funnel appended the real address after it
    assert client_key("6.6.6.6, 203.0.113.7", "127.0.0.1", trusted_hops=1) == "203.0.113.7"
    assert client_key(" 203.0.113.7 ", "127.0.0.1", trusted_hops=1) == "203.0.113.7"


def test_a_missing_proxy_hop_means_unknown_not_everyone() -> None:
    # Next's rewrite passes X-Forwarded-For through but never adds one (checked 2026-10-31)
    assert client_key(None, "127.0.0.1", trusted_hops=1) is None
    assert client_key("203.0.113.7", "127.0.0.1", trusted_hops=2) is None


# --- per-client limit on the API ------------------------------------------------------


@pytest.fixture
def tight(monkeypatch: pytest.MonkeyPatch) -> Iterator[Limits]:
    limits = Limits(client_rate_per_s=0.01, client_burst=3, trusted_hops=1)
    monkeypatch.setattr(ratelimit, "LIMITS", limits)
    yield limits


def test_a_client_over_its_budget_gets_429_with_retry_after(tight: Limits) -> None:
    me = {"X-Forwarded-For": "203.0.113.7"}
    codes = [client.get("/api/resorts", headers=me).status_code for _ in range(4)]

    assert codes == [200, 200, 200, 429]
    response = client.get("/api/resorts", headers=me)
    assert response.json() == {"error": "rate_limited"}
    assert int(response.headers["retry-after"]) >= 1


def test_clients_have_separate_budgets_and_forged_hops_dont_help(tight: Limits) -> None:
    for i in range(3):
        client.get("/api/resorts", headers={"X-Forwarded-For": f"9.9.9.{i}, 203.0.113.7"})

    assert (
        client.get("/api/resorts", headers={"X-Forwarded-For": "1.1.1.1, 203.0.113.7"}).status_code
        == 429
    )
    assert client.get("/api/resorts", headers={"X-Forwarded-For": "203.0.113.8"}).status_code == 200


def test_health_is_never_limited_and_unknown_clients_are_not_lumped_together(
    tight: Limits,
) -> None:
    assert all(client.get("/api/health").status_code == 200 for _ in range(5))
    assert all(client.get("/api/resorts").status_code == 200 for _ in range(5))


# --- global budgets per upstream ----------------------------------------------------


@pytest.fixture
def photon() -> Iterator[respx.MockRouter]:
    clear_cache()
    with respx.mock(assert_all_called=False) as mock:
        mock.get(PHOTON_URL).respond(json=PHOTON)
        yield mock
    clear_cache()


def test_photon_over_budget_is_503_upstream_busy(
    photon: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", Limits(upstream={"photon": (0.01, 1)}))

    assert client.get("/api/places/search", params={"q": "hotel hakuba"}).status_code == 200
    busy = client.get("/api/places/search", params={"q": "hotel goryu"})

    assert busy.status_code == 503
    assert busy.json() == {"error": "upstream_busy", "source": "photon"}
    assert photon.calls.call_count == 1


def test_a_cache_hit_spends_no_upstream_budget(
    photon: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", Limits(upstream={"photon": (0.01, 1)}))

    codes = [
        client.get("/api/places/search", params={"q": "hotel hakuba"}).status_code for _ in range(3)
    ]

    assert codes == [200, 200, 200]


def test_search_as_you_type_falls_back_to_local_hits_when_photon_is_busy(
    photon: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", Limits(upstream={"photon": (0.01, 0)}))

    response = client.get("/api/places/suggest", params={"q": "zzqx hakuba"})

    assert response.status_code == 200
    assert photon.calls.call_count == 0


def test_google_short_links_are_budgeted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", Limits(upstream={"gmaps-link": (0.01, 0)}))

    with respx.mock(assert_all_called=False) as mock:
        route = mock.head("https://maps.app.goo.gl/abc").respond(302, headers={"location": "x"})
        response = client.get("/api/places/search", params={"q": "https://maps.app.goo.gl/abc"})

    assert response.status_code == 503
    assert response.json()["source"] == "gmaps-link"
    assert route.call_count == 0


# --- identify ourselves upstream -----------------------------------------------------


def test_user_agent_names_the_public_url_when_deployed() -> None:
    assert user_agent("https://hakuba-map.example.ts.net") == (
        "hakuba-ski-map/0.1 (personal trip planner; https://hakuba-map.example.ts.net)"
    )
    assert "local dev" in user_agent(None)
