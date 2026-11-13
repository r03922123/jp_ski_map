"""Agent eval: run trip questions through headless Claude Code with the hakuba MCP server.

Uses the owner's Claude Code subscription via the `claude` CLI; it never calls the Anthropic
API directly. Usage (from services/mcp):

    uv run python evals/run_eval.py [--out evals/last_run.md] [--workers 3] [--model sonnet]
"""

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date
from functools import partial
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent / ".venv" / "bin" / "hakuba-mcp"
PREFIX = "mcp__hakuba__"
TIMEOUT_S = 420


@dataclass
class Outcome:
    id: str
    lang: str
    called: list[str]
    answer: str
    turns: int
    seconds: float
    error: str = ""


def parse_stream(lines: list[str]) -> tuple[list[str], str, int, str]:
    """Tool names called (in order, prefix stripped), final answer, turns, error subtype."""
    called: list[str] = []
    answer, turns, error = "", 0, ""
    for line in lines:
        try:
            event: dict[str, Any] = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "assistant":
            for block in event["message"]["content"]:
                if block.get("type") == "tool_use":
                    called.append(str(block["name"]).removeprefix(PREFIX))
        elif event.get("type") == "result":
            answer = str(event.get("result") or "")
            turns = int(event.get("num_turns") or 0)
            if event.get("is_error"):
                error = answer[:120] or str(event.get("subtype"))
            elif event.get("subtype") != "success":
                error = str(event.get("subtype"))
    return called, answer, turns, error


def score(q: dict[str, Any], called: list[str], answer: str) -> dict[str, Any]:
    """Per-question tool-call counts and pass/fail.

    recall = required tools called / required; precision = distinct calls that were
    required or optional / distinct calls. Pass = every required tool called and the
    answer matches the question's regex.
    """
    required, allowed = set(q["required"]), set(q["required"]) | set(q["optional"])
    distinct = set(called)
    answer_ok = re.search(q["answer_regex"], answer) is not None
    return {
        "hit": len(distinct & required),
        "required": len(required),
        "relevant": len(distinct & allowed),
        "distinct": len(distinct),
        "missing": sorted(required - distinct),
        "extra": sorted(distinct - allowed),
        "answer_ok": answer_ok,
        "passed": required <= distinct and answer_ok,
    }


def run_one(q: dict[str, Any], mcp_config: Path, model: str | None) -> Outcome:
    system = (
        f"Today is {date.today().isoformat()} (JST). You plan ski days in Hakuba Valley with the "
        "hakuba tools only. Answer in the user's language, briefly, with times and units."
    )
    cmd = [
        "claude",
        "-p",
        q["question"],
        "--mcp-config",
        str(mcp_config),
        "--strict-mcp-config",  # only our server, not the owner's other MCP servers
        "--tools",
        "",  # no built-in tools: the agent can only use hakuba
        "--allowedTools",
        f"{PREFIX}*",
        "--setting-sources",
        "",  # no user/project hooks or plugins in the measured run
        "--no-session-persistence",
        "--append-system-prompt",
        system,
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    if model:
        cmd += ["--model", model]
    # Drop ANTHROPIC_API_KEY & co. so the CLI uses the subscription login and never bills the
    # API credit; drop CLAUDE* too, since a parent Claude Code session's vars force bare mode.
    env = {k: v for k, v in os.environ.items() if not k.startswith(("ANTHROPIC", "CLAUDE"))}
    start = time.monotonic()
    with tempfile.TemporaryDirectory() as cwd:  # outside the repo, so its CLAUDE.md isn't loaded
        try:
            proc = subprocess.run(
                cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=TIMEOUT_S
            )
        except subprocess.TimeoutExpired:
            return Outcome(q["id"], q["lang"], [], "", 0, TIMEOUT_S, "timeout")
    called, answer, turns, error = parse_stream(proc.stdout.splitlines())
    if proc.returncode and not error:
        error = f"exit {proc.returncode}: {proc.stderr.strip()[:200]}"
    return Outcome(q["id"], q["lang"], called, answer, turns, time.monotonic() - start, error)


def report(questions: list[dict[str, Any]], outcomes: list[Outcome]) -> str:
    rows = [
        "| id | lang | pass | tools called | missing | extra | answer check | turns | s |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    hit = required = relevant = distinct = passed = 0
    details: list[str] = []
    for q, o in zip(questions, outcomes, strict=True):
        s = score(q, o.called, o.answer)
        hit, required = hit + s["hit"], required + s["required"]
        relevant, distinct = relevant + s["relevant"], distinct + s["distinct"]
        passed += s["passed"]
        check = ("ok" if s["answer_ok"] else "FAIL") + f" ({q['check']})"
        rows.append(
            f"| {o.id} | {o.lang} | {'PASS' if s['passed'] else 'FAIL'} | "
            f"{', '.join(o.called) or '-'} | {', '.join(s['missing']) or '-'} | "
            f"{', '.join(s['extra']) or '-'} | {check} | {o.turns} | {o.seconds:.0f} |"
        )
        excerpt = " ".join(o.answer.split())[:300]
        details.append(f"- **{o.id}**{f' (error: {o.error})' if o.error else ''}: {excerpt}")
    precision = relevant / distinct if distinct else 0.0
    recall = hit / required if required else 0.0
    summary = (
        f"**{passed}/{len(outcomes)} passed** · tool-call precision {precision:.2f} "
        f"({relevant}/{distinct}) · recall {recall:.2f} ({hit}/{required})"
    )
    return "\n".join([summary, "", *rows, "", "Answer excerpts:", "", *details, ""])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="also write the markdown report here")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--model", help="claude --model value (default: the CLI's default)")
    parser.add_argument("--only", help="comma-separated question ids")
    args = parser.parse_args()

    questions: list[dict[str, Any]] = json.loads((HERE / "trip_questions.json").read_text())
    if args.only:
        questions = [q for q in questions if q["id"] in args.only.split(",")]
    api_url = os.environ.get("HAKUBA_API_URL", "http://127.0.0.1:8010")
    config = {
        "mcpServers": {"hakuba": {"command": str(SERVER), "env": {"HAKUBA_API_URL": api_url}}}
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(config, f)
    mcp_config = Path(f.name)
    try:
        with ThreadPoolExecutor(args.workers) as pool:
            run = partial(run_one, mcp_config=mcp_config, model=args.model)
            outcomes = list(pool.map(run, questions))
    finally:
        mcp_config.unlink()
    header = (
        f"# Agent eval: last run\n\n{date.today().isoformat()} · model: "
        f"{args.model or 'Claude Code default'} · API: {api_url} · "
        f"{len(questions)} questions\n\n"
    )
    text = header + report(questions, outcomes)
    print(text)
    if args.out:
        args.out.write_text(text)


if __name__ == "__main__":
    main()
