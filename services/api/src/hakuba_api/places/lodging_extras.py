"""Names the lodging snapshots lack, kept beside them so a refresh never erases them.

- `lodging_readings.json`: kana and romaji readings of Japanese names, generated offline
  by `refresh_readings` (SPEC-place-search v1.5).
- `lodging_aliases.json`: other names a lodging goes by (its English name on a tourism
  site, say), each with the page it came from. Only `reviewed` aliases reach the index:
  a wrong alias would send someone to the wrong hotel, the confidently wrong answer this
  search is built to avoid.
"""

from functools import cache
from typing import Literal

from hakuba_api.common.models import ApiModel
from hakuba_api.data.paths import data_dir

READINGS_FILE = "lodging_readings.json"
ALIASES_FILE = "lodging_aliases.json"

AliasStatus = Literal["unreviewed", "reviewed", "rejected"]


class LodgingReading(ApiModel):
    id: str
    name: str
    kana: str
    romaji: list[str]


class ReadingsFile(ApiModel):
    generator: str
    readings: list[LodgingReading]


class LodgingAlias(ApiModel):
    id: str
    alias: str
    source: str  # the https page that names it
    status: AliasStatus
    note: str | None = None


class AliasesFile(ApiModel):
    aliases: list[LodgingAlias]


@cache
def load_readings_file() -> ReadingsFile:
    path = data_dir() / READINGS_FILE
    if not path.exists():
        return ReadingsFile(generator="", readings=[])
    return ReadingsFile.model_validate_json(path.read_bytes())


@cache
def load_aliases_file() -> AliasesFile:
    path = data_dir() / ALIASES_FILE
    if not path.exists():
        return AliasesFile(aliases=[])
    return AliasesFile.model_validate_json(path.read_bytes())


def readings_by_id(f: ReadingsFile) -> dict[str, tuple[str, ...]]:
    """id → every reading to match: the romaji forms, then the kana."""
    return {r.id: (*r.romaji, r.kana) for r in f.readings}


def reviewed_aliases(f: AliasesFile) -> dict[str, tuple[str, ...]]:
    out: dict[str, list[str]] = {}
    for a in f.aliases:
        if a.status == "reviewed":
            out.setdefault(a.id, []).append(a.alias)
    return {k: tuple(v) for k, v in out.items()}
