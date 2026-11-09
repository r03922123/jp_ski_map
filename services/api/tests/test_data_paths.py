"""`paths.py` must load on a deployment path shallower than the repo (SPEC-deploy, item 7)."""

from pathlib import Path
from typing import Any

import pytest

from hakuba_api.data import paths

# Four parents, so a module-level `parents[5]` raises IndexError while this file loads.
SHALLOW_FILE = "/app/hakuba_api/data/paths.py"


def load_paths_at(file: str) -> dict[str, Any]:
    """Run the real source of paths.py as if it had been installed at `file`."""
    source = Path(paths.__file__).read_text()
    namespace: dict[str, Any] = {"__file__": file, "__name__": "paths_elsewhere"}
    exec(compile(source, file, "exec"), namespace)
    return namespace


def test_loads_outside_the_repo_and_uses_the_env_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAKUBA_DATA_DIR", "/app/data")

    namespace = load_paths_at(SHALLOW_FILE)

    assert namespace["data_dir"]() == Path("/app/data")


def test_defaults_to_the_repo_data_folder(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HAKUBA_DATA_DIR", raising=False)

    assert paths.data_dir() == Path(__file__).resolve().parents[3] / "data"


def test_env_dir_wins_over_the_repo_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAKUBA_DATA_DIR", "/somewhere/else")

    assert paths.data_dir() == Path("/somewhere/else")
