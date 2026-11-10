"""Render synthetic timetable images from TRAIN-split gold JSON and write the training JSONL.

Run: uv run python -m timetable_vlm.synth --per-route 6
Writes out/synth/*.png and data/{train,valid}.jsonl (both gitignored). Test lines are never used.
"""

import argparse
import json
import random

from hakuba_api.bus.models import Timetable
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from timetable_vlm.dataset import MAX_SIDE
from timetable_vlm.paths import DATA, GOLD_DIR, OUT, SPLIT
from timetable_vlm.target import prompt_for, to_target

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Narrow.ttf",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
ACCENTS = [(110, 165, 188), (245, 170, 167), (120, 190, 110), (240, 180, 80), (150, 120, 190)]


def _shift(hhmm: str | None, minutes: int) -> str | None:
    if hhmm is None:
        return None
    m = int(hhmm[:2]) * 60 + int(hhmm[3:]) + minutes
    return f"{m // 60:02d}:{m % 60:02d}"


def perturb(target: dict, rng: random.Random) -> dict:
    """New times and trip order, same stops: the model must read, not recall, the gold times."""
    out = json.loads(json.dumps(target))
    for d in out["directions"]:
        trips = d["trips"]
        latest = max((x for t in trips for x in t["times"] if x), default="12:00")
        room = (23 * 60 + 50) - (int(latest[:2]) * 60 + int(latest[3:]))
        k = rng.randint(-60, max(-60, min(120, room)))
        for t in trips:
            t["times"] = [_shift(x, k) for x in t["times"]]
        # reorder trips, then renumber, so "n" follows the printed column order
        trips.sort(key=lambda t: rng.random())
        trips.sort(key=lambda t: next((x for x in t["times"] if x), "99:99"))
        if rng.random() < 0.5:
            trips.reverse()
        for i, t in enumerate(trips, 1):
            t["n"] = i
    return out


def render(route: str, target: dict, rng: random.Random) -> Image.Image:
    """Poster-like layout: stops are rows, trips are columns, one block per direction."""
    font_path = rng.choice(FONTS)
    size = rng.randint(17, 24)
    font = ImageFont.truetype(font_path, size)
    bold = ImageFont.truetype(font_path, size + 4)
    accent = rng.choice(ACCENTS)
    stop_w = rng.randint(300, 420)
    col_w = rng.randint(70, 105)
    row_h = size + rng.randint(14, 26)
    dirs = target["directions"]
    side_by_side = len(dirs) == 2 and rng.random() < 0.6
    ncols = max(len(d["trips"]) for d in dirs)
    block_w = stop_w + col_w * ncols
    nrows = max(len(d["stops"]) for d in dirs) + 1
    w = 40 + block_w * (2 if side_by_side else 1) + 40
    h = 80 + (nrows * row_h + 30) * (1 if side_by_side else len(dirs)) + 20
    im = Image.new("RGB", (w, h), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    dr.rectangle((20, 20, 80, 56), fill=accent)
    dr.text((28, 24), route.upper(), font=bold, fill=(255, 255, 255))
    dr.text((95, 26), f"Route {route.upper()} timetable", font=bold, fill=(20, 20, 20))
    for di, d in enumerate(dirs):
        x0 = 20 + (block_w + 20) * di if side_by_side else 20
        y0 = 80 + (0 if side_by_side else di * (nrows * row_h + 30))
        dr.rectangle((x0, y0, x0 + stop_w + col_w * len(d["trips"]), y0 + row_h), fill=accent)
        dr.text((x0 + 6, y0 + 6), f"{d['id'].title()} / Bus Stop", font=font, fill=(255,) * 3)
        for ti, t in enumerate(d["trips"]):
            dr.text((x0 + stop_w + ti * col_w + col_w // 3, y0 + 6), str(t["n"]), font=font,
                    fill=(255,) * 3)
        for si, stop in enumerate(d["stops"]):
            y = y0 + (si + 1) * row_h
            if si % 2:
                dr.rectangle((x0, y, x0 + stop_w + col_w * len(d["trips"]), y + row_h),
                             fill=(238, 240, 244))
            dr.text((x0 + 6, y + 6), stop, font=font, fill=(10, 10, 10))
            for ti, t in enumerate(d["trips"]):
                x = t["times"][si]
                txt = "—" if x is None else (x.lstrip("0") if rng.random() < 0.7 else x)
                dr.text((x0 + stop_w + ti * col_w + 8, y + 6), txt, font=font, fill=(10, 10, 10))
            dr.line((x0, y, x0 + stop_w + col_w * len(d["trips"]), y), fill=(200, 200, 200))
    im = im.rotate(rng.uniform(-1.5, 1.5), expand=True, fillcolor=(255, 255, 255))
    if rng.random() < 0.5:
        im = im.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 0.9)))
    noise = Image.effect_noise(im.size, rng.uniform(5, 25)).convert("RGB")
    im = Image.blend(im, noise, rng.uniform(0.03, 0.10))
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    return im


def row(image, gold: Timetable, target: dict) -> dict:
    return {"images": [str(image)],
            "messages": [{"role": "user", "content": prompt_for(gold)},
                         {"role": "assistant",
                          "content": json.dumps(target, ensure_ascii=False,
                                                separators=(",", ":"))}]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-route", type=int, default=6)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    split = json.loads(SPLIT.read_text())
    (OUT / "synth").mkdir(parents=True, exist_ok=True)
    DATA.mkdir(exist_ok=True)
    rows = []
    for name in split["train"]:  # never the test lines
        gold = Timetable.model_validate_json((GOLD_DIR / name).read_bytes())
        base = to_target(gold)
        rows.append(row(OUT / "crops" / f"{gold.route_id}.png", gold, base))  # the real crop
        for k in range(args.per_route):
            target = base if k == 0 else perturb(base, rng)
            path = OUT / "synth" / f"{gold.route_id}-{k}.png"
            render(gold.route_id, target, rng).save(path)
            rows.append(row(path, gold, target))
    rng.shuffle(rows)
    n_val = max(2, len(rows) // 20)
    (DATA / "valid.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows[:n_val]))
    (DATA / "train.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows[n_val:]))
    print(f"train rows={len(rows) - n_val} valid rows={n_val} "
          f"(real crops={len(split['train'])}, synthetic={len(split['train']) * args.per_route})")


if __name__ == "__main__":
    main()
