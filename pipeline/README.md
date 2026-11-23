# hakuba-pipeline

Rebuilds the app's data from the Hakuba Valley shuttle page and a fixed list of open data sources, so a new season
is a re-run instead of hand work. Spec: [SPEC-pipeline.md](../SPEC-pipeline.md) (tasks P1–P7). Open tasks:
[tasks/todo.md](../tasks/todo.md), section "Rebuild from the URL".

**Status:** experiment, P1 only. One stage exists, `crawl`. It fetches the shuttle page and every timetable, season PDF
and My Maps KML the page links into the snapshot store, and writes a `sources.json` shaped like
`data/bus/sources.json`. Nothing the app serves comes from this pipeline yet. Owner: the repo owner.

## Use

```bash
cd pipeline
uv run --frozen python -m hakuba_pipeline run --all             # fetch, then rewrite pipeline.lock.json
uv run --frozen python -m hakuba_pipeline run --all --offline   # replay from the snapshot store only
```

- `seeds/hakuba.toml` lists every source the pipeline may read. Nothing else is fetched.
- Fetched bytes go to `snapshots/<sha256>` (gitignored), or to `--store DIR` or `$HAKUBA_SNAPSHOTS`. The store
  isn't shared yet, so `--offline` works only on the machine that crawled.
- `pipeline.lock.json` records the hash of every fetched URL. A run prints `CHANGED <url>` for each new, changed or
  gone source.

## Check

CI job `pipeline` runs these, with no network (`respx` stubs HTTP):

```bash
uv run --frozen ruff check && uv run --frozen ruff format --check
uv run --frozen pyright
uv run --frozen pytest -q
```

To change a dependency, run `uvx --from 'uv==0.9.30' uv lock` here (this Mac's uv 0.5.9 rewrites the whole lock).
