"""Each MCP tool call as one Langfuse `tool` observation (SPEC-agent-tools v3).

On only where both Langfuse keys are set (the Vercel deploy); local runs, tests and CI send
nothing. A span keeps the tool name, its duration, the names of the declared arguments the agent
passed and, on failure, a summary of the error. Argument values, results and error messages stay
out, because they are friends' hotels and coordinates (an argument error quotes them all).
"""

import os
import re
from collections.abc import Generator
from contextlib import contextmanager
from typing import TYPE_CHECKING

from opentelemetry import context as otel_context
from pydantic import ValidationError

if TYPE_CHECKING:
    from langfuse import Langfuse

_client: "Langfuse | None" = None


def client() -> "Langfuse | None":
    """The Langfuse client, or None when its keys are not set."""
    global _client
    if not (os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY")):
        return None
    if _client is None:
        # imported here: the SDK adds ~0.2 s to a cold start that sends nothing
        from langfuse import Langfuse
        from opentelemetry.sdk.trace import TracerProvider

        # a provider of its own, not the global one: on the global one the MCP SDK's own span
        # would be exported too, a second span per call that also carries the client's _meta
        _client = Langfuse(tracer_provider=TracerProvider())
    return _client


def error_summary(e: Exception) -> str:
    """The error's type, the invalid argument names and the API status: never the message,
    which can quote argument values."""
    parts = [type(e).__name__]
    if isinstance(e.__cause__, ValidationError):
        fields = {".".join(str(p) for p in err["loc"]) for err in e.__cause__.errors()}
        parts.append("invalid arguments: " + ", ".join(sorted(fields)))
    if m := re.search(r"Hakuba API (\d{3}|not reachable)", str(e)):
        parts.append(m.group(0))
    return "; ".join(parts)


@contextmanager
def tool_span(name: str, arg_names: list[str]) -> Generator[None]:
    lf = client()
    if lf is None:
        yield
        return
    failure: Exception | None = None
    # a fresh trace: no parent, trace id or baggage from the request's _meta
    token = otel_context.attach(otel_context.Context())
    try:
        with lf.start_as_current_observation(
            name=name, as_type="tool", metadata={"args": arg_names}
        ) as span:
            try:
                yield
            except Exception as e:
                # caught inside: an exception leaving the span would be recorded with its message
                failure = e
                span.update(level="ERROR", status_message=error_summary(e))
    finally:
        otel_context.detach(token)
    if failure is not None:
        raise failure


def flush() -> None:
    """Send the spans now: a serverless function may be frozen right after it answers."""
    lf = client()
    if lf is not None:
        lf.flush()
