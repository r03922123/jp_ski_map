import json

from run_eval import parse_stream, score

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
        line({"type": "result", "subtype": "success", "result": "Happo-One", "num_turns": 3}),
    ]
    assert parse_stream(lines) == (["search_place"], "Happo-One", 3, "")
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
