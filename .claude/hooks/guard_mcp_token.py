#!/usr/bin/env python3
"""PreToolUse hook: keep the MCP connector token out of the transcript and out of git.

The token is the secret part of the production `/mcp/<token>` path (SPEC-agent-tools v2). It lives
only in Vercel's env and the owner's mcp-connector-url.txt, and the repo is public. Denies:
- any Bash, Read or Grep call that names mcp-connector-url.txt (reading it prints the token);
- a Bash `git commit` while the tracked changes add an `/mcp/<token>`-shaped path.
Reads the hook JSON on stdin; prints a deny decision on stdout, or nothing to allow.
Tested by scripts/test-guard-mcp-token.sh (run in CI).
"""

import json
import os
import re
import subprocess
import sys

SECRET_FILE = "mcp-connector-url.txt"
# A long URL-safe segment right after /mcp/, ending the path. A file such as services/mcp/mlflow.db
# or a placeholder such as /mcp/<HAKUBA_MCP_TOKEN> doesn't match.
TOKEN_PATH = re.compile(r"/mcp/[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_./-])")
GIT_COMMIT = re.compile(r"\bgit\b[^;&|]*\bcommit\b")
GIT_DASH_C = re.compile(r"\bgit\s+-C\s+(\S+)[^;&|]*\bcommit\b")


def deny(reason: str) -> None:
    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(out))


def added_token_lines(cwd: str) -> list[str]:
    # shortcut: diffs tracked files against HEAD (staged and unstaged, so `git commit -a` and
    # `git add x && git commit` are covered); a file first added in the same command is missed.
    diff = subprocess.run(
        ["git", "diff", "HEAD", "--no-color", "--unified=0"],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if diff.returncode != 0:  # no HEAD yet: compare the index with the empty tree
        diff = subprocess.run(
            ["git", "diff", "--cached", "--no-color", "--unified=0"],
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    return [
        line
        for line in diff.stdout.splitlines()
        if line.startswith("+") and not line.startswith("+++") and TOKEN_PATH.search(line)
    ]


def main() -> None:
    event = json.load(sys.stdin)
    tool = event.get("tool_name", "")
    tool_input = event.get("tool_input") or {}
    cwd = event.get("cwd") or "."

    if tool == "Bash":
        command = tool_input.get("command", "")
        if SECRET_FILE in command:
            deny(
                f"{SECRET_FILE} holds the MCP connector token; reading it would put the secret in "
                "the transcript. Use the placeholder /mcp/<HAKUBA_MCP_TOKEN>, or ask the owner."
            )
            return
        dash_c = GIT_DASH_C.search(command)
        repo = os.path.join(cwd, os.path.expanduser(dash_c.group(1).strip("'\""))) if dash_c else cwd
        if GIT_COMMIT.search(command) and added_token_lines(repo):
            deny(
                "The changes to commit add an /mcp/<token>-shaped path, which looks like the MCP "
                "connector token, and the repo is public. Replace it with /mcp/<HAKUBA_MCP_TOKEN> "
                "(find it with `git diff HEAD | grep /mcp/`), then commit."
            )
            return
    elif tool in ("Read", "Grep"):
        if SECRET_FILE in (tool_input.get("file_path") or tool_input.get("path") or ""):
            deny(f"{SECRET_FILE} holds the MCP connector token; don't read it. Ask the owner.")


if __name__ == "__main__":
    main()
