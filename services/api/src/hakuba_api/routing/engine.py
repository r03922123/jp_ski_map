"""Valhalla inside this process, for hosts with no Valhalla server (SPEC-deploy.md Phase B)."""

import importlib
import threading
from typing import Any, Protocol

from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError

LOCK_WAIT_S = 10.0


class Actor(Protocol):
    def route(self, req: dict[str, Any]) -> Any: ...

    def matrix(self, req: dict[str, Any]) -> Any: ...


class InProcessEngine:
    """One Actor, one call at a time: the binding drops the GIL, and concurrent calls crash."""

    def __init__(
        self, actor: Actor, binding_error: type[Exception], wait_s: float = LOCK_WAIT_S
    ) -> None:
        self._call = {"/route": actor.route, "/sources_to_targets": actor.matrix}
        self._binding_error = binding_error
        self._wait_s = wait_s
        self._lock = threading.Lock()

    def post(self, path: str, body: dict[str, Any]) -> Any:
        if not self._lock.acquire(timeout=self._wait_s):
            raise RoutingUnavailableError("routing busy")
        try:
            return self._call[path](body)
        except Exception as e:  # not only ValhallaError: the binding can raise other C++ errors
            if isinstance(e, self._binding_error) and getattr(e, "http_code", None) == 400:
                raise NoRouteError(getattr(e, "message", str(e))) from e
            raise RoutingUnavailableError(str(e)) from e
        finally:
            self._lock.release()


_build_lock = threading.Lock()
_engine: InProcessEngine | None = None


def get_engine(tiles: str) -> InProcessEngine:
    """The process's one engine, built on first use. A failed build isn't kept, so the next
    request retries. Not `functools.cache`: racing threads may each run its function."""
    global _engine
    with _build_lock:
        if _engine is None:
            try:
                # Loaded here so the HTTP backend never needs it; it ships without type stubs
                binding: Any = importlib.import_module("valhalla")
                config = binding.get_config(tile_extract=tiles, tile_dir="", verbose=False)
                _engine = InProcessEngine(binding.Actor(config), binding.ValhallaError)
            except Exception as e:
                raise RoutingUnavailableError(f"could not start routing: {e}") from e
        return _engine
