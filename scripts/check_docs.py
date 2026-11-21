#!/usr/bin/env python3
"""Mechanical checks that keep the repo's docs a trustworthy map for agents (stdlib only).

    python3 scripts/check_docs.py            # fail on broken links, missing paths, a long CLAUDE.md
    python3 scripts/check_docs.py --signals  # per-module signals table for docs/QUALITY_SCORE.md
    python3 scripts/check_docs.py --signals --write  # refresh that table in place

Checks:
1. Every relative markdown link resolves (fenced and inline code are skipped).
2. Every backticked repo path in SPEC*.md and docs/ARCHITECTURE.md exists, unless
   docs/doc-check-allow.txt lists it with a reason (planned, generated or gitignored).
3. CLAUDE.md (AGENTS.md links to it) stays a short map: at most MAX_CLAUDE_LINES lines.
"""

from __future__ import annotations

import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_CLAUDE_LINES = 40
ALLOW_FILE = ROOT / "docs" / "doc-check-allow.txt"
DEBT_FILE = ROOT / "docs" / "tech-debt-tracker.md"
SKIP_DIRS = {"node_modules", ".venv", ".next", ".git", "worktrees", ".claude/worktrees"}
PATH_RE = re.compile(r"`((?:apps|services|ml|pipeline|scripts|data|infra)/[A-Za-z0-9_./-]+)`")
LINK_RE = re.compile(r"\]\(([^)#\s]+)(?:#[^)]*)?\)")
FENCE_RE = re.compile(r"^(```|~~~).*?^\1", re.S | re.M)
INLINE_RE = re.compile(r"`[^`\n]*`")

# module id -> (spec, code paths, test paths). Web modules split by file name; web-app is the rest.
WEB = "apps/web/src"
WEB_T = "apps/web/tests"
MODULES: dict[str, tuple[str, list[str], list[str]]] = {
    "resort-catalog": (
        "SPEC-resort-catalog.md",
        ["services/api/src/hakuba_api/catalog", "data/resorts.json"],
        ["services/api/tests/catalog"],
    ),
    "place-search": (
        "SPEC-place-search.md",
        ["services/api/src/hakuba_api/places", "ml/search"],
        ["services/api/tests/places", "ml/search/tests"],
    ),
    "routing": (
        "SPEC-routing.md",
        ["services/api/src/hakuba_api/routing", "infra"],
        ["services/api/tests/routing"],
    ),
    "snow-conditions": (
        "SPEC-snow-conditions.md",
        ["services/api/src/hakuba_api/snow"],
        ["services/api/tests/snow"],
    ),
    "crowd-level": (
        "SPEC-crowd-level.md",
        ["services/api/src/hakuba_api/crowd"],
        ["services/api/tests/crowd"],
    ),
    "bus-schedules": (
        "SPEC-bus-schedules.md",
        ["services/api/src/hakuba_api/bus", "data/bus", "ml/timetable_vlm"],
        ["services/api/tests/bus", "ml/timetable_vlm/tests"],
    ),
    "resort-ranking": (
        "SPEC-resort-ranking.md",
        ["services/api/src/hakuba_api/ranking"],
        ["services/api/tests/ranking"],
    ),
    "poi-destinations": (
        "SPEC-poi-destinations.md",
        ["services/api/src/hakuba_api/pois"],
        ["services/api/tests/pois"],
    ),
    "saved-places": (
        "SPEC-saved-places.md",
        [
            f"{WEB}/lib/saved-places.ts",
            f"{WEB}/lib/saved-share.ts",
            f"{WEB}/lib/use-lists.ts",
            f"{WEB}/components/SaveButton.tsx",
            f"{WEB}/components/SavedPanel.tsx",
            f"{WEB}/components/ListPicker.tsx",
            f"{WEB}/components/ImportDialog.tsx",
        ],
        [
            f"{WEB_T}/saved-places.test.ts",
            f"{WEB_T}/saved-share.test.ts",
            f"{WEB_T}/SaveButton.test.tsx",
            f"{WEB_T}/SavedPanel.test.tsx",
        ],
    ),
    "pilot": (
        "SPEC-pilot.md",
        [
            f"{WEB}/lib/nav",
            f"{WEB}/lib/wake-lock.ts",
            f"{WEB}/components/PilotView.tsx",
            f"{WEB}/components/PilotScreens.tsx",
            f"{WEB}/components/BusPilotView.tsx",
            f"{WEB}/components/ManeuverIcon.tsx",
        ],
        [
            f"{WEB_T}/pilot.test.tsx",
            f"{WEB_T}/nav.test.ts",
            f"{WEB_T}/reroute.test.tsx",
            f"{WEB_T}/position.test.ts",
            f"{WEB_T}/proximity.test.ts",
            f"{WEB_T}/bus-journey.test.tsx",
        ],
    ),
    "game-theme": (
        "SPEC-game-theme.md",
        [
            f"{WEB}/lib/game",
            f"{WEB}/components/PixelSprite.tsx",
            f"{WEB}/components/TitleScreen.tsx",
            f"{WEB}/components/HeroMarker.tsx",
        ],
        [
            f"{WEB_T}/game-map-style.test.ts",
            f"{WEB_T}/game-sprites.test.ts",
            f"{WEB_T}/game-tokens.test.ts",
            f"{WEB_T}/TitleScreen.test.tsx",
            f"{WEB_T}/HeroMarker.test.tsx",
        ],
    ),
    "progression": (
        "SPEC-progression.md",
        [f"{WEB}/components/StampMoment.tsx", f"{WEB}/components/CheckInButton.tsx"],
        [f"{WEB_T}/stamps.test.ts", f"{WEB_T}/rider.test.ts"],
    ),
    "web-app": ("SPEC-web-app.md", ["apps/web/src"], ["apps/web/tests", "apps/web/e2e"]),
    "deploy": (
        "SPEC-deploy.md",
        ["scripts", "vercel.json", "api"],
        ["scripts/test-deploy-vercel.sh"],
    ),
    "agent-tools": ("SPEC-agent-tools.md", ["services/mcp/src"], ["services/mcp/tests"]),
    "pipeline": ("SPEC-pipeline.md", ["pipeline/src"], ["pipeline/tests"]),
    "ask-maps": ("SPEC-ask-maps.md", [], []),
}
TEST_PATTERNS = {
    ".py": re.compile(r"^\s*(?:async\s+)?def test_", re.M),
    ".ts": re.compile(r"^\s*(?:it|test)(?:\.each\([^)]*\))?\(", re.M),
    ".tsx": re.compile(r"^\s*(?:it|test)(?:\.each\([^)]*\))?\(", re.M),
    ".sh": re.compile(r"^\s*expect_\w+ ", re.M),  # assertion calls in scripts/test-*.sh
}


def _skipped(p: Path) -> bool:
    rel = p.relative_to(ROOT).as_posix()
    return any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts) or rel.startswith(
        ".claude/worktrees"
    )


def _tracked_md() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "*.md"], cwd=ROOT, capture_output=True, text=True, check=True
    )
    return [ROOT / f for f in out.stdout.split() if not _skipped(ROOT / f)]


def _strip_code(text: str) -> str:
    return INLINE_RE.sub("", FENCE_RE.sub("", text))


def broken_links() -> list[str]:
    bad = []
    for md in _tracked_md():
        for m in LINK_RE.finditer(_strip_code(md.read_text(errors="ignore"))):
            target = m.group(1)
            if re.match(r"^[a-z]+:", target):  # http:, mailto:, computer:
                continue
            if not (md.parent / target).exists():
                bad.append(f"{md.relative_to(ROOT)}: broken link -> {target}")
    return bad


def allowed_paths() -> dict[str, str]:
    allow = {}
    if ALLOW_FILE.exists():
        for line in ALLOW_FILE.read_text().splitlines():
            if line.strip() and not line.startswith("#"):
                path, _, reason = line.partition(" ")
                if not reason.strip():
                    raise SystemExit(f"{ALLOW_FILE.name}: '{path}' needs a reason")
                allow[path] = reason.strip()
    return allow


def _ignored(p: str) -> bool:
    """Gitignored paths (tiles, raw downloads, MLflow runs) are absent from a clean checkout."""
    probe = p.rstrip("/")
    return any(
        subprocess.run(["git", "check-ignore", "-q", q], cwd=ROOT).returncode == 0
        for q in (probe, f"{probe}/x")
    )


def missing_paths() -> list[str]:
    allow = allowed_paths()
    bad, used = [], set()
    for doc in sorted(ROOT.glob("SPEC*.md")) + [ROOT / "docs" / "ARCHITECTURE.md"]:
        for p in sorted(set(PATH_RE.findall(doc.read_text()))):
            if any(c in p for c in "*<{"):
                continue
            if p in allow:
                used.add(p)
            elif not (ROOT / p.rstrip("/")).exists() and not _ignored(p):
                bad.append(
                    f"{doc.name}: `{p}` does not exist "
                    f"(fix the doc, or list it in {ALLOW_FILE.name})"
                )
    bad += [
        f"{ALLOW_FILE.name}: `{p}` is no longer referenced or now exists; drop the line"
        for p in allow
        if p not in used or (ROOT / p.rstrip("/")).exists()
    ]
    return bad


def claude_md_length() -> list[str]:
    n = len((ROOT / "CLAUDE.md").read_text().splitlines())
    return (
        [f"CLAUDE.md has {n} lines (max {MAX_CLAUDE_LINES}): move detail into a SPEC, doc or skill"]
        if n > MAX_CLAUDE_LINES
        else []
    )


# ---- signals -------------------------------------------------------------------------------


def _last_change(paths: list[str]) -> date | None:
    existing = [p for p in paths if (ROOT / p).exists()]
    if not existing:
        return None
    out = subprocess.run(
        ["git", "log", "-1", "--format=%cs", "--", *existing],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return date.fromisoformat(out) if out else None


def _count_tests(paths: list[str]) -> int:
    n = 0
    for p in paths:
        root = ROOT / p
        files = [root] if root.is_file() else (root.rglob("*") if root.exists() else [])
        for f in files:
            pat = TEST_PATTERNS.get(f.suffix)
            if (
                pat
                and f.is_file()
                and not _skipped(f)
                and ("test" in f.name or f.parent.name in {"tests", "e2e"})
            ):
                n += len(pat.findall(f.read_text(errors="ignore")))
    return n


def _criteria(spec: str) -> tuple[int, int]:
    text = (ROOT / spec).read_text()
    return text.count("- [x]"), text.count("- [x]") + text.count("- [ ]")


def _open_debt() -> dict[str, int]:
    counts: dict[str, int] = {}
    if DEBT_FILE.exists():
        in_open = False
        for line in DEBT_FILE.read_text().splitlines():
            if line.startswith("## "):
                in_open = line.strip() == "## Open"
            elif in_open and line.startswith("| D"):
                module = line.split("|")[2].strip().strip("`")
                counts[module] = counts.get(module, 0) + 1
    return counts


def signals() -> str:
    head = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    debt = _open_debt()
    rows = [
        f"Signals at `{head}` ({date.today().isoformat()}), "
        "from `python3 scripts/check_docs.py --signals`.",
        "",
        "| Module | Spec changed | Code changed | Spec behind code | Tests | Criteria ticked "
        "| Open debt | Mechanical grade |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for mod, (spec, code, tests) in MODULES.items():
        s, c = _last_change([spec]), _last_change(code)
        lag = (c - s).days if s and c and c > s else 0
        n = _count_tests(tests)
        ticked, total = _criteria(spec)
        d = debt.get(mod, 0)
        if not code:
            grade = "— (proposed)"
        else:
            score = 4 - (n == 0) - (lag > 14) - min(d, 2)
            grade = "ABCD"[4 - max(score, 1)]
        rows.append(
            f"| `{mod}` | {s or '—'} | {c or '—'} | {lag} d | {n} "
            f"| {ticked}/{total} | {d} | {grade} |"
        )
    return "\n".join(rows)


def main() -> int:
    if "--signals" in sys.argv:
        table = signals()
        if "--write" not in sys.argv:
            print(table)
            return 0
        score = ROOT / "docs" / "QUALITY_SCORE.md"
        text = score.read_text()
        start, end = "<!-- signals:start -->\n", "<!-- signals:end -->"
        before, _, rest = text.partition(start)
        _, _, after = rest.partition(end)
        score.write_text(f"{before}{start}{table}\n{end}{after}")
        print(f"updated {score.relative_to(ROOT)}")
        return 0
    problems = broken_links() + missing_paths() + claude_md_length()
    for p in problems:
        print(p)
    print(f"check_docs: {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
