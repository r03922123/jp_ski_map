import time
from collections.abc import Hashable


class TtlCache[K: Hashable, V]:
    """Tiny in-process cache: upstream fair-use matters more than eviction here."""

    def __init__(self, ttl_s: float) -> None:
        self._ttl_s = ttl_s
        self._store: dict[K, tuple[float, V]] = {}

    def get(self, key: K) -> V | None:
        hit = self._store.get(key)
        if hit is None or time.monotonic() - hit[0] > self._ttl_s:
            return None
        return hit[1]

    def set(self, key: K, value: V) -> None:
        self._store[key] = (time.monotonic(), value)

    def clear(self) -> None:
        self._store.clear()
