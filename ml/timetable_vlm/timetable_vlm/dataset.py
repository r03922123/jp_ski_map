"""Pair raw posters with reviewed JSON, crop one route per image, split by line.

Run: uv run python -m timetable_vlm.dataset
Writes split.json (committed, file names only) and out/crops/*.png (gitignored).
"""

import json
import re
from collections import defaultdict

from hakuba_api.bus.models import Timetable
from PIL import Image

from timetable_vlm.paths import GOLD_DIR, OUT, RAW_DIR, SOURCES, SPLIT

# Unseen at test time. Chosen as whole lines (not random images) so a test poster's layout,
# stop names and times never appear in training; e/r/t/n mix 1-4 routes per poster.
TEST_LINES = ["line-e", "line-n", "line-r", "line-t"]
MAX_SIDE = 1024  # bounds image tokens so a 3B model fits in 16 GB


def load_gold() -> dict[str, Timetable]:
    return {p.name: Timetable.model_validate_json(p.read_bytes())
            for p in sorted(GOLD_DIR.glob("*.json"))}


def _route_key(t: Timetable) -> tuple:
    m = re.search(r"(\d+)(?:-p(\d+))?$", t.route_id)
    return (int(m[1]), int(m[2] or 0)) if m else (0, 0)


def _is_accent(px: tuple) -> bool:
    # each line has its own accent colour (blue E, pink F, green R...), so test saturation
    return max(px[:3]) - min(px[:3]) > 50


def header_rows(im: Image.Image) -> list[int]:
    """Top y of each route header bar: blue badge at the left, white text area to the right."""
    w, h = im.size
    rgb = im.convert("RGB")
    hits = []
    for y in range(h):
        badge = sum(_is_accent(rgb.getpixel((x, y))) for x in range(35, 95, 4)) / 15
        right = sum(_is_accent(rgb.getpixel((x, y))) for x in range(w // 2, w - 60, 20))
        hits.append(badge >= 0.4 and right == 0)
    starts, run = [], 0
    for y, hit in enumerate(hits):
        run = run + 1 if hit else 0
        # a badge is ~30 px tall; text glyphs don't make 8 accent rows at x 35-95
        if run == 8 and (not starts or y - 7 - starts[-1] > 40):
            starts.append(y - 7)
    # drop the page title (Line-X badge) at the very top
    return [y for y in starts if y > 0.06 * h or y > 100]


def crops_for(file: str, routes: list[Timetable]) -> dict[str, tuple[int, int]] | None:
    """route_id -> (y0, y1) band, or None if the header count doesn't match the routes."""
    im = Image.open(RAW_DIR / file)
    if len(routes) == 1:
        return {routes[0].route_id: (0, im.size[1])}
    ys = header_rows(im)
    if len(ys) != len(routes):
        return None
    bounds = [max(0, y - 6) for y in ys] + [im.size[1]]
    order = sorted(routes, key=_route_key)
    return {t.route_id: (bounds[i], bounds[i + 1]) for i, t in enumerate(order)}


def save_crop(file: str, band: tuple[int, int], dest) -> None:
    im = Image.open(RAW_DIR / file).convert("RGB")
    im = im.crop((0, band[0], im.size[0], band[1]))
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    im.save(dest)


def main() -> None:
    gold = load_gold()
    manifest = {a["file"] for a in json.loads(SOURCES.read_text())["assets"]}
    raw = {p.name for p in RAW_DIR.iterdir() if p.is_file()}
    by_file: dict[str, list[Timetable]] = defaultdict(list)
    names = {}
    for name, t in gold.items():
        by_file[t.source.file].append(t)
        names[id(t)] = name  # v2 has three PDF periods sharing one route_id

    split = {"test_lines": TEST_LINES, "train": [], "test": [], "skipped": {}}
    (OUT / "crops").mkdir(parents=True, exist_ok=True)
    print(f"{'json':24} {'source':38} {'split':6} crop")
    for file, routes in sorted(by_file.items()):
        if file not in manifest:
            for t in routes:
                split["skipped"][names[id(t)]] = f"{file} not in sources.json"
            continue
        if not file.endswith(".jpg") or file not in raw:
            for t in routes:
                split["skipped"][names[id(t)]] = f"{file}: PDF page not rendered"
                print(f"{names[id(t)]:24} {file:38} {'-':6} skipped (PDF)")
            continue
        bands = crops_for(file, routes)
        for t in sorted(routes, key=_route_key):
            name = names[id(t)]
            if bands is None:
                split["skipped"][name] = f"{file}: route headers not found"
                print(f"{name:24} {file:38} {'-':6} skipped (crop)")
                continue
            part = "test" if t.line_id in TEST_LINES else "train"
            split[part].append(name)
            save_crop(file, bands[t.route_id], OUT / "crops" / f"{t.route_id}.png")
            print(f"{name:24} {file:38} {part:6} y={bands[t.route_id]}")
    used = set(by_file)
    print("\nunpaired raw files:", sorted(raw - used))
    print("unpaired manifest assets:", sorted(manifest - used - raw))
    print(f"train={len(split['train'])} test={len(split['test'])} "
          f"skipped={len(split['skipped'])}")
    SPLIT.write_text(json.dumps(split, indent=1) + "\n")


if __name__ == "__main__":
    main()
