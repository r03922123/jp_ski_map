"""Each MCP tool call as one Langfuse `tool` observation (SPEC-agent-tools v3).

On only where both Langfuse keys are set (the Vercel deploy); local runs, tests and CI send
nothing. A span keeps the tool name, its duration, the argument *names* and, on failure, the
error message. Argument values stay out, because they are friends' hotels and coordinates; an
error message can still quote the one bad argument (e.g. "unknown place 'x'").
"""

import os
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from langfuse import Langfuse, get_client


def client() -> Langfuse | None:
    """The Langfuse client, or None when its keys are not set."""
    if not (os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY")):
        return None
    return get_client()  # reads LANGFUSE_BASE_URL and LANGFUSE_TRACING_ENVIRONMENT too


@contextmanager
def tool_span(name: str, arguments: dict[str, Any]) -> Generator[None]:
    lf = client()
    if lf is None:
        yield
        return
    with lf.start_as_current_observation(
        name=name, as_type="tool", metadata={"args": sorted(arguments)}
    ) as span:
        try:
            yield
        except Exception as e:
            span.update(level="ERROR", status_message=f"{type(e).__name__}: {e}"[:300])
            raise


def flush() -> None:
    """Send the spans now: a serverless function may be frozen right after it answers."""
    lf = client()
    if lf is not None:
        lf.flush()
