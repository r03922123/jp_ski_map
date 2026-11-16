import asyncio
from collections.abc import Iterator

import pytest
import respx
from langfuse import Langfuse
from mcp.server.mcpserver.exceptions import ToolError
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from hakuba_mcp import server as s
from hakuba_mcp import tracing

API = s.API_URL
EXPORTER = InMemorySpanExporter()
# one client for the module: the SDK keeps one tracer per public key, so a second client with the
# same key would send its spans to the first one's exporter
CLIENT = Langfuse(
    public_key="pk-lf-test",
    secret_key="sk-lf-test",
    base_url="http://127.0.0.1:9",
    span_exporter=EXPORTER,
)


@pytest.fixture
def spans(monkeypatch: pytest.MonkeyPatch) -> Iterator[InMemorySpanExporter]:
    """Tracing on, with spans kept in memory instead of sent to Langfuse."""
    monkeypatch.setattr(tracing, "client", lambda: CLIENT)
    EXPORTER.clear()
    yield EXPORTER


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
    # friends' hotels and coordinates stay out of the trace
    assert "Hotel Secret" not in str(attrs)


@respx.mock
def test_a_failed_tool_call_is_marked_error(spans: InMemorySpanExporter) -> None:
    respx.get(f"{API}/api/rank").respond(422, json={"detail": "from must be 'lat,lng'"})
    with pytest.raises(ToolError):
        asyncio.run(s.mcp.call_tool("rank_resorts", {"origin": "abc"}))
    tracing.flush()

    (span,) = spans.get_finished_spans()
    attrs = dict(span.attributes or {})
    assert attrs["langfuse.observation.level"] == "ERROR"
    message = str(attrs["langfuse.observation.status_message"])
    assert message.startswith("ToolError: ") and "Hakuba API 422 on /api/rank" in message


def test_no_keys_means_no_client_and_tools_still_work(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    assert tracing.client() is None
    with respx.mock:
        respx.get(f"{API}/api/places/suggest").respond(json=[])
        asyncio.run(s.mcp.call_tool("search_place", {"query": "x"}))
    tracing.flush()  # a no-op, not an error
