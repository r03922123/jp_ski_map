import os
from pathlib import Path

# services/api/src/hakuba_api/data/paths.py -> repo root is 5 levels up
_REPO_ROOT = Path(__file__).resolve().parents[5]


def data_dir() -> Path:
    return Path(os.environ.get("HAKUBA_DATA_DIR", _REPO_ROOT / "data"))
