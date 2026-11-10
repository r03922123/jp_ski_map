from hakuba_api.bus.models import Timetable

from timetable_vlm.paths import GOLD_DIR
from timetable_vlm.target import prompt_for, to_target


def test_target_keeps_only_what_the_poster_shows():
    gold = Timetable.model_validate_json((GOLD_DIR / "line-e-e1.json").read_text())
    t = to_target(gold)
    assert set(t) == {"directions"}
    d = t["directions"][0]
    assert set(d) == {"id", "stops", "trips"}
    assert d["trips"][0] == {"n": 1, "times": gold.directions[0].trips[0].times}


def test_prompt_names_route_and_direction_ids():
    gold = Timetable.model_validate_json((GOLD_DIR / "line-e-e1.json").read_text())
    p = prompt_for(gold)
    assert "E1" in p and "outward" in p and "return" in p
