#!/usr/bin/env bash
# Tests .claude/hooks/guard_mcp_token.py (SPEC-refactor R1.3) with hook JSON on stdin, in a
# throwaway git repo. Each case says whether the hook must deny the call.
set -euo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
HOOK="$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/guard_mcp_token.py"
REPO=$(mktemp -d)
trap 'rm -rf "$REPO"' EXIT
FAILED=0
# Built at run time so this file never holds a token-shaped path itself.
TOK="Ab3dEf6hIj9kLm2nOp5q""Rs8tUv_w-x"

git_q() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false "$@"; }
git_q init -q
echo 'base' >"$REPO/a.txt"
git_q add a.txt
git_q commit -qm base

# check <deny|allow> <name> <json>
check() {
  local want=$1 name=$2 out got
  out=$(printf '%s' "$3" | python3 "$HOOK")
  if [[ $out == *'"permissionDecision": "deny"'* ]]; then got=deny; else got=allow; fi
  if [[ $got == "$want" ]]; then echo "  ok: $name"; else echo "  FAIL: $name (want $want, got $got: $out)"; FAILED=1; fi
}
# bash_call <command> [cwd, default the repo]
bash_call() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]},"cwd":sys.argv[2]}))' "$1" "${2:-$REPO}"; }

check deny "cat the connector file" "$(bash_call 'cat ~/.config/jp_ski_map/mcp-connector-url.txt')"
check deny "Read the connector file" '{"tool_name":"Read","tool_input":{"file_path":"/Users/x/.config/jp_ski_map/mcp-connector-url.txt"}}'
check deny "Grep the connector file" '{"tool_name":"Grep","tool_input":{"pattern":"mcp","path":"/Users/x/.config/jp_ski_map/mcp-connector-url.txt"}}'
check allow "Read another file" '{"tool_name":"Read","tool_input":{"file_path":"/repo/CLAUDE.md"}}'
check allow "ordinary command" "$(bash_call 'ls -la')"
check allow "commit with clean changes" "$(bash_call 'git commit -m x')"

echo "see services/mcp/mlflow.db and /mcp/<HAKUBA_MCP_TOKEN>" >"$REPO/a.txt"
git_q add a.txt
check allow "commit a placeholder and an mcp file path" "$(bash_call 'git commit -m x')"

echo "url: https://example.invalid/mcp/$TOK" >"$REPO/a.txt"
git_q add a.txt
check deny "commit a staged token path" "$(bash_call 'git commit -m x')"
check deny "git -C <repo> commit from another folder" "$(bash_call "git -C $REPO commit -m x" /)"
check allow "git status with a token path staged" "$(bash_call 'git status')"

git_q reset -q
check deny "git add && git commit, token path unstaged" "$(bash_call 'git add a.txt && git commit -m x')"
check deny "commit -a, token path unstaged" "$(bash_call 'git commit -am x')"

if [[ $FAILED -ne 0 ]]; then echo "guard_mcp_token: FAILED"; exit 1; fi
echo "guard_mcp_token: all cases pass"
