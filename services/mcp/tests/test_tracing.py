import asyncio
import json
from collections.abc import Iterator

import httpx
import pytest
import respx
from langfuse import Langfuse
from mcp.server.mcpserver.exceptions import ToolError
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from hakuba_mcp import remote, tracing
from hakuba_mcp import server as s

API = s.API_URL
EXPORTER = InMemorySpanExporter()
# one client for the module: the SDK keeps one tracer per public key, so a second client with the
# same key would send its spans to the first one's exporter. Its own provider, as in production.
CLIENT = Langfuse(
    public_key="pk-lf-test",
    secret_key="sk-lf-test",
    base_url="http://127.0.0.1:9",
    span_exporter=EXPORTER,
    tracer_provider=TracerProvider(),
)
COORD = "36.69830,137.86190"  # a friend's hotel, say
CLIENT_TRACE = "0af7651916cd43dd8448eb211c80319c"


@pytest.fixture
def spans(monkeypatch: pytest.MonkeyPatch) -> Iterator[InMemorySpanExporter]:
    """Tracing on, with spans kept in memory instead of sent to Langfuse."""
    monkeypatch.setattr(tracing, "client", lambda: CLIENT)
    EXPORTER.clear()
    yield EXPORTER


def everything(span: ReadableSpan) -> str:
    """All a span would send: attributes, status and events."""
    events = [(e.name, dict(e.attributes or {})) for e in span.events]
    return str((dict(span.attributes or {}), span.status.description, events))


@respx.mock
def test_each_tool_call_is_one_tool_observation_without_its_arguments(
    spans: InMemorySpanExporter,
) -> None:
    respx.get(f"{API}/api/places/suggest").respond(json=[])
    asyncio.run(s.mcp.call_tool("search_place", {"query": "Hotel Secret", "limit": 3}))
    tracing.flush()

    (span,) = spans.get_finished_spans()
    attrs = dict(span.attributes or {})
    assert span.name == "search_place"
    assert attrs["langfuse.observation.type"] == "tool"
    assert attrs["langfuse.observation.metadata.args"] == '["limit","query"]'
    assert "Hotel Secret" not in everything(span)


@respx.mock
def test_a_failed_tool_call_is_marked_error_without_its_message(
    spans: InMemorySpanExporter,
) -> None:
    respx.get(f"{API}/api/rank").respond(422, json={"detail": f"bad origin {COORD}"})
    with pytest.raises(ToolError):
        asyncio.run(s.mcp.call_tool("rank_resorts", {"origin": COORD}))
    tracing.flush()

    (span,) = spans.get_finished_spans()
    attrs = dict(span.attributes or {})
    assert attrs["langfuse.observation.level"] == "ERROR"
    assert attrs["langfuse.observation.status_message"] == "ToolError; Hakuba API 422"
    assert COORD not in everything(span)


def test_over_http_a_bad_call_is_one_span_with_no_values_and_its_own_trace(
    spans: InMemorySpanExporter, monkeypatch: pytest.MonkeyPatch
) -> None:
    # missing destination: the SDK's error message quotes every argument the agent passed
    token = "t" * 40
    monkeypatch.setenv("HAKUBA_MCP_TOKEN", token)
    call = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "route",
            "arguments": {"origin": COORD, "Hotel Secret": 1},
            "_meta": {
                "traceparent": f"00-{CLIENT_TRACE}-b7ad6b7169203331-01",
                "baggage": "langfuse_user_id=evil",
            },
        },
    }

    async def go() -> httpx.Response:
        transport = httpx.ASGITransport(app=remote.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://x.test") as c:
            headers = {
                "Accept": "application/json, text/event-stream",
                "Content-Type": "application/json",
            }
            return await c.post(f"/mcp/{token}", content=json.dumps(call), headers=headers)

    r = asyncio.run(asyncio.wait_for(go(), 5))
    assert r.json()["result"]["isError"]

    (span,) = spans.get_finished_spans()  # the MCP SDK's own span is not exported
    attrs = dict(span.attributes or {})
    assert attrs["langfuse.observation.status_message"] == (
        "ToolError; invalid arguments: destination"
    )
    assert attrs["langfuse.observation.metadata.args"] == '["origin"]'
    for secret in (COORD, "Hotel Secret", "evil"):
        assert secret not in everything(span)
    assert span.context is not None
    assert format(span.context.trace_id, "032x") != CLIENT_TRACE


def test_an_unknown_tool_name_is_not_kept(spans: InMemorySpanExporter) -> None:
    with pytest.raises(ToolError):
        asyncio.run(s.mcp.call_tool("Hotel Secret", {}))
    tracing.flush()
    (span,) = spans.get_finished_spans()
    assert span.name == "unknown_tool"
    assert "Hotel Secret" not in everything(span)


def test_no_keys_means_no_client_and_tools_still_work() -> None:
    assert tracing.client() is None  # conftest removes the keys
    with respx.mock:
        respx.get(f"{API}/api/places/suggest").respond(json=[])
        asyncio.run(s.mcp.call_tool("search_place", {"query": "x"}))
    tracing.flush()  # a no-op, not an error


def test_the_real_client_keeps_its_spans_off_the_global_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # on the global provider the MCP SDK's own span (with the request's _meta) would be sent too
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-own-provider")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-own-provider")
    monkeypatch.setenv("LANGFUSE_BASE_URL", "http://127.0.0.1:9")  # nothing is sent: no spans
    monkeypatch.setattr(tracing, "_client", None)
    lf = tracing.client()
    assert lf is not None
    assert not isinstance(otel_trace.get_tracer_provider(), TracerProvider)
    lf.shutdown()
