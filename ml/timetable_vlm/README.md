# timetable_vlm: draft timetable JSON with a local VLM (experiment)

Reads one cropped shuttle-bus poster table and drafts the `directions` (stops, trips, times) of a
`Timetable` (see `SPEC-bus-schedules.md`, section "v1.x Draft transcription"). Output is a draft
for a human reviewer. It is never served and never marked `reviewed: true`. Everything runs
locally on an M1 16 GB with Apple MLX ($0).

Model: `mlx-community/Qwen2.5-VL-3B-Instruct-4bit` (2.9 GB in `~/.cache/huggingface`).

## Pieces

| File | What it does |
|---|---|
| `timetable_vlm/dataset.py` | pairs each reviewed JSON with its poster (`source.file`), crops one route per image by finding the route-header badges, splits by line, writes `split.json` |
| `timetable_vlm/target.py` | the prompt, and the target JSON (only what a poster table shows) |
| `timetable_vlm/metric.py` | parse, schema check (API `Timetable`), API `validate_bus`, cell and stop accuracy |
| `timetable_vlm/synth.py` | renders synthetic posters from train-split JSON (+ perturbed copies), writes the training JSONL |
| `timetable_vlm/evaluate.py` | runs the model (optionally with a LoRA adapter) on test crops and scores them |

Gitignored (third-party posters, public repo): `out/` (crops, renders, predictions), `data/`
(JSONL), `adapters/`, any image or `.safetensors`. `split.json` holds file names only.

## Reproduce

```sh
cd ml/timetable_vlm
uvx --from 'uv==0.9.30' uv sync --python 3.12      # the Mac's uv 0.5.9 is too old
export TIMETABLE_RAW_DIR=<main checkout>/data/bus/raw/2025-26   # only in a worktree (raw posters are gitignored)
uvx --from 'uv==0.9.30' uv run pytest -q             # metric, target, synth tests
uvx --from 'uv==0.9.30' uv run ruff check .
uvx --from 'uv==0.9.30' uv run python -m timetable_vlm.dataset          # pairing table + split.json + crops
uvx --from 'uv==0.9.30' uv run python -m timetable_vlm.synth --per-route 6
uvx --from 'uv==0.9.30' uv run python -m timetable_vlm.evaluate --tag baseline --only e1,n1,r1,t1
uvx --from 'uv==0.9.30' uv run python -m mlx_vlm.train --model mlx-community/Qwen2.5-VL-3B-Instruct-4bit \
  --data data --train-type lora --lora-rank 8 --learning-rate 1e-4 --batch-size 1 --iters 40 \
  --max-seq-length 2048 --grad-checkpoint --steps-per-report 5 --steps-per-eval 20 --val-batches 2 \
  --adapter-file adapters/run1
uvx --from 'uv==0.9.30' uv run python -m timetable_vlm.evaluate --tag lora --adapter adapters/run1 --only e1,n1,r1,t1
```

## Data

- 42 reviewed JSON files. 31 paired with a JPG crop; 5 come from the timetable PDF (not rendered:
  no PDF tool installed), 6 (lines H, I) skipped because the header detector didn't find the
  right number of route headers. Unpaired raw files: the low/shoulder-season PDFs and the map PDF.
- Split by line so test posters are unseen: test lines E, N, R, T (10 routes); train 21 routes
  (F, G, L, O, V, VN).
- Training rows: 21 real crops + 126 synthetic renders (6 per train route: 1 exact, 5 perturbed),
  5% held out as validation.

## Why synthetic renders, and how they can mislead

They help because 21 real crops is far too few to teach an output format, and each render comes
with a perfect label for free. Perturbing (shifting all times of a direction, reordering trips and
renumbering them) means the label can't be recalled from the stop names: the model has to read the
digits. Varying fonts, column widths, accent colours, blur, noise and a slight rotation stops it
from keying on one look.

They can mislead because the renders are cleaner and simpler than the real posters: no Japanese
second line under each stop, no arrows for first-stop-only trips, no "Arr./Dep." split cells, no
footnote stars. A model can get good at the renders and no better (or worse) at the posters. That
is why the test set is real crops only, and why synthetic accuracy is never reported as the result.

## Results

Test set for both rows: one route per unseen test line (the first route of E, N, R, T), n = 4,
because one inference takes 40-100 s on the M1 and the time box didn't allow all 10.

| Model | n | parsed | schema-valid | validator-clean | cell acc (mean) | stop acc (mean) |
|---|---|---|---|---|---|---|
| Qwen2.5-VL-3B 4-bit, zero-shot | 4 | 4 | 4 | 2 | 0.771 | 0.719 |
| + LoRA (synthetic + train crops) | - | not run: training stopped, see below | | | | |

Per route (zero-shot): E1 1.00 / 1.00, T1 1.00 / 1.00, N1 0.58 / 0.38 (4 validator errors),
R1 0.50 / 0.50 (14 validator errors). Raw outputs: `out/pred-baseline/`, scores:
`out/results-baseline.json`.

What went wrong zero-shot (read from the raw outputs):
- R1 prints the return trip as an upward arrow column (read bottom to top). The model copied the
  outward stop order and reversed the times, so every return time is descending: the validator
  flags it, and the whole return half scores 0. This is exactly the poster quirk a fine-tune on
  real crops should target.
- N1 invents times where the poster prints none (`null` in gold), e.g. `08:30` at Norikura, and
  misspells stops (`Missorano Rotary`, `Hakuba Hoppo Bus Terminal`), which the validator catches
  as unknown stops.
- An earlier run that asked for "compact on one line" JSON made the model degenerate on E1 (80
  repeated trips, unparseable). That prompt was dropped; its log is `out/baseline-compact-prompt.log`.

Fine-tune: `mlx_vlm.train` loaded (14.97 M trainable LoRA params, 0.4%) and ran 1 of 40 steps in
106.6 s while the Mac swapped hard (`vm_stat` swapouts rose by about 2.5 M pages in 3 minutes,
with other agents also running). At that rate 40 steps take about 70 minutes, so it was stopped
before the first loss report. No training loss and no fine-tuned numbers exist.

## Caveats

- The LoRA step did not finish (see Results). Next try: `--max-seq-length 1024`, smaller images
  (`MAX_SIDE` 768), the Mac otherwise idle, then re-run the same `evaluate --only e1,n1,r1,t1`.
- Synthetic renders reverse trip order half the time, giving descending columns no real poster
  has; worth dropping before the next run.

- Tiny test set; differences of one route are noise, not signal.
- Positional matching: a dropped stop shifts every later cell, so cell accuracy is harsh.
- `cell_acc` normalises "8:05" to "08:05"; the validator count does not.
- The prompt gives the direction ids (e.g. "outward, return"), which a human would also decide.
- `cell_acc` is recall over gold cells: extra trips or stops the model invents are not penalised
  (the validator count catches some of them). A cell the model never wrote is wrong, even where
  gold is empty; re-scoring the saved baseline outputs with that rule left 0.771 / 0.719 unchanged.
