"""Skeleton so the tests fail one by one; the next commit fills it in."""

from typing import Any, Protocol

LOCK_WAIT_S = 10.0


class Actor(Protocol):
    def route(self, req: dict[str, Any]) -> Any: ...

    def matrix(self, req: dict[str, Any]) -> Any: ...


class InProcessEngine:
    def __init__(self, actor: Actor, binding_error: type[Any], wait_s: float = LOCK_WAIT_S) -> None:
        pass

    def post(self, path: str, body: dict[str, Any]) -> Any:
        raise NotImplementedError


_engine: InProcessEngine | None = None


def get_engine(tiles: str) -> InProcessEngine:
    raise NotImplementedError
