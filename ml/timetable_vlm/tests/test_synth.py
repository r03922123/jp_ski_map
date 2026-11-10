import json
import random

from hakuba_api.bus.models import Timetable

from timetable_vlm.metric import score
from timetable_vlm.paths import GOLD_DIR
from timetable_vlm.synth import _shift, perturb
from timetable_vlm.target import to_target


def test_shift_crosses_the_hour():
    assert _shift("08:55", 10) == "09:05"
    assert _shift(None, 10) is None


def test_perturbed_target_still_passes_the_real_validator():
    gold = Timetable.model_validate_json((GOLD_DIR / "line-e-e4.json").read_text())
    rng = random.Random(1)
    for _ in range(20):
        t = perturb(to_target(gold), rng)
        assert [tr["n"] for tr in t["directions"][0]["trips"]] == [1, 2, 3]
        s = score(json.dumps(t), gold)
        assert s["schema_valid"] and s["validator_errors"] == 0
