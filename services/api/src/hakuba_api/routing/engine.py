"""Valhalla inside this process, for hosts with no Valhalla server (SPEC-deploy.md Phase B)."""

import threading
from typing import Any, Protocol

from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError

LOCK_WAIT_S = 10.0


class Actor(Protocol):
    def route(self, req: dict[str, Any]) -> Any: ...

    def matrix(self, req: dict[str, Any]) -> Any: ...


class InProcessEngine:
    """One Actor, one call at a time: the binding drops the GIL, and concurrent calls crash."""

    def __init__(self, actor: Actor, binding_error: type[Any], wait_s: float = LOCK_WAIT_S) -> None:
        self._call = {"/route": actor.route, "/sources_to_targets": actor.matrix}
        self._binding_error = binding_error
        self._wait_s = wait_s
        self._lock = threading.Lock()

    def post(self, path: str, body: dict[str, Any]) -> Any:
        if not self._lock.acquire(timeout=self._wait_s):
            raise RoutingUnavailableError("routing busy")
        try:
            return self._call[path](body)
        except self._binding_error as e:
            if e.http_code == 400:
                raise NoRouteError(e.message) from e
            raise RoutingUnavailableError(str(e)) from e
        except Exception as e:  # the binding can raise other C++ errors
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
                # Imported here so the HTTP backend never loads the binding
                from valhalla import Actor as ValhallaActor
                from valhalla import ValhallaError, get_config

                actor = ValhallaActor(get_config(tile_extract=tiles, tile_dir="", verbose=False))
            except Exception as e:
                raise RoutingUnavailableError(f"could not start routing: {e}") from e
            _engine = InProcessEngine(actor, ValhallaError)
        return _engine
