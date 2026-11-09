import os
from pathlib import Path


def data_dir() -> Path:
    override = os.environ.get("HAKUBA_DATA_DIR")
    if override is not None:
        return Path(override)
    # services/api/src/hakuba_api/data/paths.py -> repo root is 5 levels up. Worked out here, not
    # at import, because a deployment path can be shallower and sets HAKUBA_DATA_DIR instead.
    return Path(__file__).resolve().parents[5] / "data"
