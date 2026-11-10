"""Score a model's raw text against a reviewed timetable.

- parsed: the text holds one JSON object.
- schema_valid: the predicted directions fit the API's Timetable model (gold metadata reused).
- validator_errors: findings from the API's own validate_bus (unknown stop, time count, order).
- cell_acc: departure cells (direction x trip x stop, matched by position) equal to gold, over all
  gold cells, so missing trips count as wrong. "8:05" counts as "08:05" here, but the validator
  still sees the raw string.
- stop_acc: printed stop names equal to gold, by position, over all gold stops.
Malformed output scores 0 everywhere and is still counted.
"""

import json
import re
from functools import cache

from hakuba_api.bus.models import Timetable
from hakuba_api.bus.store import load_stops
from hakuba_api.bus.validate import validate_bus
from hakuba_api.catalog.store import load_resorts
from pydantic import ValidationError


def parse_output(text: str) -> dict | None:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def _norm(x: object) -> object:
    if isinstance(x, str) and (m := re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", x)):
        return f"{int(m[1]):02d}:{m[2]}"
    return x


def _at(seq: object, i: int) -> object:
    return seq[i] if isinstance(seq, list) and i < len(seq) else None


@cache
def _repo_refs():
    return load_stops(), {r.id for r in load_resorts()}


def score(text: str, gold: Timetable) -> dict:
    out = {"parsed": False, "schema_valid": False, "validator_errors": None,
           "cell_acc": 0.0, "stop_acc": 0.0}
    pred = parse_output(text)
    if pred is None:
        return out
    out["parsed"] = True

    try:
        merged = gold.model_dump(by_alias=True, mode="json") | {"directions": pred["directions"]}
        t = Timetable.model_validate(merged)
        out["schema_valid"] = True
        stops, resorts = _repo_refs()
        out["validator_errors"] = len(validate_bus(stops, [t], {t.source.file}, resorts))
    except (ValidationError, KeyError, TypeError):
        pass

    pdirs = pred.get("directions")
    cells = cell_ok = stops_n = stop_ok = 0
    for di, gd in enumerate(gold.directions):
        pd = _at(pdirs, di)
        pd = pd if isinstance(pd, dict) else {}
        for si, name in enumerate(gd.stops):
            stops_n += 1
            stop_ok += _at(pd.get("stops"), si) == name
        for ti, gt in enumerate(gd.trips):
            ptrip = _at(pd.get("trips"), ti)
            ptimes = ptrip.get("times") if isinstance(ptrip, dict) else None
            for si, g in enumerate(gt.times):
                cells += 1
                # a cell the model never wrote is wrong, even where gold is empty (null)
                written = isinstance(ptimes, list) and si < len(ptimes)
                cell_ok += written and _norm(ptimes[si]) == g
    out["cell_acc"] = cell_ok / cells if cells else 0.0
    out["stop_acc"] = stop_ok / stops_n if stops_n else 0.0
    return out
