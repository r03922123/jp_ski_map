#!/usr/bin/env python3
"""Ground the daily role retro in git and the repo's own records (stdlib only, read-only git).

    python3 scripts/daily_retro.py context     # JSON: per role, retro or ideate, with its evidence
    python3 scripts/daily_retro.py mark-done   # record this run (after the report is written)
    python3 scripts/daily_retro.py stats       # acceptance rate per role from .ops/proposals.json

A role whose paths changed since the last run reviews those commits ("retro"); a role with no
changes picks one improvement from its specs, quality row and debt ("ideate"). Commits come from
every local ref (branches and worktrees share .git), so unpushed work counts too. State lives in
the gitignored .ops/ folder, so this only works in the owner's checkout, not a fresh clone.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_docs import MODULES, ROOT  # noqa: E402

OPS = ROOT / ".ops"
STATE = OPS / "state.json"
PROPOSALS = OPS / "proposals.json"
FIRST_RUN_LOOKBACK = timedelta(days=1)
MAX_COMMITS = 60  # per role; a burst beyond this is summarised by its subjects only

# role -> (paths that make a commit this role's, modules whose spec/quality/debt it reads)
ROLES: dict[str, tuple[str, list[str]]] = {
    "applied-scientist": (
        r"^(ml/|services/mcp/|services/api/src/hakuba_api/(ranking|crowd|places)/"
        r"|SPEC-(agent-tools|ask-maps|resort-ranking|crowd-level|place-search)\.md)",
        ["place-search", "resort-ranking", "crowd-level", "agent-tools", "ask-maps"],
    ),
    "platform": (
        r"^(pipeline/|infra/|scripts/|\.github/|vercel\.json|api/|data/"
        r"|services/api/(pyproject\.toml|uv\.lock|src/hakuba_api/(bus|routing|data|common|snow|catalog|pois)/)"
        r"|SPEC-(deploy|pipeline|routing|bus-schedules|snow-conditions|resort-catalog|poi-destinations)\.md)",
        [
            "pipeline",
            "deploy",
            "routing",
            "bus-schedules",
            "snow-conditions",
            "resort-catalog",
            "poi-destinations",
        ],
    ),
    "fullstack": (
        r"^(apps/web/src/(lib|app)/|apps/web/(package\.json|next\.config\.ts|tsconfig\.json)"
        r"|apps/web/tests/|services/api/src/hakuba_api/main\.py|services/api/tests/)",
        ["web-app", "saved-places", "pilot", "progression"],
    ),
    "ux": (
        r"^(apps/web/src/components/|apps/web/e2e/|apps/web/src/app/globals\.css|docs/ux/"
        r"|SPEC-(web-app|maps-ios-ux|game-theme|pilot|saved-places|progression)\.md)",
        ["web-app", "game-theme", "pilot", "saved-places"],
    ),
}


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def _load(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _commits_since(since: datetime, seen: set[str]) -> list[dict]:
    out = _git(
        "log",
        "--all",
        "--no-merges",
        f"--since={since.isoformat()}",
        "--name-only",
        "--format=@@%H%x09%h%x09%cI%x09%s",
    )
    commits = []
    for block in out.split("@@")[1:]:
        head, *files = block.strip().split("\n")
        full, short, when, subject = head.split("\t", 3)
        if full not in seen:
            commits.append(
                {
                    "hash": short,
                    "full": full,
                    "date": when,
                    "subject": subject,
                    "files": [f for f in files if f],
                }
            )
    return commits


def _quality_rows(modules: list[str]) -> list[str]:
    score = ROOT / "docs" / "QUALITY_SCORE.md"
    lines = score.read_text().splitlines() if score.exists() else []
    return [ln for ln in lines if any(ln.startswith(f"| `{m}` |") for m in modules)]


def _debt_rows(modules: list[str]) -> list[str]:
    debt = ROOT / "docs" / "tech-debt-tracker.md"
    rows, in_open = [], False
    for ln in debt.read_text().splitlines() if debt.exists() else []:
        if ln.startswith("## "):
            in_open = ln.strip() == "## Open"
        elif in_open and ln.startswith("| D") and ln.split("|")[2].strip().strip("`") in modules:
            rows.append(ln)
    return rows


def context() -> dict:
    state = _load(STATE, {})
    now = datetime.now(UTC)
    last = (
        datetime.fromisoformat(state["last_run"])
        if "last_run" in state
        else now - FIRST_RUN_LOOKBACK
    )
    commits = _commits_since(last, set(state.get("seen", [])))
    proposals = _load(PROPOSALS, [])
    roles = {}
    for role, (pattern, modules) in ROLES.items():
        rx = re.compile(pattern)
        mine = [c for c in commits if any(rx.match(f) for f in c["files"])]
        roles[role] = {
            "mode": "retro" if mine else "ideate",
            "commits": [
                {**c, "files": [f for f in c["files"] if rx.match(f)]} for c in mine[:MAX_COMMITS]
            ],
            "more_commits": [c["hash"] + " " + c["subject"] for c in mine[MAX_COMMITS:]],
            "specs": [MODULES[m][0] for m in modules],
            "code_paths": sorted({p for m in modules for p in MODULES[m][1]}),
            "test_paths": sorted({p for m in modules for p in MODULES[m][2]}),
            "quality_rows": _quality_rows(modules),
            "open_debt": _debt_rows(modules),
            "past_proposals": [
                {k: p.get(k) for k in ("id", "title", "status", "date")}
                for p in proposals
                if p.get("role") == role
            ][-30:],
        }
    return {
        "since": last.isoformat(),
        "now": now.isoformat(),
        "commits_total": len(commits),
        "unassigned": [
            c["hash"] + " " + c["subject"]
            for c in commits
            if not any(re.match(p, f) for p, _ in ROLES.values() for f in c["files"])
        ],
        "roles": roles,
    }


def mark_done() -> None:
    state = _load(STATE, {})
    now = datetime.now(UTC)
    since = (
        datetime.fromisoformat(state["last_run"])
        if "last_run" in state
        else now - FIRST_RUN_LOOKBACK
    )
    # remember the last window's hashes, so a commit dated just before the cut isn't repeated
    seen = [c["full"] for c in _commits_since(since - timedelta(days=2), set())]
    OPS.mkdir(exist_ok=True)
    STATE.write_text(json.dumps({"last_run": now.isoformat(), "seen": seen}, indent=1))
    print(f"recorded run at {now.isoformat()} ({len(seen)} commits remembered)")


def stats() -> None:
    proposals = _load(PROPOSALS, [])
    print("| Role | Proposed | Accepted | Rejected | Done | Acceptance (decided) |")
    print("|---|---|---|---|---|---|")
    for role in ROLES:
        mine = [p for p in proposals if p.get("role") == role]
        n = {
            s: sum(p.get("status") == s for p in mine)
            for s in ("proposed", "accepted", "rejected", "done")
        }
        decided = n["accepted"] + n["done"] + n["rejected"]
        rate = f"{(n['accepted'] + n['done']) / decided:.0%} of {decided}" if decided else "—"
        print(
            f"| {role} | {len(mine)} | {n['accepted']} | {n['rejected']} | {n['done']} | {rate} |"
        )


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "context"
    if cmd == "context":
        print(json.dumps(context(), ensure_ascii=False, indent=1))
    elif cmd == "mark-done":
        mark_done()
    elif cmd == "stats":
        stats()
    else:
        sys.exit(__doc__)
