from collections.abc import Iterator

import pytest


@pytest.fixture(autouse=True)
def no_langfuse_keys(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keys exported in the shell must never make a test send spans to the real Langfuse."""
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    yield
