import json
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest
import run_eval
from run_eval import (
    Outcome,
    api_label,
    parse_steps,
    parse_stream,
    redact,
    report,
    run_one,
    score,
    summarize,
    wilson,
)

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
    s = score(Q, ["search_place", "rank_resorts", "rank_resorts", "next_buses"], "Go to Happo")
    assert (s["hit"], s["required"], s["relevant"], s["distinct"]) == (2, 2, 2, 3)
    assert s["extra"] == ["next_buses"]
    assert s["passed"]
    missing = score(Q, ["rank_resorts"], "Happo")
    assert missing["missing"] == ["search_place"]
    assert not missing["passed"]
    assert not score(Q, ["search_place", "rank_resorts"], "Goryu")["passed"]


def test_any_of_needs_one_tool_of_the_group() -> None:
    # snow can come from either tool; requiring one of them would fail the other path
    q = {
        "required": ["search_place", "next_buses"],
        "any_of": [["snow_conditions", "rank_resorts"]],
        "optional": ["route"],
        "answer_regex": "08:",
    }
    via_rank = score(q, ["search_place", "rank_resorts", "next_buses"], "08:13")
    assert via_rank["passed"] and (via_rank["hit"], via_rank["required"]) == (3, 3)
    assert via_rank["relevant"] == via_rank["distinct"] == 3
    neither = score(q, ["search_place", "next_buses"], "08:13")
    assert not neither["passed"]
    assert neither["missing"] == ["rank_resorts|snow_conditions"]


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


def tool_events() -> list[str]:
    use = {
        "type": "tool_use",
        "id": "t1",
        "name": "mcp__hakuba__route",
        "input": {"destination": "happo-one"},
    }
    bad: dict[str, object] = {
        "type": "tool_use",
        "id": "t2",
        "name": "mcp__hakuba__rank_resorts",
        "input": {},
    }
    return [
        line(
            {
                "type": "assistant",
                "timestamp": "2026-11-16T08:37:01.000Z",
                "message": {"content": [use]},
            }
        ),
        line(
            {
                "type": "assistant",
                "timestamp": "2026-11-16T08:37:01.500Z",
                "message": {"content": [bad]},
            }
        ),
        line(
            {
                "type": "user",
                "timestamp": "2026-11-16T08:37:02.250Z",
                "message": {
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": "t1",
                            "content": '{"durationMin":7.7}',
                        },
                        {
                            "type": "tool_result",
                            "tool_use_id": "t2",
                            "is_error": True,
                            "content": [{"type": "text", "text": "Hakuba API 422"}],
                        },
                    ]
                },
            }
        ),
    ]


def test_parse_steps_pairs_each_tool_call_with_its_result_and_times() -> None:
    steps = parse_steps(tool_events())
    assert [(s.tool, s.input, s.output, s.is_error) for s in steps] == [
        ("route", {"destination": "happo-one"}, '{"durationMin":7.7}', False),
        ("rank_resorts", {}, "Hakuba API 422", True),
    ]
    assert steps[0].end_ns - steps[0].start_ns == 1_250_000_000
    # a call the CLI never answered (a timeout) keeps its start and an empty result
    unanswered = parse_steps(tool_events()[:1])[0]
    assert (unanswered.output, unanswered.end_ns) == ("", unanswered.start_ns)
    assert not unanswered.answered


def test_summary_numbers_match_the_report() -> None:
    questions = [Q | {"id": i, "check": "names Happo"} for i in ("a", "b")]
    tools = ["search_place", "rank_resorts"]
    outcomes = [
        Outcome("a", "en", tools, "Happo", 3, 40.0, cost_usd=0.04),
        Outcome("b", "en", ["search_place", "next_buses"], "Goryu", 2, 60.0),
    ]
    s = summarize(questions, outcomes)
    assert (s["passed"], s["n"], s["pass_rate"]) == (1, 2, 0.5)
    # b called next_buses, which is neither required nor optional: 3 of 4 calls relevant
    assert (s["hit"], s["required"], s["relevant"], s["distinct"]) == (3, 4, 3, 4)
    assert (s["tool_recall"], s["tool_precision"]) == (0.75, 0.75)
    assert (s["cost_usd"], s["cost_reported"], s["median_seconds"]) == (0.04, 1, 50.0)
    assert s["tool_errors"] == 0
    outcomes[0].steps = parse_steps(tool_events())  # route ok, rank_resorts failed
    assert summarize(questions, outcomes)["tool_errors"] == 1
    assert report(questions, outcomes).splitlines()[0].endswith("· tool errors 1")


def test_the_report_never_names_a_deployed_api() -> None:
    assert api_label("http://127.0.0.1:8010") == "http://127.0.0.1:8010"
    assert api_label("https://example.vercel.app") == "deployed API (HAKUBA_API_URL)"
    # an agent can quote the URL from a "not reachable" tool error
    quoted = "Hakuba API not reachable at https://example.vercel.app (ConnectError)"
    assert redact(quoted, "https://example.vercel.app/") == (
        "Hakuba API not reachable at deployed API (HAKUBA_API_URL) (ConnectError)"
    )
    assert redact("at http://127.0.0.1:8010", "http://127.0.0.1:8010") == "at http://127.0.0.1:8010"


def test_a_timed_out_run_keeps_the_tool_calls_it_made(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def fake_run(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        # the partial output arrives as bytes, even with text=True
        raise subprocess.TimeoutExpired("claude", 420, output="\n".join(tool_events()).encode())

    monkeypatch.setattr(run_eval.subprocess, "run", fake_run)
    outcome = run_one({"id": "a", "lang": "en", "question": "?"}, tmp_path / "mcp.json", None)
    assert (outcome.error, outcome.called) == ("timeout", ["route", "rank_resorts"])
    assert [s.tool for s in outcome.steps] == ["route", "rank_resorts"]
    assert outcome.started_ns > 0


def test_run_one_passes_the_parsed_steps_through(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def fake_run(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        out = "\n".join(tool_events())
        return subprocess.CompletedProcess(args=[], returncode=0, stdout=out, stderr="")

    monkeypatch.setattr(run_eval.subprocess, "run", fake_run)
    outcome = run_one({"id": "a", "lang": "en", "question": "?"}, tmp_path / "mcp.json", None)
    assert [(s.tool, s.answered) for s in outcome.steps] == [
        ("route", True),
        ("rank_resorts", True),
    ]


def test_plain_string_content_is_skipped_not_a_crash() -> None:
    text = line(
        {"type": "user", "timestamp": "2026-11-16T08:37:01.000Z", "message": {"content": "hi"}}
    )
    assert parse_steps([text]) == []
    assert parse_stream([text])[0] == []


def test_log_mlflow_records_the_run_and_one_trace_per_question(tmp_path: Path) -> None:
    mlflow = pytest.importorskip("mlflow")  # the eval group; CI installs only dev
    from mlflow_log import log_mlflow

    uri = f"sqlite:///{tmp_path / 'mlflow.db'}"
    questions = [Q | {"id": i, "lang": "en", "question": "Where?", "check": "x"} for i in "ab"]
    steps = parse_steps(tool_events())
    outcomes = [
        Outcome("a", "en", ["search_place", "rank_resorts"], "Happo", 3, 4.0, steps=steps),
        Outcome("b", "en", ["route"], "Goryu", 2, 3.0, error="timeout"),
    ]

    run_id = log_mlflow(questions, outcomes, {"model": "test"}, "report", uri, tmp_path)

    mlflow.set_tracking_uri(uri)
    run = mlflow.get_run(run_id)
    assert run.data.metrics["pass_rate"] == 0.5
    assert run.data.params["model"] == "test"
    traces = mlflow.search_traces(run_id=run_id, return_type="list")
    assert sorted(t.info.request_preview or "" for t in traces) == ['{"question": "Where?"}'] * 2
    a = next(t for t in traces if t.info.tags.get("question_id") == "a")
    assert [s.name for s in a.data.spans] == ["a", "route", "rank_resorts"]
    assert a.data.spans[2].status.status_code == "ERROR"
    assert [(x.name, x.value) for x in a.info.assessments] == [("passed", True)]
    b = next(t for t in traces if t.info.tags.get("question_id") == "b")
    assert b.data.spans[0].status.status_code == "ERROR"  # the run timed out
    assert [(x.name, x.value) for x in b.info.assessments] == [("passed", False)]


QUESTIONS = json.loads((run_eval.HERE / "trip_questions.json").read_text())
TOOLS = {"search_place", "rank_resorts", "next_buses", "route", "snow_conditions"}
# what an agent says when every tool call failed: no question that needs a tool may pass on it
NO_DATA = "Sorry, I couldn't reach the Hakuba API, so I can't check that right now."


def test_question_ids_are_unique_and_tools_are_real() -> None:
    ids = [q["id"] for q in QUESTIONS]
    assert len(ids) == len(set(ids))
    for q in QUESTIONS:
        named = {*q["required"], *q["optional"], *(t for g in q.get("any_of", []) for t in g)}
        assert named <= TOOLS, q["id"]
        assert q["lang"] in ("en", "zh", "ja"), q["id"]


@pytest.mark.parametrize("q", QUESTIONS, ids=[q["id"] for q in QUESTIONS])
def test_regex_takes_the_right_answer_and_rejects_wrong_ones(q: dict[str, Any]) -> None:
    pattern = re.compile(q["answer_regex"])
    assert q["regex_why"].strip()
    for right in [q["positive"], *q.get("more_positives", [])]:
        assert pattern.search(right), f"correct answer did not match: {right}"
    assert len(q["negatives"]) >= 2
    for wrong in q["negatives"]:
        assert not pattern.search(wrong), f"wrong answer matched: {wrong}"
    assert not pattern.search(q["question"]), "echoing the question must not pass"
    if q["required"] or q.get("any_of"):
        assert not pattern.search(NO_DATA), "an answer with no data must not pass"
