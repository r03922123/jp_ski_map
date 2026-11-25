#!/usr/bin/env python3
"""Build the evidence for the daily role retro (stdlib only, read-only git).

    python3 scripts/daily_retro.py context     # JSON: per role, its mode and its evidence
    python3 scripts/daily_retro.py mark-done   # record this run (after the report is written)
    python3 scripts/daily_retro.py stats       # acceptance rate per role (the loop's eval)

An engineering role whose paths changed since the last run reviews those commits ("retro"); one
with no changes researches one improvement in its area ("ideate"). The tech writer proposes one
story a day, or drafts the article for a story the owner accepted ("draft"). Commits come from
every local ref, so unpushed and worktree commits count. State lives in the gitignored .ops/
folder on the owner's Mac.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OPS = ROOT / ".ops"
STATE = OPS / "state.json"
PROPOSALS = OPS / "proposals.json"
MAX_COMMITS = 60  # per role; beyond this the role gets subjects only

# role -> regex over changed paths that makes a commit the role's, and the specs it owns.
# Engineering roles get their own files per commit; the tech writer gets every commit's subject.
ROLES: dict[str, dict] = {
    "mle": {
        "pattern": r"^(ml/(search|timetable_vlm)/|pipeline/|infra/|data/|\.github/|vercel\.json"
        r"|api/|scripts/(?!daily)|services/api/src/hakuba_api/(ranking|crowd)/"
        r"|SPEC-(pipeline|deploy|routing|bus-schedules|resort-ranking|crowd-level|place-search)\.md)",
        "specs": [
            "SPEC-pipeline.md",
            "SPEC-deploy.md",
            "SPEC-routing.md",
            "SPEC-bus-schedules.md",
            "SPEC-resort-ranking.md",
            "SPEC-crowd-level.md",
            "SPEC-place-search.md",
        ],
    },
    "ai-engineer": {
        "pattern": r"^(services/mcp/|\.claude/|docs/harness\.md|scripts/daily|"
        r"SPEC-(agent-tools|ask-maps)\.md|docs/adr/0007)",
        "specs": [
            "SPEC-agent-tools.md",
            "SPEC-ask-maps.md",
            "docs/harness.md",
            "docs/adr/0007-automated-verification-and-capped-llm.md",
        ],
    },
    "fullstack": {
        "pattern": r"^(apps/web/src/(lib|app)/|apps/web/tests/"
        r"|apps/web/(package\.json|next\.config\.ts|tsconfig\.json)|services/api/(src/hakuba_api/(?!ranking|crowd)|tests/|pyproject\.toml|uv\.lock)"
        r"|SPEC-(snow-conditions|resort-catalog)\.md)",
        "specs": [
            "SPEC-web-app.md",
            "SPEC-saved-places.md",
            "SPEC-pilot.md",
            "SPEC-progression.md",
            "SPEC-snow-conditions.md",
            "SPEC-resort-catalog.md",
        ],
    },
    "ux": {
        "pattern": r"^(apps/web/src/components/|apps/web/e2e/|apps/web/src/app/globals\.css"
        r"|docs/ux/|SPEC-(web-app|maps-ios-ux|game-theme|pilot|saved-places|progression)\.md)",
        "specs": [
            "SPEC-web-app.md",
            "SPEC-maps-ios-ux.md",
            "SPEC-game-theme.md",
            "docs/ux/google-maps-workflows.md",
        ],
    },
}
WRITER_SOURCES = (
    r"^(docs/adr/|docs/learning-log\.md|docs/harness\.md|SPEC.*\.md|.*evals?/|ml/.*README)"
)
WRITER_BACKLOG = [
    "docs/adr/",
    "docs/learning-log.md",
    "services/mcp/evals/last_run.md",
    "ml/search/README.md",
    "ml/timetable_vlm/README.md",
    "docs/harness.md",
]


def _load(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _last_run() -> datetime:
    state = _load(STATE, {})
    if "last_run" in state:
        return datetime.fromisoformat(state["last_run"])
    return datetime.now(UTC) - timedelta(days=1)


def _commits(since: datetime) -> list[dict]:
    out = subprocess.run(
        [
            "git",
            "log",
            "--all",
            "--no-merges",
            f"--since={since.isoformat()}",
            "--name-only",
            "--format=@@%H%x09%h%x09%cI%x09%s",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    commits = []
    for block in out.split("@@")[1:]:
        head, *files = block.strip().split("\n")
        full, short, when, subject = head.split("\t", 3)
        commits.append(
            {
                "full": full,
                "hash": short,
                "date": when,
                "subject": subject,
                "files": [f for f in files if f],
            }
        )
    return commits


def _past(proposals: list[dict], role: str) -> list[dict]:
    keys = ("id", "title", "status")
    return [{k: p.get(k) for k in keys} for p in proposals if p.get("role") == role][-30:]


def context() -> dict:
    since = _last_run()
    seen = set(_load(STATE, {}).get("seen", []))
    commits = [c for c in _commits(since) if c["full"] not in seen]
    proposals = _load(PROPOSALS, [])
    roles = {}
    for role, spec in ROLES.items():
        rx = re.compile(spec["pattern"])
        mine = [{**c, "files": [f for f in c["files"] if rx.match(f)]} for c in commits]
        mine = [c for c in mine if c["files"]]
        roles[role] = {
            "mode": "retro" if mine else "ideate",
            "commits": mine[:MAX_COMMITS],
            "more_commits": [f"{c['hash']} {c['subject']}" for c in mine[MAX_COMMITS:]],
            "specs": spec["specs"],
            "past_proposals": _past(proposals, role),
        }
    src = re.compile(WRITER_SOURCES)
    drafts = [
        p
        for p in proposals
        if p.get("role") == "tech-writer" and p.get("status") == "accepted" and not p.get("draft")
    ]
    roles["tech-writer"] = {
        "mode": "draft" if drafts else "idea",
        "commits": [f"{c['hash']} {c['date'][:10]} {c['subject']}" for c in commits],
        "story_sources_changed": sorted({f for c in commits for f in c["files"] if src.match(f)}),
        "backlog_sources": WRITER_BACKLOG,
        "draft_requests": [
            {k: p.get(k) for k in ("id", "title", "angle", "evidence")} for p in drafts[:1]
        ],
        "past_proposals": _past(proposals, "tech-writer"),
    }
    patterns = [re.compile(r["pattern"]) for r in ROLES.values()]
    unassigned = [
        f"{c['hash']} {c['subject']}"
        for c in commits
        if not any(p.match(f) for p in patterns for f in c["files"])
    ]
    return {
        "since": since.isoformat(),
        "commits_total": len(commits),
        "unassigned": unassigned,
        "roles": roles,
    }


def mark_done() -> None:
    now = datetime.now(UTC)
    # remember the window's hashes, so a commit dated just before the cut isn't reviewed twice
    seen = [c["full"] for c in _commits(_last_run() - timedelta(days=2))]
    OPS.mkdir(exist_ok=True)
    STATE.write_text(json.dumps({"last_run": now.isoformat(), "seen": seen}, indent=1))
    print(f"recorded run at {now.isoformat()}")


def stats() -> None:
    proposals = _load(PROPOSALS, [])
    print("| Role | Proposed | Accepted | Rejected | Acceptance |")
    print("|---|---|---|---|---|")
    for role in [*ROLES, "tech-writer"]:
        mine = [p for p in proposals if p.get("role") == role]
        acc = sum(p.get("status") in ("accepted", "done") for p in mine)
        rej = sum(p.get("status") == "rejected" for p in mine)
        rate = f"{acc / (acc + rej):.0%} of {acc + rej}" if acc + rej else "—"
        print(f"| {role} | {len(mine)} | {acc} | {rej} | {rate} |")


if __name__ == "__main__":
    commands = {
        "context": lambda: print(json.dumps(context(), ensure_ascii=False, indent=1)),
        "mark-done": mark_done,
        "stats": stats,
    }
    cmd = sys.argv[1] if len(sys.argv) > 1 else "context"
    if cmd not in commands:
        sys.exit(__doc__)
    commands[cmd]()
