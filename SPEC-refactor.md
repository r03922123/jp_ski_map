# Spec: refactor (agent-ready codebase)

> Cross-cutting work item of [SPEC.md](SPEC.md), not a new capability: it changes no module
> boundary and adds no feature. Drafted 2026-11-18 from the request "refactor the whole codebase
> as an Anthropic AI engineer would, with the best agent-development practice", on top of
> [docs/review/2026-11-18-codebase-review.md](docs/review/2026-11-18-codebase-review.md).

## Objective

Make the repo cheaper and safer for a coding agent (Claude Code) and a new human to change, with
**no change in behaviour** for the skiers using the app or the Claude chat connector.

"The whole codebase" is read as *every place where the evidence shows a cost*, not as a rewrite of
every file. Today's review found the app code in good shape (small typed modules, 800+ unit tests,
recorded fixtures, evals with error bars). A full rewrite would throw away that tested behaviour
for no measured gain, and Anthropic's own guidance (below) is to change the smallest thing that
fixes a measured problem. So the scope is the three measured costs:

| # | Cost (evidence) | Stream |
|---|---|---|
| 1 | Multi-step procedures (deploy, new worktree, data refresh) live as prose in CLAUDE.md; the rules that must never break (MCP token) are only prose, which an agent can miss | `harness` |
| 2 | `MapShell.tsx` is 1,386 lines with 49 React hooks and no unit test; `MapView.tsx` is 1,050 lines. Every web feature (next: Ask Maps A3) edits them, so each change reads ~2,400 lines of context | `web-shell` |
| 3 | Small drifts in the agent surface: SPEC-agent-tools says 11 eval questions and shows 11/11 runs, the file has 12 | `agent-tools` |

**Out of scope:** the Python API (largest file 376 lines, all tested: no measured cost); new
features; new dependencies; agent frameworks; multi-agent; the pipeline and Ask Maps work in their
own specs; style-only passes (Biome and Ruff already enforce style).

## Capability map (work streams)

| Stream id | Responsibility | Depends on |
|---|---|---|
| `harness` | Claude Code project setup: skills for multi-step procedures, a hook for the never-break rules, CLAUDE.md trimmed to traps and decisions | — |
| `agent-tools` | Fix eval and spec drift; touch tool text only where a transcript shows harm; prove no regression with the agent-tools eval | — |
| `web-shell` | Split `MapShell` and `MapView` into hooks and layer components with no behaviour change | characterization tests first (R3.1) |

Build order: `harness` → `agent-tools` → `web-shell`. The first two are small and touch no shared
files, so they can run in parallel sessions.

## Anthropic guidance applied

| Guidance | What it means here |
|---|---|
| Find the simplest solution; add complexity only when it is measured to help ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)) | Three measured costs, not a rewrite |
| Give an agent the right context, no more: keep the always-loaded file short, load procedures on demand ([Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)) | Procedures move to skills, which load only when used; CLAUDE.md keeps traps and decisions |
| Rules that must hold every time belong in deterministic code, not in the prompt (Claude Code hooks docs) | The MCP-token rule becomes a hook with its own test |
| Tools: clear names, documented parameters, errors the agent can act on ([Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)) | Tool text changes only with a failing transcript behind them, then the eval re-run |
| Measure the new version against the current one before shipping (owner rule) | Eval before/after; screenshots before/after |

## Requirements and Done

### R1 `harness`
1. `.claude/skills/deploy/SKILL.md` holds the deploy + smoke-test procedure now in CLAUDE.md
   (the `deploy-vercel.sh` call, `--prod`, the e2e-prod command, the npx `vercel` PATH prefix).
2. `.claude/skills/new-worktree/SKILL.md` holds the worktree setup (`uv sync`, `pnpm install`,
   free ports, `API_URL`, `E2E_BASE_URL`, no `docker compose`).
3. A `PreToolUse` hook in `.claude/settings.json` (committed, not `settings.local.json`) blocks a
   Bash command that reads `mcp-connector-url.txt` or a `git commit` whose staged diff contains an
   `/mcp/<token>`-shaped path, and says why. Its script has a test run in CI.
4. CLAUDE.md shrinks by the moved lines and points to the skills; `AGENTS.md` stays its symlink.

Done: a fresh Claude Code session asked "deploy a preview" loads the `deploy` skill (transcript);
the hook test passes in CI; CLAUDE.md is shorter than today's 31 lines.

### R2 `agent-tools`
1. SPEC-agent-tools.md matches the eval file (12 questions).
2. Change a tool docstring or `ToolError` message only where an eval transcript shows the model
   misled by it. SPEC-agent-tools already records one wording change that the eval could not
   tell from noise and was reverted, so an unmeasured "cleanup" of tool text is a risk, not a
   refactor.
3. No tool is added, removed or renamed (the claude.ai connector and Ask depend on the names).

Done: `services/mcp` gates pass; the agent-tools eval is ≥ its last result (12/12) with n stated,
run against the same API; the Ask unit tests pass unchanged.

### R3 `web-shell`
1. First, characterization tests for MapShell's state transitions (mode switch, origin set,
   destination set, pilot start/stop) that pass on today's code.
2. Extract state and effects into `src/lib/` hooks (one concern each, e.g. route fetching, pilot
   session, URL sync) and MapView's sources/layers into components, in commits of ≤ ~300 changed
   lines, each green on its own.
3. No existing test is edited except imports; no visible change.

Done: `MapShell.tsx` ≤ 500 lines and `MapView.tsx` ≤ 600; vitest and the full Playwright suite
pass; screenshots of the 3 modes plus pilot match before/after (desktop and mobile size).

## Commands

```bash
# api / mcp (from the repo root)
uv run --directory services/api --frozen ruff check && uv run --directory services/api --frozen pyright && uv run --directory services/api --frozen pytest -q
uv run --directory services/mcp --frozen ruff check && uv run --directory services/mcp --frozen pyright && uv run --directory services/mcp --frozen pytest -q
uv run --directory services/mcp --frozen python evals/run_eval.py   # agent-tools eval (needs the API on :8010)
# web
pnpm --dir apps/web exec biome ci && pnpm --dir apps/web typecheck && pnpm --dir apps/web test
pnpm --dir apps/web e2e        # full suite; needs the API, Valhalla and `pnpm dev`
```

## Tasks (each one PR, built in a fresh session from this file)

| # | Task | Check |
|---|---|---|
| H1 | `harness`: R1.1–R1.4 (`deploy` and `new-worktree` skills, the token hook with its test wired into CI, CLAUDE.md trimmed) | hook test green in CI; a fresh `claude -p "how do I deploy a preview?"` transcript shows the `deploy` skill loaded |
| T1 | `agent-tools`: R2.1–R2.3; the eval re-run also closes the A1 leftover ("re-run with the new ids", tasks/todo.md) | MCP gates; `evals/last_run.md` with n, ≥ 12/12, same API sha before/after |
| W1 | `web-shell` R3.1: characterization tests for MapShell's state transitions, passing on today's code | vitest green; tests fail when a transition is broken by hand |
| W2 | R3.2 for MapShell: hooks into `src/lib/` | MapShell ≤ 500 lines; vitest + Playwright green; screenshots match |
| W3 | R3.2 for MapView: sources and layers into components | MapView ≤ 600 lines; same checks |

H1 and T1 share no files and can run at the same time. W1 → W2 → W3 run in order, before Ask Maps A3
(owner decision, 2026-11-18).

## Testing strategy

Behaviour-preserving refactor, so the existing 800+ unit tests are the contract. New tests only where
coverage is missing before a move (R3.1) and for new code (the R1.3 hook). The agent surface is
checked with its eval, not only unit tests, because a docstring change can change tool choice.

## Boundaries

- **Always:** one stream per PR (R3 may take 2–3 PRs); each commit green; before/after evidence in
  the PR; a fresh-context review before merge.
- **Ask first:** renaming an MCP tool or API field; any change to Ask's caps or model; touching
  files the pipeline or Ask Maps sessions have open.
- **Never:** edit a test's assertion to make a move pass; change behaviour inside a refactor
  commit; print or commit the MCP token.

## Open questions

None. Answered by the owner on 2026-11-18: the scoped reading above is right, and `web-shell`
lands before Ask Maps A3, which pauses until W3 merges.
