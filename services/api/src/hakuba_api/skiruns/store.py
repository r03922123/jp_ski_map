from functools import cache

from hakuba_api.data.paths import data_dir
from hakuba_api.skiruns.models import SkiLines


@cache
def load_ski_lines() -> SkiLines:
    return SkiLines.model_validate_json((data_dir() / "ski_lines.json").read_bytes())
