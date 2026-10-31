"""Rate limits for the public deployment (SPEC-deploy v1.5), in process, no dependency.

Two layers:
- a global budget per upstream protects the free third-party services (Photon,
  Open-Meteo, Google short links): over it, the call fails fast as `UpstreamBusyError`;
- a per-client budget protects the API itself: over it, the middleware answers 429.

The client is the address our trusted proxy appended to X-Forwarded-For
(`TRUSTED_PROXY_HOPS`, e.g. 1 behind Tailscale Funnel). Next's rewrite passes the
header through but never adds one, so the socket peer is always Next itself: with
`TRUSTED_PROXY_HOPS` unset (local dev) per-client limits are off, and when the hop
is missing the client is unknown. Only the upstream budgets apply then, never one
bucket shared by everyone. `TRUSTED_PROXY_HOPS=0` means the API is reached directly.
"""

import math
import os
import threading
import time
from collections.abc import Callable

from hakuba_api.common.upstream import UpstreamBusyError

# source -> (tokens per second, burst); the caches in front keep real traffic far below
UPSTREAM_BUDGETS: dict[str, tuple[float, int]] = {
    "photon": (1.0, 3),
    "open-meteo": (1.0, 2),
    "gmaps-link": (0.5, 2),
}
CLIENT_RATE_PER_S = 2.0  # 120 requests a minute
CLIENT_BURST = 120
_MAX_CLIENTS = 10_000


class TokenBucket:
    def __init__(
        self, rate_per_s: float, burst: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._rate = rate_per_s
        self._burst = burst
        self._clock = clock
        self._tokens = float(burst)
        self._at = clock()
        self._lock = threading.Lock()  # sync endpoints run in a thread pool

    def _refill(self) -> None:
        now = self._clock()
        self._tokens = min(self._burst, self._tokens + (now - self._at) * self._rate)
        self._at = now

    def take(self) -> bool:
        with self._lock:
            self._refill()
            if self._tokens < 1:
                return False
            self._tokens -= 1
            return True

    def retry_after_s(self) -> float:
        with self._lock:
            self._refill()
            return max(0.0, (1 - self._tokens) / self._rate)

    def is_full(self) -> bool:
        with self._lock:
            self._refill()
            return self._tokens >= self._burst


def client_key(forwarded_for: str | None, peer: str | None, trusted_hops: int | None) -> str | None:
    """The client's address: the hop our `trusted_hops`-th proxy appended, else unknown.

    Hops before it are whatever the client sent, so they are never trusted.
    """
    if trusted_hops is None:
        return None
    if trusted_hops == 0:
        return peer
    hops = [h.strip() for h in (forwarded_for or "").split(",") if h.strip()]
    return hops[-trusted_hops] if len(hops) >= trusted_hops else None


class Limits:
    def __init__(
        self,
        upstream: dict[str, tuple[float, int]] | None = None,
        client_rate_per_s: float = CLIENT_RATE_PER_S,
        client_burst: int = CLIENT_BURST,
        trusted_hops: int | None = None,
    ) -> None:
        self._upstream_config = UPSTREAM_BUDGETS if upstream is None else upstream
        self._client_rate = client_rate_per_s
        self._client_burst = client_burst
        self.trusted_hops = trusted_hops
        self.reset()

    @classmethod
    def from_env(cls) -> "Limits":
        hops = os.environ.get("TRUSTED_PROXY_HOPS")
        return cls(trusted_hops=int(hops) if hops else None)

    def reset(self) -> None:
        self._upstream = {s: TokenBucket(r, b) for s, (r, b) in self._upstream_config.items()}
        self._clients: dict[str, TokenBucket] = {}
        self._lock = threading.Lock()

    def spend_upstream(self, source: str) -> None:
        """Call just before a real upstream request (after the cache missed)."""
        bucket = self._upstream.get(source)
        if bucket is not None and not bucket.take():
            raise UpstreamBusyError(source)

    def client_retry_after(self, key: str) -> int | None:
        """None if the client may go ahead (spending a token), else seconds to wait."""
        with self._lock:
            bucket = self._clients.get(key)
            if bucket is None:
                if len(self._clients) >= _MAX_CLIENTS:  # forget clients that are back to full
                    self._clients = {k: b for k, b in self._clients.items() if not b.is_full()}
                bucket = self._clients[key] = TokenBucket(self._client_rate, self._client_burst)
        if bucket.take():
            return None
        return max(1, math.ceil(bucket.retry_after_s()))


LIMITS = Limits.from_env()


def spend_upstream(source: str) -> None:
    LIMITS.spend_upstream(source)
