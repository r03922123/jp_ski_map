"""Ask Maps loop and endpoint, with a fake Anthropic client and respx: no network, no spend."""

import asyncio
import json
from collections.abc import Iterator
from typing import Any, cast

import anthropic
import httpx
import httpx2
import pytest
import respx
from anthropic import AsyncAnthropic
from anthropic.types import Message

from hakuba_mcp import ask, remote
from hakuba_mcp import server as s

API = s.API_URL
SITE = "https://ski.example"
LAWSON = {"id": "osm:node/1", "name": "Lawson", "coord": {"lat": 36.70089, "lng": 137.84685}}
SEVEN = {"id": "osm:node/2", "name": "7-Eleven", "coord": {"lat": 36.69, "lng": 137.86}}


def msg(content: list[dict[str, Any]], stop: str = "end_turn") -> Message:
    return Message.model_validate(
        {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": ask.MODEL,
            "content": content,
            "stop_reason": stop,
            "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }
    )


def tool_use(name: str, args: dict[str, Any], id: str = "tu_1") -> Message:
    return msg([{"type": "tool_use", "id": id, "name": name, "input": args}], stop="tool_use")


def cite(source: str, title: str) -> dict[str, Any]:
    return {
        "type": "search_result_location",
        "cited_text": "{}",
        "source": source,
        "title": title,
        "search_result_index": 0,
        "start_block_index": 0,
        "end_block_index": 1,
    }


class FakeMessages:
    def __init__(self, replies: list[Message | Exception]) -> None:
        self.replies = replies
        self.requests: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Message:
        self.requests.append(kwargs | {"messages": list(kwargs["messages"])})  # snapshot
        reply = self.replies[min(len(self.requests), len(self.replies)) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply


class FakeClient:
    def __init__(self, replies: list[Message | Exception]) -> None:
        self.messages = FakeMessages(replies)


def run(fake: FakeClient, question: str = "Convenience store near Hakuba station?") -> Any:
    return asyncio.run(ask.answer(cast(AsyncAnthropic, fake), question, None))


def tool_results(request: dict[str, Any]) -> list[dict[str, Any]]:
    return request["messages"][-1]["content"]


def api_error(cls: type[anthropic.APIStatusError], status: int, body: dict[str, Any]) -> Exception:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(status, json=body, request=request)
    return cls(body["error"]["message"], response=response, body=body)


@respx.mock
def test_cited_place_becomes_a_pin_with_its_coord() -> None:
    respx.get(f"{API}/api/places/suggest").respond(json=[LAWSON, SEVEN])
    fake = FakeClient(
        [
            tool_use("search_place", {"query": "Lawson"}),
            msg(
                [
                    {
                        "type": "text",
                        "text": "Lawson is open 24/7.",
                        "citations": [cite("hakuba:place/osm:node/1", "Lawson")],
                    }
                ]
            ),
        ]
    )
    out = run(fake)
    assert out["pins"] == [
        {
            "source": "hakuba:place/osm:node/1",
            "kind": "place",
            "id": "osm:node/1",
            "title": "Lawson",
            "coord": "36.70089,137.84685",
        }
    ]
    assert out["answer"] == [
        {"text": "Lawson is open 24/7.", "sources": ["hakuba:place/osm:node/1"]}
    ]
    # each list item went back as its own citable search_result
    (result,) = tool_results(fake.messages.requests[1])
    assert result["is_error"] is False
    assert [b["type"] for b in result["content"]] == ["search_result", "search_result"]
    assert result["content"][0]["source"] == "hakuba:place/osm:node/1"
    assert result["content"][0]["citations"] == {"enabled": True}
    assert json.loads(result["content"][1]["content"][0]["text"])["name"] == "7-Eleven"


@respx.mock
def test_uncited_or_unknown_place_is_not_pinned() -> None:
    respx.get(f"{API}/api/places/suggest").respond(json=[LAWSON, SEVEN])
    fake = FakeClient(
        [
            tool_use("search_place", {"query": "konbini"}),
            msg(
                [
                    # 7-Eleven named in prose with no citation; a source no tool returned
                    {"type": "text", "text": "Try 7-Eleven or Family Mart.", "citations": None},
                    {
                        "type": "text",
                        "text": "Family Mart",
                        "citations": [cite("hakuba:place/osm:node/999", "Family Mart")],
                    },
                ]
            ),
        ]
    )
    out = run(fake)
    assert out["pins"] == []
    assert [seg["sources"] for seg in out["answer"]] == [[], []]


@respx.mock
def test_bus_options_and_resorts_are_cited_by_their_ids() -> None:
    respx.get(f"{API}/api/bus/options").respond(
        json={
            "status": "ok",
            "basis": "published",
            "resorts": [
                {
                    "resortId": "happo-one",
                    "options": [
                        {
                            "boardStopId": "hakuba-st",
                            "boardStopName": "JR Hakuba Station",
                            "firstStopName": "JR Hakuba Station",
                            "walkS": 60,
                            "departsAt": "2026-12-20T08:14:00+09:00",
                            "arrivesAt": "2026-12-20T08:30:00+09:00",
                            "rideS": 960,
                            "routeName": "Happo Line",
                            "timed": True,
                        }
                    ],
                }
            ],
        }
    )
    fake = FakeClient(
        [
            tool_use("next_buses", {"origin": "36.69,137.86"}),
            msg(
                [
                    {
                        "type": "text",
                        "text": "08:14",
                        "citations": [cite("hakuba:stop/hakuba-st", "JR Hakuba Station")],
                    }
                ]
            ),
        ]
    )
    out = run(fake)
    assert [(p["kind"], p["id"]) for p in out["pins"]] == [("stop", "hakuba-st")]
    head, option = tool_results(fake.messages.requests[1])[0]["content"]
    assert head["type"] == "text" and json.loads(head["text"])["status"] == "ok"
    assert json.loads(option["content"][0]["text"])["resortId"] == "happo-one"


@respx.mock
def test_tool_error_goes_back_as_is_error() -> None:
    respx.get(f"{API}/api/places/suggest").respond(status_code=503, json={"detail": "busy"})
    fake = FakeClient(
        [
            tool_use("search_place", {"query": "Lawson"}),
            msg([{"type": "text", "text": "The place search is down.", "citations": None}]),
        ]
    )
    out = run(fake)
    (result,) = tool_results(fake.messages.requests[1])
    assert result["is_error"] is True
    assert "Hakuba API 503" in result["content"]
    assert out["pins"] == []


def test_invalid_arguments_go_back_as_is_error() -> None:
    fake = FakeClient(
        [
            tool_use("route", {"mode": "fly", "origin": "1,2", "destination": "3,4"}),
            msg([{"type": "text", "text": "Sorry.", "citations": None}]),
        ]
    )
    run(fake)
    (result,) = tool_results(fake.messages.requests[1])
    assert result["is_error"] is True


@respx.mock
def test_loop_stops_after_six_tool_calls_and_two_more_turns() -> None:
    api = respx.get(f"{API}/api/places/suggest").respond(json=[LAWSON])
    # a model that never stops asking for tools
    fake = FakeClient([tool_use("search_place", {"query": "x"})])
    out = run(fake)
    assert api.call_count == ask.MAX_TOOL_CALLS == 6
    assert len(fake.messages.requests) == ask.MAX_TOOL_CALLS + ask.MAX_TURNS_AFTER_CAP
    (last,) = tool_results(fake.messages.requests[-1])
    assert last["is_error"] is True and "budget" in last["content"]
    choices = [r["tool_choice"]["type"] for r in fake.messages.requests]
    assert choices == ["auto"] * 6 + ["none"] * 2  # the budget's spent: answer now
    assert out["toolCalls"] == 6
    assert out["pins"] == []
    assert out["answer"] == [{"text": ask.NO_ANSWER, "sources": []}]  # never a blank sheet


def test_max_tokens_without_text_says_so() -> None:
    fake = FakeClient([msg([{"type": "thinking", "thinking": "", "signature": "s"}], "max_tokens")])
    assert run(fake)["answer"] == [{"text": ask.NO_ANSWER, "sources": []}]


def test_request_shape_is_cached_and_capped() -> None:
    fake = FakeClient([msg([{"type": "text", "text": "Hi", "citations": None}])])
    asyncio.run(ask.answer(cast(AsyncAnthropic, fake), "hi", "Hakuba Tokyu Hotel"))
    (req,) = fake.messages.requests
    assert req["model"] == "claude-haiku-5-5"
    assert req["max_tokens"] == 1024
    assert req["output_config"] == {"effort": "low"}
    assert req["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert req["tools"][-1]["cache_control"] == {"type": "ephemeral"}
    assert len(req["tools"]) == 6
    # the user's start stays in the user turn; local time follows as a system message
    assert req["messages"][0] == {"role": "user", "content": "hi\n\n(My start: Hakuba Tokyu Hotel)"}
    assert req["messages"][1]["role"] == "system"
    assert "Local time" in req["messages"][1]["content"]


# ---- HTTP: POST /ask through remote.app -------------------------------------------------------


@pytest.fixture(autouse=True)
def site(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("PUBLIC_URL", f"{SITE}/")
    for name in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        monkeypatch.delenv(name, raising=False)
    ask._buckets.clear()  # pyright: ignore[reportPrivateUsage]
    yield
    ask._buckets.clear()  # pyright: ignore[reportPrivateUsage]


def use_client(monkeypatch: pytest.MonkeyPatch, fake: FakeClient | None) -> None:
    monkeypatch.setattr(ask, "make_client", lambda: cast(AsyncAnthropic, fake))


def post(body: object, origin: str | None = SITE, ip: str = "203.0.113.5") -> httpx.Response:
    headers = {"content-type": "application/json", "x-forwarded-for": ip}
    if origin:
        headers["origin"] = origin

    async def go() -> httpx.Response:
        transport = httpx.ASGITransport(app=remote.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://x.test") as c:
            return await c.post("/ask", content=json.dumps(body), headers=headers)

    return asyncio.run(asyncio.wait_for(go(), 5))


def test_endpoint_answers_with_pins(monkeypatch: pytest.MonkeyPatch) -> None:
    use_client(monkeypatch, FakeClient([msg([{"type": "text", "text": "Hi", "citations": None}])]))
    r = post({"question": "hi"})
    assert r.status_code == 200
    assert r.json() == {"answer": [{"text": "Hi", "sources": []}], "pins": [], "toolCalls": 0}


@pytest.mark.parametrize("origin", [None, "https://evil.example", "https://ski.example.evil"])
def test_other_origins_are_refused(monkeypatch: pytest.MonkeyPatch, origin: str | None) -> None:
    fake = FakeClient([])
    use_client(monkeypatch, fake)
    assert post({"question": "hi"}, origin=origin).status_code == 403
    assert fake.messages.requests == []


def test_no_origin_configured_refuses_all(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PUBLIC_URL")
    use_client(monkeypatch, FakeClient([]))
    assert post({"question": "hi"}).status_code == 403


def test_vercel_deploy_url_is_its_own_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL_URL", "preview-abc.vercel.app")
    use_client(monkeypatch, FakeClient([msg([{"type": "text", "text": "Hi", "citations": None}])]))
    assert post({"question": "hi"}, origin="https://preview-abc.vercel.app").status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {"question": "x" * 501},
        {"question": ""},
        {"question": 3},
        ["hi"],
        {"question": "hi", "start": 1},
    ],
)
def test_bad_questions_are_refused_before_the_model(
    monkeypatch: pytest.MonkeyPatch, body: object
) -> None:
    fake = FakeClient([])
    use_client(monkeypatch, fake)
    assert post(body).status_code == 400
    assert fake.messages.requests == []


def test_500_characters_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    use_client(monkeypatch, FakeClient([msg([{"type": "text", "text": "ok", "citations": None}])]))
    assert post({"question": "x" * 500}).status_code == 200


def test_twenty_questions_per_ip_per_day(monkeypatch: pytest.MonkeyPatch) -> None:
    now = [0.0]
    monkeypatch.setattr(ask, "clock", lambda: now[0])
    use_client(monkeypatch, FakeClient([msg([{"type": "text", "text": "ok", "citations": None}])]))
    assert all(post({"question": "hi"}).status_code == 200 for _ in range(20))
    assert post({"question": "hi"}).status_code == 429
    assert post({"question": "hi"}, ip="198.51.100.7").status_code == 200  # another client
    now[0] += 86400 / 20  # one question's worth of refill
    assert post({"question": "hi"}).status_code == 200


SPEND_400 = {
    "type": "error",
    "error": {
        "type": "invalid_request_error",
        "message": "You have reached your specified workspace API usage limits. "
        "You will regain access on 2026-12-01 at 00:00 UTC.",
    },
}
SPEND_429 = {
    "type": "error",
    "error": {
        "type": "rate_limit_error",
        "message": "You have reached your API usage limits: ...",
        "details": {"error_code": "enforced_spend_limit_reached"},
    },
}


@pytest.mark.parametrize(
    "error",
    [
        api_error(anthropic.BadRequestError, 400, SPEND_400),
        api_error(anthropic.RateLimitError, 429, SPEND_429),
    ],
)
def test_spend_limit_says_ask_is_paused(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    use_client(monkeypatch, FakeClient([error]))
    r = post({"question": "hi"})
    assert r.status_code == 503
    assert r.json() == {"error": ask.PAUSED}


def test_other_api_errors_are_not_called_a_spend_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    other = {"type": "error", "error": {"type": "invalid_request_error", "message": "bad"}}
    use_client(monkeypatch, FakeClient([api_error(anthropic.BadRequestError, 400, other)]))
    r = post({"question": "hi"})
    assert r.status_code == 502
    assert r.json()["error"] != ask.PAUSED


def test_no_key_means_not_set_up(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert post({"question": "hi"}).status_code == 503
