"""Where a request's time went, with no dependency and no collector.

Each real upstream call adds one entry; the middleware sends them back as a `Server-Timing`
header (W3C; browser dev tools draw it) and logs a slow or failed request with the same
breakdown. Only source names and the path are recorded, never the query string: search
text is user data.
"""

import logging
import time
from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger(__name__)

SLOW_MS = 1000.0

# One list per request. Sync endpoints run in a worker thread with a copy of this context,
# and the copy points at the same list, so their entries reach the middleware.
_entries: ContextVar[list[tuple[str, float]] | None] = ContextVar("timing_entries", default=None)


@contextmanager
def timed(name: str) -> Generator[None]:
    """Time the block as `name` (a Server-Timing token); a no-op outside a request."""
    start = time.perf_counter()
    try:
        yield
    finally:
        entries = _entries.get()
        if entries is not None:
            entries.append((name, (time.perf_counter() - start) * 1000))


class ServerTiming:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        entries: list[tuple[str, float]] = []
        token = _entries.set(entries)
        start = time.perf_counter()
        status = 500  # what the client gets if the app raises before answering
        value = ""

        async def send_timed(message: Message) -> None:
            nonlocal status, value
            if message["type"] == "http.response.start":
                status = message["status"]
                total = (time.perf_counter() - start) * 1000
                value = ", ".join(f"{n};dur={ms:.1f}" for n, ms in [*entries, ("total", total)])
                message["headers"] = [*message["headers"], (b"server-timing", value.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_timed)
        finally:
            _entries.reset(token)
            total = (time.perf_counter() - start) * 1000
            if status >= 500 or total >= SLOW_MS:
                log.warning(
                    "slow or failed: %s %s status=%d ms=%.0f [%s]",
                    scope["method"],
                    scope["path"],
                    status,
                    total,
                    value,
                )
