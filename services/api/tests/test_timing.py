"""Server-Timing: how long each real upstream call took, per request."""

import asyncio
import json
import logging
import re
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from starlette.types import Message, Receive, Scope, Send

from hakuba_api.common import ratelimit, timing
from hakuba_api.common.ratelimit import Limits
from hakuba_api.common.timing import ServerTiming, timed
from hakuba_api.main import MAX_BODY_BYTES, app
from hakuba_api.places import photon
from hakuba_api.places.photon import PHOTON_URL
from hakuba_api.snow.openmeteo import OPEN_METEO_URL
from hakuba_api.snow.router import clear_cache

FIXTURE = Path(__file__).parent / "fixtures" / "openmeteo" / "winter_week.json"
VALHALLA = "http://localhost:8002"
SEMANTIC = "http://semantic.test"
ROUTE_PARAMS = {"mode": "drive", "from": "36.70,137.86", "to": "36.69,137.85"}
MANEUVER = {
    "type": 1,
    "instruction": "Go.",
    "length": 1.0,
    "time": 60.0,
    "begin_shape_index": 0,
    "end_shape_index": 0,
}
ROUTE = {
    "trip": {
        "summary": {"time": 60.0, "length": 1.0},
        "legs": [{"shape": "", "maneuvers": [MANEUVER]}],
    }
}
NO_BUDGET = Limits(upstream={"open-meteo": (0.01, 0)})  # our own budget for it is spent
SHORT_LINK = "https://maps.app.goo.gl/AbCdEf123"


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv("VALHALLA_TILES", raising=False)
    monkeypatch.setenv("VALHALLA_URL", VALHALLA)
    monkeypatch.delenv("HAKUBA_SEMANTIC_URL", raising=False)
    clear_cache()
    photon.clear_cache()
    yield
    clear_cache()
    photon.clear_cache()


def names(header: str) -> list[str]:
    return re.findall(r"([\w-]+);dur=", header)


def logged(caplog: pytest.LogCaptureFixture) -> list[str]:
    """This module's own log lines; other loggers warn too (a failed Photon fallback)."""
    return [r.getMessage() for r in caplog.records if r.name == timing.__name__]


# --- what the header lists -----------------------------------------------------


def test_every_response_carries_its_total_time() -> None:
    response = TestClient(app).get("/api/health")

    assert names(response.headers["server-timing"]) == ["total"]


def test_an_upstream_call_made_in_the_endpoints_thread_is_listed() -> None:
    with respx.mock() as upstream:
        upstream.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        first = TestClient(app).get("/api/snow")
        cached = TestClient(app).get("/api/snow")

    took = {
        name: float(ms)
        for name, ms in re.findall(r"([\w-]+);dur=([\d.]+)", first.headers["server-timing"])
    }
    assert list(took) == ["open-meteo", "total"]
    assert took["open-meteo"] <= took["total"]
    # a cache hit called nothing, and says so
    assert names(cached.headers["server-timing"]) == ["total"]


def test_a_photon_call_is_listed() -> None:
    with respx.mock() as upstream:
        upstream.get(PHOTON_URL).respond(json={"features": []})
        response = TestClient(app).get("/api/places/search", params={"q": "zz-nothing"})

    assert names(response.headers["server-timing"]) == ["photon", "total"]


def test_a_valhalla_call_is_listed() -> None:
    with respx.mock() as upstream:
        upstream.post(f"{VALHALLA}/route").respond(json=ROUTE)
        response = TestClient(app).get("/api/route", params=ROUTE_PARAMS)

    assert response.status_code == 200
    assert names(response.headers["server-timing"]) == ["valhalla", "total"]


def test_a_short_link_lookup_is_listed() -> None:
    with respx.mock() as upstream:
        upstream.head("https://maps.app.goo.gl/AbCdEf123").respond(
            302, headers={"location": "https://www.google.com/maps/@36.7,137.86,15z"}
        )
        response = TestClient(app).get(
            "/api/places/search", params={"q": "https://maps.app.goo.gl/AbCdEf123"}
        )

    assert names(response.headers["server-timing"]) == ["gmaps-link", "total"]


def test_a_semantic_call_is_listed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAKUBA_SEMANTIC_URL", SEMANTIC)
    with respx.mock() as upstream:
        upstream.get(f"{SEMANTIC}/search").respond(json=[])
        upstream.get(PHOTON_URL).respond(json={"features": []})
        response = TestClient(app).get("/api/places/suggest", params={"q": "zz-nothing"})

    assert names(response.headers["server-timing"]) == ["semantic", "photon", "total"]


def test_a_failed_call_is_still_timed() -> None:
    with respx.mock() as upstream:
        upstream.get(OPEN_METEO_URL).respond(503)
        response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert names(response.headers["server-timing"]) == ["open-meteo", "total"]


def test_a_call_that_never_answers_is_still_timed() -> None:
    # the case the header is for: the time spent waiting on a request that raised
    with respx.mock() as upstream:
        upstream.get(OPEN_METEO_URL).mock(side_effect=httpx.ConnectTimeout("no answer"))
        response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    assert names(response.headers["server-timing"]) == ["open-meteo", "total"]


# --- a call that never happened is not listed -----------------------------------


def test_a_call_our_own_budget_refused_is_not_listed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", NO_BUDGET)
    with respx.mock(assert_all_called=False) as upstream:
        open_meteo = upstream.get(OPEN_METEO_URL).respond(json=json.loads(FIXTURE.read_text()))
        response = TestClient(app).get("/api/snow")

    assert response.status_code == 503
    assert not open_meteo.called
    assert names(response.headers["server-timing"]) == ["total"]


@pytest.mark.parametrize(
    ("source", "params"), [("photon", {"q": "zz-nothing"}), ("gmaps-link", {"q": SHORT_LINK})]
)
def test_a_refused_photon_or_short_link_call_is_not_listed(
    source: str, params: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ratelimit, "LIMITS", Limits(upstream={source: (0.01, 0)}))
    with respx.mock(assert_all_called=False) as upstream:
        sent = [
            upstream.get(PHOTON_URL).respond(json={"features": []}),
            upstream.head(SHORT_LINK).respond(302, headers={"location": "https://www.google.com/"}),
        ]
        response = TestClient(app).get("/api/places/search", params=params)

    assert response.status_code == 503
    assert not any(route.called for route in sent)
    assert names(response.headers["server-timing"]) == ["total"]


def test_a_photon_cache_hit_is_not_listed() -> None:
    with respx.mock() as upstream:
        upstream.get(PHOTON_URL).respond(json={"features": []})
        first = TestClient(app).get("/api/places/search", params={"q": "zz-nothing"})
        again = TestClient(app).get("/api/places/search", params={"q": "zz-nothing"})

    assert names(first.headers["server-timing"]) == ["photon", "total"]
    assert names(again.headers["server-timing"]) == ["total"]


def test_a_short_link_that_is_never_fetched_is_not_listed() -> None:
    with respx.mock(assert_all_called=False) as upstream:
        google = upstream.head(url__regex=r".*goo\.gl.*").respond(
            302, headers={"location": "https://www.google.com/maps/@36.7,137.86,15z"}
        )
        # http, not https: resolve_short_link returns None before any request
        response = TestClient(app).get(
            "/api/places/search", params={"q": "http://maps.app.goo.gl/AbCdEf123"}
        )

    assert response.status_code == 200
    assert not google.called
    assert names(response.headers["server-timing"]) == ["total"]


# --- every answer is timed, and requests don't share entries --------------------


def test_a_413_and_a_429_are_timed_too(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    too_big = client.post("/api/matrix", content=b"x" * (MAX_BODY_BYTES + 1))
    assert too_big.status_code == 413
    assert names(too_big.headers["server-timing"]) == ["total"]

    monkeypatch.setattr(ratelimit, "LIMITS", Limits(client_burst=1, trusted_hops=0))
    client.get("/api/resorts")
    limited = client.get("/api/resorts")
    assert limited.status_code == 429
    assert names(limited.headers["server-timing"]) == ["total"]


def slow(ms: float, payload: Any) -> Callable[[httpx.Request], httpx.Response]:
    def answer(_: httpx.Request) -> httpx.Response:
        time.sleep(ms / 1000)  # in the endpoint's worker thread, so the requests overlap
        return httpx.Response(200, json=payload)

    return answer


def test_overlapping_requests_keep_their_own_entries() -> None:
    async def three_at_once() -> tuple[httpx.Response, httpx.Response, httpx.Response]:
        transport = httpx.ASGITransport(app=app)  # one event loop, one task per request
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await asyncio.gather(
                client.get("/api/snow"),
                client.get("/api/places/search", params={"q": "zz-nothing"}),
                client.get("/api/health"),
            )

    with respx.mock() as upstream:
        upstream.get(OPEN_METEO_URL).mock(side_effect=slow(150, json.loads(FIXTURE.read_text())))
        upstream.get(PHOTON_URL).mock(side_effect=slow(50, {"features": []}))
        snow, search, health = asyncio.run(three_at_once())

    assert names(snow.headers["server-timing"]) == ["open-meteo", "total"]
    assert names(search.headers["server-timing"]) == ["photon", "total"]
    assert names(health.headers["server-timing"]) == ["total"]


def test_a_response_that_starts_without_headers_still_gets_the_header() -> None:
    sent: list[Message] = []

    async def bare(_scope: Scope, _receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": 204})  # ASGI allows no headers
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> Message:
        return {"type": "http.request"}

    async def collect(message: Message) -> None:
        sent.append(message)

    scope: Scope = {"type": "http", "method": "GET", "path": "/"}
    asyncio.run(ServerTiming(bare)(scope, receive, collect))

    assert [name for name, _ in sent[0]["headers"]] == [b"server-timing"]


def test_timed_outside_a_request_does_nothing() -> None:
    with timed("valhalla"):  # scripts and tests call the clients with no request around
        pass


# --- the log line, and what never reaches the header or the log ------------------


def test_the_header_never_carries_the_query_text() -> None:
    with respx.mock() as upstream:
        upstream.get(PHOTON_URL).respond(json={"features": []})
        response = TestClient(app).get("/api/places/suggest", params={"q": "secret-hotel-name"})

    assert names(response.headers["server-timing"]) == ["photon", "total"]
    assert "secret" not in response.headers["server-timing"]


def test_a_slow_request_is_logged_with_its_breakdown_and_no_query(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(timing, "SLOW_MS", 0.0)  # every request counts as slow
    with respx.mock() as upstream, caplog.at_level(logging.WARNING, logger=timing.__name__):
        upstream.get(PHOTON_URL).respond(json={"features": []})
        TestClient(app).get("/api/places/suggest", params={"q": "secret-hotel-name"})

    [message] = logged(caplog)
    assert "GET '/api/places/suggest'" in message and "status=200" in message
    assert "photon;dur=" in message and "total;dur=" in message
    assert "secret" not in message


def test_a_5xx_is_logged_even_when_fast(caplog: pytest.LogCaptureFixture) -> None:
    with respx.mock() as upstream, caplog.at_level(logging.WARNING, logger=timing.__name__):
        upstream.get(OPEN_METEO_URL).respond(503)
        response = TestClient(app).get("/api/snow")

    assert response.status_code == 502
    [message] = logged(caplog)
    assert "GET '/api/snow' status=502" in message
    assert "open-meteo;dur=" in message


def test_an_unhandled_error_is_logged_with_its_breakdown(caplog: pytest.LogCaptureFixture) -> None:
    with respx.mock() as upstream, caplog.at_level(logging.WARNING, logger=timing.__name__):
        # 200 with a body the client does not expect: KeyError, no handler, a plain 500.
        # That answer is written outside every middleware, so it carries no header.
        route = upstream.post(f"{VALHALLA}/route").respond(json={"unexpected": True})
        response = TestClient(app, raise_server_exceptions=False).get(
            "/api/route", params=ROUTE_PARAMS
        )

    assert route.called  # the 500 is from that answer, not from a request nobody faked
    assert response.status_code == 500
    [message] = logged(caplog)
    assert "status=500" in message
    assert "valhalla;dur=" in message and "total;dur=" in message


def test_a_fast_successful_request_is_not_logged(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING, logger=timing.__name__):
        TestClient(app).get("/api/health")

    assert logged(caplog) == []


def test_a_path_with_a_line_break_cannot_forge_a_log_line(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(timing, "SLOW_MS", 0.0)
    with caplog.at_level(logging.WARNING, logger=timing.__name__):
        response = TestClient(app).get("/api/x%0AFORGED line")

    assert response.status_code == 404
    [message] = logged(caplog)
    assert "\n" not in message and "FORGED" in message  # kept, but escaped on one line
