# Codebase review, 2026-11-18 (as a new owner)

Read against `main` at 72c3b35. Purpose: decide what it takes to (1) rebuild everything from the
shuttle-bus URL with no human step, (2) add an Ask Maps feature, (3) use the AI-engineering stack
where it fits, following Anthropic's agent guidance. The plans are [SPEC-pipeline.md](../../SPEC-pipeline.md)
and [SPEC-ask-maps.md](../../SPEC-ask-maps.md).

## Verdict

The app code is in good shape: small typed modules, pure logic tested first, recorded fixtures, a
validator on every data file, evals with error bars, traces in production. **The weak point is
data provenance**: only the place-search index rebuilds with no person involved. Everything else
either was written by hand or waits for a person to approve it.

## Size (tracked files, grep counts)

| Package | Source lines | Test lines | Tests |
|---|---|---|---|
| services/api | 5,203 | 6,608 | 431 pytest |
| services/mcp | 453 | 920 | 45 pytest |
| apps/web | 10,466 (+1,344 generated) | 15,088 | 356 vitest, 308 Playwright |
| ml/search | 517 | 119 | 13 |
| ml/timetable_vlm | 460 | 131 | 13 |

## What blocks "rebuild from the URL, no human step"

| Artifact | Producer today | Human step | Evidence |
|---|---|---|---|
| 42 timetable files | hand transcription in a Claude Code session | all of it, plus `reviewed: true` | SPEC-bus-schedules.md:18,25; season.py:75 |
| `stop_evidence.json`, `bus_stops.json` | `import_mymaps`, `locate_stops` | 51 of 66 evidence entries (20 OSM, 1 access point, 30 Overture), the `MANUAL_MATCHES` table, the 100 stop rows | import_mymaps.py:31-52; locate_stops.py:5 |
| `resorts.json` | hand-written | stats, prices (ADR-0003), access points | SPEC-resort-catalog.md:6 |
| `crowd_periods.json` | hand-written | the calendar ("approx." term dates) | DATA-LICENSES.md:14 |
| `sources.json` | `check_sources` | `--accept` waits for the transcription | timetable-watch.yml:49-53 |
| lodging, POI, Overture | `refresh_*` | none, but not pinned (no Overpass `[date:]`; newest Overture release; `fetchedAt=now()`) | refresh_overture.py:195-199,281 |
| Valhalla tiles | `build-hakuba.sh` | none, but `chubu-latest` is not pinned | build-hakuba.sh:10 |

The season PDF has no text layer (PyMuPDF: 179 characters, 0 `HH:MM` tokens; the times are vector
outlines), so timetables need a vision model. The local Qwen2.5-VL-3B reads 0.77 of cells
zero-shot on 4 routes, and its LoRA run never finished (ml/timetable_vlm/README.md).

## Findings outside the plan

1. **Latent test failure.** `locate_stops --write` writes `coordSource: "unresolved: …"` for a
   rejected stop (locate_stops.py:235), but that prefix is not in `KNOWN_SOURCES`
   (test_data_licenses.py:28-37). The first stop `locate_stops` rejects would fail CI. Today 98 of
   100 stops are located and the 2 others are marked `not located yet` by hand, so it hasn't
   fired. Fix in P2.
2. No task runner: the commands live in CLAUDE.md. The pipeline's single entry point covers the
   data side; the gates stay as CI runs them.
3. SPEC-agent-tools.md:26 says the eval has 11 questions; `trip_questions.json` has 12.
4. `deploy-vercel.sh` uploads 8 data items and leaves out `stop_evidence.json` (54-59). Correct
   today (the API doesn't read it at runtime); the pipeline should keep that list in one place.

## The AI-engineering stack: where each piece fits here

Mapped to a typical AI-engineer brief (agents, RAG, fine-tuning, serving and monitoring, MLOps).
"Not adopted" is a decision, not a gap.

| Skill | Already here | Planned | Not adopted, and why |
|---|---|---|---|
| Agents, tool use | 6 MCP tools, eval 12/12, production traces | Ask Maps tool loop with citations and caps | Agent frameworks (LangChain, AutoGen): the SDK loop is ~100 lines, and Anthropic advises the API before a framework |
| RAG | lexical index + e5 embeddings, hybrid, calibrated threshold | Ask grounds every answer in tool results as `search_result` blocks with citations | A vector DB (FAISS, Pinecone…): 1,100 vectors are one matrix product; revisit past ~100k |
| Fine-tuning | e5 contrastive fine-tune (+0.40 hit@5, paired) | Finish the VLM LoRA as timetable extractor B (SFT on synthetic + real crops) | RLHF: no preference data, and no budget to collect it |
| Evaluation | evals with n, SE, Wilson intervals; MLflow | pass^3 Ask eval; extractor eval on a frozen gold set | — |
| Serving, monitoring | Vercel, Langfuse spans, privacy rules | Ask cost per question and the cap in Langfuse | Kubernetes: three serverless functions for a handful of users |
| Data pipelines | fetch scripts, validators | DAG + snapshot store + lock file, CI replay | Airflow/Dagster: ~12 stages, one machine |
| Containers | Valhalla in Docker | — | — |

## Anthropic agent guidance applied

| Guidance (source) | How the specs apply it |
|---|---|
| Start with the simplest thing; workflows before agents ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)) | Pipeline is a fixed DAG; the only model calls are two bounded extraction steps. Ask is a bounded tool loop, justified in SPEC-ask-maps |
| Few, well-scoped tools, readable results, actionable errors ([Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)) | Ask reuses the 6 evaluated MCP tools; no new tool |
| Context is a budget ([Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) | Stable cached prefix; per-question state as a mid-conversation system message |
| Multi-agent costs ~15× a chat; use it for broad parallel work ([Multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)) | Not used |
| Progress files, one feature per session, test end to end ([Long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)) | Each spec's task table is one PR per fresh session; status in tasks/todo.md |
| Eval from 20–50 real tasks, pass^k for user-facing agents, read transcripts ([Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)) | Ask: 40 questions, pass^3; extractors: 42 gold files |
