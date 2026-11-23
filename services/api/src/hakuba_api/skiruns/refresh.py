"""Refresh data/ski_lines.json from OpenSkiMap: `python -m hakuba_api.skiruns.refresh`.

Run by hand, at most once a day (openskidata.org terms for automated downloads). Requests
never reach OpenSkiMap: the app reads this snapshot. See SPEC-ski-runs.md.
"""

import json
from collections import Counter
from typing import Any, Literal

import httpx
from pydantic import BaseModel

from hakuba_api.catalog.store import load_resorts
from hakuba_api.common.geo import HAKUBA_BBOX
from hakuba_api.common.upstream import USER_AGENT
from hakuba_api.data.paths import data_dir
from hakuba_api.skiruns.models import Difficulty, LiftType, SkiLine, SkiLines
from hakuba_api.skiruns.validate import validate_ski_lines

API = "https://api.openskimap.org/features.geojson"
Kind = Literal["run", "lift"]

# OpenSkiMap ski-area name → our resort id. Typed out, not fuzzy-matched, so a renamed area
# fails the refresh instead of silently dropping a resort. Exact match only: Cortina's name
# contains 白馬岩岳, which is Iwatake's. (Sakka's runs sit under Happo One.)
OPENSKIMAP_NAMES = {
    "爺ガ岳スキー場, Jiigatake Snow Resort": "jigatake",
    "鹿島槍スキー場, Kashimayari Snow Resort": "kashimayari",
    "白馬さのさか, Hakuba Sanosaka Snow Resort": "sanosaka",
    "白馬五竜, Hakuba Goryu": "goryu",
    "白馬47, Hakuba 47": "hakuba47",
    "白馬八方尾根, Hakuba Happo One": "happo-one",
    "白馬白馬岩岳, Hakuba Iwatake, 白馬岩岳": "iwatake",
    "栂池高原, Tsugaike Kogen": "tsugaike",
    "白馬乗鞍スキー場, Hakuba Norikura Onsen Ski Resort, はくばのりくらスキーじょう": "norikura",
    "白馬コルチナ, Hakuba Cortina, 白馬岩岳コルチナ": "cortina",
}
RUN_USES = {"downhill", "snow_park"}  # nordic and connection paths are out (v1)


# The OpenSkiMap answer, only the fields we keep. No defaults: OpenSkiMap warns its format may
# change, and a missing field must fail the refresh with its name, not write nulls.
class _AreaProps(BaseModel):
    name: str | None


class _Area(BaseModel):
    properties: _AreaProps


class _RunProps(BaseModel):
    id: str
    name: str | None
    status: str
    uses: list[str]
    difficulty: Difficulty | None
    skiAreas: list[_Area]  # noqa: N815 (OpenSkiMap's spelling)


class _LiftProps(BaseModel):
    id: str
    name: str | None
    status: str
    liftType: LiftType  # noqa: N815
    skiAreas: list[_Area]  # noqa: N815


class _Feature(BaseModel):
    properties: dict[str, Any]
    geometry: dict[str, Any]


class _Answer(BaseModel):
    features: list[_Feature]


def fetch(kind: Kind) -> dict[str, Any]:
    b = HAKUBA_BBOX
    bbox = f"{b['west']},{b['south']},{b['east']},{b['north']}"
    response = httpx.get(
        API, params={"bbox": bbox, "types": kind}, headers={"User-Agent": USER_AGENT}, timeout=60
    )
    response.raise_for_status()
    return response.json()


def _round(coords: Any) -> Any:
    """Round to 5 dp (~1 m) and drop OpenSkiMap's third value, elevation."""
    if isinstance(coords[0], float | int):
        return [round(c, 5) for c in coords[:2]]
    return [_round(c) for c in coords]


def _resort(areas: list[_Area]) -> str | None:
    """The resort of the first ski area: None when there is none or it has no name."""
    name = areas[0].properties.name if areas else None
    if name is None:
        return None
    if name not in OPENSKIMAP_NAMES:
        raise ValueError(f"unknown OpenSkiMap ski area {name!r}: add it to OPENSKIMAP_NAMES")
    return OPENSKIMAP_NAMES[name]


def build(runs: dict[str, Any], lifts: dict[str, Any]) -> SkiLines:
    """Trim the two OpenSkiMap answers to the lines we draw."""
    lines: list[SkiLine] = []
    for kind, answer in (("run", runs), ("lift", lifts)):
        for f in _Answer.model_validate(answer).features:
            if kind == "run":
                p = _RunProps.model_validate(f.properties)
                keep = p.status == "operating" and bool(RUN_USES & set(p.uses))
                difficulty, lift_type = p.difficulty, None
            else:
                p = _LiftProps.model_validate(f.properties)
                keep = p.status == "operating"
                difficulty, lift_type = None, p.liftType
            resort_id = _resort(p.skiAreas) if keep else None
            if resort_id is None:
                continue
            props = {
                "id": p.id,
                "kind": kind,
                "name": p.name,
                "difficulty": difficulty,
                "liftType": lift_type,
                "resortId": resort_id,
            }
            geometry = {
                "type": f.geometry["type"],
                "coordinates": _round(f.geometry["coordinates"]),
            }
            lines.append(SkiLine.model_validate({"properties": props, "geometry": geometry}))
    lines.sort(key=lambda line: (line.properties.kind, line.properties.id))
    return SkiLines(features=lines)


def main() -> None:
    lines = build(fetch("run"), fetch("lift"))
    errors = validate_ski_lines(lines, [r.id for r in load_resorts()])
    if errors:
        raise SystemExit("\n".join(errors))
    path = data_dir() / "ski_lines.json"
    rows = [f.model_dump(by_alias=True) for f in lines.features]
    # one feature per line: a refresh diff shows which runs changed
    body = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows)
    path.write_text(
        '{"type":"FeatureCollection","features":[\n' + body + "\n]}\n", encoding="utf-8"
    )
    counts = Counter((f.properties.resort_id, f.properties.kind) for f in lines.features)
    for resort_id in sorted({r for r, _ in counts}):
        print(f"{resort_id}: {counts[resort_id, 'run']} runs, {counts[resort_id, 'lift']} lifts")
    print(f"wrote {len(rows)} lines to {path}")


if __name__ == "__main__":
    main()
