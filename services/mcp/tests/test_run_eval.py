import json

from run_eval import Outcome, parse_stream, report, score

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
    summary = report(questions, outcomes).splitlines()[0]
    # 3 of 4: sqrt(0.75 * 0.25 / 4) = 0.22
    assert "**3/4 passed** (0.75 ± 0.22 SE)" in summary
    assert "cost $0.20 ($0.050 per question)" in summary
    assert "median 55 s" in summary
