# ml/search: semantic place search

Embedding retrieval beside the API's lexical index, its fine-tuning, and its evals.
Design and acceptance: [SPEC-place-search.md v1.4](../../SPEC-place-search.md).

| File | What it does |
|---|---|
| `src/hakuba_search/embed.py` | Embeds the 1,100 index entries (`name \| name_ja \| aliases \| detail`) with `intfloat/multilingual-e5-small`; exact cosine search as one matrix product |
| `src/hakuba_search/server.py` | The local server the API calls when `HAKUBA_SEMANTIC_URL` is set |
| `src/hakuba_search/synth.py` | Synthetic (query, entry) pairs from the index: typos, dropped area words, romaji readings, Chinese characters, cuisine and shop words; split 80/20 by entry |
| `src/hakuba_search/finetune.py` | Contrastive fine-tune (MultipleNegativesRankingLoss, in-batch negatives, no duplicate entries per batch) on the Mac's GPU (MPS) |
| `src/hakuba_search/calibrate.py` | Per-model cosine threshold: the lowest score whose top-1 answers on the dev split are ≥ 90% correct. Fine-tuning moves the score scale (0.9127 → 0.5387), so a threshold never carries over between models |
| `src/hakuba_search/evaluate.py` | lexical vs semantic vs hybrid on `evals/hard_queries.json` (40 hand-written queries) and the API's `booking_eval.json` regression set; logs to MLflow |

## Commands

```bash
uvx --from 'uv==0.9.30' uv sync                       # once; downloads torch and the model on first use
uv run pytest -q                                       # unit tests (synthetic pairs, eval predicates)
uv run python -m hakuba_search.calibrate               # base model's threshold on the dev split
uv run python -m hakuba_search.evaluate --min-score 0.9127   # base model, all three modes
uv run python -m hakuba_search.finetune                # writes models/e5-hakuba (gitignored)
uv run python -m hakuba_search.calibrate --model models/e5-hakuba          # → 0.5387
uv run python -m hakuba_search.evaluate --model models/e5-hakuba --min-score 0.5387
uv run python -m hakuba_search.server --port 8032 --model models/e5-hakuba --min-score 0.5387
HAKUBA_SEMANTIC_URL=http://127.0.0.1:8032 uv run --project ../../services/api fastapi dev ../../services/api/src/hakuba_api/main.py --port 8030
uv run mlflow ui --backend-store-uri sqlite:///mlflow.db  # compare runs
```

## Results

Numbers and caveats: [SPEC-place-search.md v1.4](../../SPEC-place-search.md); MLflow (`mlflow.db`, gitignored) has every run.

## Caveats

- The hard set has 40 queries, so one query is 2.5 points. The same author wrote it and the synthetic rules, so gains on groups the rules target (Chinese resort words, cuisines) partly measure that overlap, not only generalisation. The synthetic dev split (unseen entries) is the cleaner signal for the fine-tune.
- Latency numbers were taken while other jobs loaded the Mac (load average 25–40), so they are upper bounds.
