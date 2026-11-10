import json

from hakuba_api.bus.models import Timetable

from timetable_vlm.metric import parse_output, score
from timetable_vlm.paths import GOLD_DIR
from timetable_vlm.target import to_target

GOLD = Timetable.model_validate_json((GOLD_DIR / "line-e-e1.json").read_text())


def _text(target: dict) -> str:
    return json.dumps(target)


def test_perfect_prediction_scores_one():
    s = score(_text(to_target(GOLD)), GOLD)
    assert s["parsed"] and s["schema_valid"] and s["validator_errors"] == 0
    assert s["cell_acc"] == 1.0 and s["stop_acc"] == 1.0


def test_fenced_json_with_chatter_still_parses():
    text = "Here it is:\n```json\n" + _text(to_target(GOLD)) + "\n```\nDone."
    assert parse_output(text) == to_target(GOLD)


def test_malformed_output_scores_zero_without_crashing():
    for text in ["", "not json", '{"directions": [', '{"directions": "x"}', "[1, 2]"]:
        s = score(text, GOLD)
        assert s["cell_acc"] == 0.0 and s["stop_acc"] == 0.0
        assert not s["schema_valid"]


def test_one_wrong_time_costs_one_cell():
    t = to_target(GOLD)
    t["directions"][0]["trips"][0]["times"][0] = "07:56"
    s = score(_text(t), GOLD)
    total = sum(len(tr.times) for d in GOLD.directions for tr in d.trips)
    assert s["cell_acc"] == (total - 1) / total
    assert s["stop_acc"] == 1.0


def test_unpadded_hour_counts_as_correct_cell_but_fails_validator():
    t = to_target(GOLD)
    trip = t["directions"][0]["trips"][2]  # 09:55, 10:00, ...
    trip["times"] = [x.lstrip("0") for x in trip["times"]]
    s = score(_text(t), GOLD)
    assert s["cell_acc"] == 1.0
    # "9:55" sorts after "10:00" as a string, so the real validator flags the trip
    assert s["schema_valid"] and s["validator_errors"] >= 1


def test_unknown_stop_name_lowers_stop_acc_and_is_flagged():
    t = to_target(GOLD)
    t["directions"][0]["stops"][0] = "Nowhere"
    s = score(_text(t), GOLD)
    assert s["stop_acc"] < 1.0
    assert s["validator_errors"] >= 1


def test_missing_direction_and_trip_count_as_wrong_cells():
    t = to_target(GOLD)
    t["directions"] = t["directions"][:1]
    s = score(_text(t), GOLD)
    assert 0.0 < s["cell_acc"] < 1.0


def test_wrong_number_of_times_is_schema_valid_but_validator_error():
    t = to_target(GOLD)
    t["directions"][0]["trips"][0]["times"].append("23:59")
    s = score(_text(t), GOLD)
    assert s["schema_valid"] and s["validator_errors"] >= 1
