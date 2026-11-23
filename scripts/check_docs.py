#!/usr/bin/env python3
"""Keep the docs a true map for agents (stdlib only; CI job `docs`).

    python3 scripts/check_docs.py

Fails when:
1. a relative markdown link points nowhere (fenced and inline code are skipped);
2. a SPEC, docs/ARCHITECTURE.md or docs/ml-tour.md names a repo path, in backticks, that doesn't exist, unless the
   path is gitignored or docs/doc-check-allow.txt lists it with a reason (planned or generated);
3. CLAUDE.md (AGENTS.md links to it) grows past MAX_CLAUDE_LINES: it is a map, not a manual.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_CLAUDE_LINES = 40
ALLOW_FILE = ROOT / "docs" / "doc-check-allow.txt"
PATH_RE = re.compile(r"`((?:apps|services|ml|pipeline|scripts|data|infra)/[A-Za-z0-9_./-]+)`")
LINK_RE = re.compile(r"\]\(([^)#\s]+)(?:#[^)]*)?\)")
FENCE_RE = re.compile(r"^(```|~~~).*?^\1", re.S | re.M)
INLINE_RE = re.compile(r"`[^`\n]*`")


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def broken_links() -> list[str]:
    bad = []
    for name in _git("ls-files", "*.md").stdout.split():
        md = ROOT / name
        text = INLINE_RE.sub("", FENCE_RE.sub("", md.read_text(errors="ignore")))
        for m in LINK_RE.finditer(text):
            target = m.group(1)
            if not re.match(r"^[a-z]+:", target) and not (md.parent / target).exists():
                bad.append(f"{name}: broken link -> {target}")
    return bad


def _ignored(path: str) -> bool:
    p = path.rstrip("/")
    return any(_git("check-ignore", "-q", q).returncode == 0 for q in (p, f"{p}/x"))


def _allowed() -> dict[str, str]:
    allow = {}
    for line in ALLOW_FILE.read_text().splitlines() if ALLOW_FILE.exists() else []:
        if line.strip() and not line.startswith("#"):
            path, _, reason = line.partition(" ")
            if not reason.strip():
                raise SystemExit(f"{ALLOW_FILE.name}: '{path}' needs a reason")
            allow[path] = reason.strip()
    return allow


def missing_paths() -> list[str]:
    allow, used, bad = _allowed(), set(), []
    for doc in sorted(ROOT.glob("SPEC*.md")) + [ROOT / "docs" / f for f in ("ARCHITECTURE.md", "ml-tour.md")]:
        for p in sorted(set(PATH_RE.findall(doc.read_text()))):
            if any(c in p for c in "*<{"):
                continue
            if p in allow:
                used.add(p)
            elif not (ROOT / p.rstrip("/")).exists() and not _ignored(p):
                bad.append(
                    f"{doc.name}: `{p}` does not exist (fix it, or list it in {ALLOW_FILE.name})"
                )
    for p in allow:
        if p not in used or (ROOT / p.rstrip("/")).exists():
            bad.append(f"{ALLOW_FILE.name}: `{p}` exists now or is no longer named; drop the line")
    return bad


def long_claude_md() -> list[str]:
    n = len((ROOT / "CLAUDE.md").read_text().splitlines())
    if n <= MAX_CLAUDE_LINES:
        return []
    return [
        f"CLAUDE.md has {n} lines (max {MAX_CLAUDE_LINES}): move detail into a SPEC, doc or skill"
    ]


def main() -> int:
    problems = broken_links() + missing_paths() + long_claude_md()
    print("\n".join(problems + [f"check_docs: {len(problems)} problem(s)"]))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
