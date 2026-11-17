# ADR-0007: Automatic verification replaces human review; capped Claude API calls from code

- Status: **Proposed** (2026-11-18). Accepted only when the owner approves the spend in the PR.
- Specs: [SPEC-pipeline.md](../../SPEC-pipeline.md), [SPEC-ask-maps.md](../../SPEC-ask-maps.md)

## Context
The owner asked for every stage to be rebuilt from the shuttle-bus URL with no human step, and for
an in-app Ask Maps. Two standing rules block both:
1. "Never publish bus timetable JSON that hasn't passed the validator and human review" (SPEC.md,
   SPEC-bus-schedules.md).
2. "Never call the Claude API from code" (SPEC.md, SPEC-agent-tools.md), because the API credit
   (US$99.86 on 2026-11-09) is the whole LLM budget.

The season PDF has no text layer, so reading timetables needs a vision model, and the local model
alone reads 0.77 of cells.

## Decision
1. **Verification instead of review.** A timetable route is served when two independent extractors
   agree cell for cell and the validator passes (`verified: "auto:2-extractor"`). A route that
   fails stays unserved and the last verified version is kept. The agreement rule must first be
   ≥ 99.5% correct on the 42 reviewed files, or the stage stays off.
2. **Claude API from code, in two places only, capped.** The timetable extractor A (runs when a
   source changes; ≈ $1.50 a season run on Sonnet 5.5) and Ask Maps (≈ $0.0025 a question on
   Haiku 5.5). Cap: **$5 a month** in an Anthropic Console workspace spend limit, plus the app's
   own counter for Ask. The key lives only in Vercel env and GitHub Actions secrets.

## Alternatives dropped
- Local VLM only ($0): 0.77 cell accuracy is far below the gate; a single local model can't verify
  itself.
- Keep human review: contradicts the owner's goal.
- Ask Maps only through the Claude chat connector ($0, exists today): not in the app.
- Google's Maps grounding: Gemini only, English only, $14 per 1,000 after 5,000 free a month, and
  our data is not in Google's places.

## Consequences
- The two "Never" lines in SPEC.md change to the capped rule above.
- New infrastructure, all $0: a private snapshot repo with Git LFS (the posters are third-party),
  a `macos-14` runner for the local extractor, and a fine-grained token so data PRs start CI.
- Deploying stays a manual step on a machine with the tiles (ADR-0006 unchanged).
- A wrong cell can still pass if both extractors make the same mistake; the gold-set gate measures
  how often, and the UI keeps "timetable may change without notice".
