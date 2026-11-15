import json
import subprocess
from pathlib import Path

import pytest
import run_eval
from run_eval import Outcome, parse_stream, report, run_one, score, wilson

Q = {
    "required": ["search_place", "rank_resorts"],
    "optional": ["route"],
    "answer_regex": "(?i)happo",
}


def line(event: dict[str, object]) -> str:
    return json.dumps(event)


def test_parse_stream_collects_tool_calls_answer_and_auth_errors() -> None:
    lines = [
        line({"type": "system", "subtype": "init"}),
        line(
            {
                "type": "assistant",
                "message": {
                    "content": [
                        {"type": "text", "text": "Looking up"},
                        {"type": "tool_use", "name": "mcp__hakuba__search_place", "input": {}},
                    ]
                },
            }
        ),
        "not json",
        line(
            {
                "type": "result",
                "subtype": "success",
                "result": "Happo-One",
                "num_turns": 3,
                "total_cost_usd": 0.0421,
            }
        ),
    ]
    assert parse_stream(lines) == (["search_place"], "Happo-One", 3, "", 0.0421)
    failed = [line({"type": "result", "subtype": "success", "is_error": True, "result": "Login"})]
    assert parse_stream(failed)[3] == "Login"


def test_score_precision_recall_parts_and_pass() -> None:
    s = score(Q, ["search_place", "rank_resorts", "rank_resorts", "nearby_pois"], "Go to Happo")
    assert (s["hit"], s["required"], s["relevant"], s["distinct"]) == (2, 2, 2, 3)
    assert s["extra"] == ["nearby_pois"]
    assert s["passed"]
    missing = score(Q, ["rank_resorts"], "Happo")
    assert missing["missing"] == ["search_place"]
    assert not missing["passed"]
    assert not score(Q, ["search_place", "rank_resorts"], "Goryu")["passed"]


def test_report_gives_the_pass_rate_with_its_error_and_the_cost() -> None:
    questions = [Q | {"id": i, "check": "names Happo"} for i in ("a", "b", "c", "d")]
    tools = ["search_place", "rank_resorts"]
    outcomes = [
        Outcome("a", "en", tools, "Happo", 3, 40.0, cost_usd=0.04),
        Outcome("b", "en", tools, "Happo", 3, 60.0, cost_usd=0.06),
        Outcome("c", "ja", tools, "Happo", 4, 50.0, cost_usd=0.05),
        Outcome("d", "zh", tools, "Goryu", 2, 90.0, cost_usd=0.05),
    ]
    lines = report(questions, outcomes).splitlines()
    # 3 of 4: sample sd 0.5 / sqrt(4) = 0.25, the same formula as the search eval
    assert "**3/4 passed** (0.75 ± 0.25 SE, 95% interval 0.30–0.95)" in lines[0]
    assert "cost $0.20 ($0.050 per question, 4 of 4 reported)" in lines[0]
    assert "median 55 s" in lines[0]
    assert lines[4].endswith("| 3 | 40 | 0.040 |")  # question a's own row


def test_a_run_that_reported_no_cost_is_left_out_of_the_average() -> None:
    questions = [Q | {"id": i, "check": "names Happo"} for i in ("a", "b", "c")]
    tools = ["search_place", "rank_resorts"]
    outcomes = [
        Outcome("a", "en", tools, "Happo", 3, 40.0, cost_usd=0.10),
        Outcome("b", "en", tools, "Happo", 3, 60.0, cost_usd=0.10),
        Outcome("c", "en", [], "", 0, 420.0, "timeout"),  # the longest run, and no cost
    ]
    lines = report(questions, outcomes).splitlines()
    # not $0.067 each: the timed-out run cost something, we just don't know what
    assert "cost $0.20 ($0.100 per question, 2 of 3 reported)" in lines[0]
    assert lines[6].endswith("| 0 | 420 | - |")


def test_the_interval_keeps_its_width_when_every_question_passes() -> None:
    # at 8 of 8 the standard error is 0, which would read as certain
    low, high = wilson(8, 8)
    assert (round(low, 2), high) == (0.68, 1.0)
    assert tuple(round(x, 2) for x in wilson(7, 8)) == (0.53, 0.98)
    assert tuple(round(x, 2) for x in wilson(0, 8)) == (0.0, 0.32)
    assert wilson(0, 0) == (0.0, 1.0)  # no questions: nothing is known


def test_report_of_no_questions_does_not_divide_by_zero() -> None:
    first = report([], []).splitlines()[0]
    assert first.startswith("**0/0 passed** (0.00 ± 0.00 SE, 95% interval 0.00–1.00)")
    assert "0 of 0 reported" in first


def test_run_one_keeps_the_cost_the_cli_reported(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    stream = line(
        {
            "type": "result",
            "subtype": "success",
            "result": "Happo-One",
            "num_turns": 3,
            "total_cost_usd": 0.07,
        }
    )

    def fake_run(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=[], returncode=0, stdout=stream, stderr="")

    monkeypatch.setattr(run_eval.subprocess, "run", fake_run)
    question = {"id": "a", "lang": "en", "question": "Where should I ski?"}

    outcome = run_one(question, tmp_path / "mcp.json", None)

    assert (outcome.answer, outcome.turns, outcome.error) == ("Happo-One", 3, "")
    assert outcome.cost_usd == 0.07
