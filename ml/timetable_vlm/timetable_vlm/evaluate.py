"""Run the VLM on the test crops and score each against the reviewed JSON.

Run: uv run python -m timetable_vlm.evaluate --tag baseline [--adapter adapters/run1] [--limit N]
Writes out/pred-<tag>/<route>.txt (raw model text) and out/results-<tag>.json.
"""

import argparse
import json
import time

from hakuba_api.bus.models import Timetable
from mlx_vlm import apply_chat_template, generate, load

from timetable_vlm.metric import score
from timetable_vlm.paths import GOLD_DIR, MODEL, OUT, SPLIT
from timetable_vlm.target import prompt_for


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", required=True)
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--adapter")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--only", help="comma-separated route ids, e.g. e1,n1,r2,t1")
    ap.add_argument("--max-tokens", type=int, default=1500)
    args = ap.parse_args()

    model, processor = load(args.model, adapter_path=args.adapter)
    names = json.loads(SPLIT.read_text())["test"][: args.limit]
    if args.only:
        keep = tuple(f"-{r}.json" for r in args.only.split(","))
        names = [n for n in names if n.endswith(keep)]
    pred_dir = OUT / f"pred-{args.tag}"
    pred_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in names:
        gold = Timetable.model_validate_json((GOLD_DIR / name).read_bytes())
        image = str(OUT / "crops" / f"{gold.route_id}.png")
        prompt = apply_chat_template(processor, model.config, prompt_for(gold), num_images=1)
        t0 = time.time()
        try:
            r = generate(model, processor, prompt, image=[image], max_tokens=args.max_tokens,
                         temperature=0.0)
            text, err = r.text, None
        except Exception as e:  # an OOM or library error is a result too; keep going
            text, err = "", repr(e)
        secs = round(time.time() - t0, 1)
        (pred_dir / f"{gold.route_id}.txt").write_text(text)
        s = score(text, gold) | {"route": gold.route_id, "secs": secs, "error": err}
        rows.append(s)
        print(json.dumps(s), flush=True)

    n = len(rows)
    summary = {
        "tag": args.tag, "adapter": args.adapter, "n": n,
        "parsed": sum(r["parsed"] for r in rows),
        "schema_valid": sum(r["schema_valid"] for r in rows),
        "validator_clean": sum(r["validator_errors"] == 0 for r in rows),
        "cell_acc_mean": round(sum(r["cell_acc"] for r in rows) / n, 3) if n else 0,
        "stop_acc_mean": round(sum(r["stop_acc"] for r in rows) / n, 3) if n else 0,
    }
    print("SUMMARY", json.dumps(summary))
    (OUT / f"results-{args.tag}.json").write_text(json.dumps({"summary": summary, "rows": rows},
                                                            indent=1))


if __name__ == "__main__":
    main()
