import os
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent  # ml/timetable_vlm
REPO = PKG.parents[1]
GOLD_DIR = REPO / "data" / "bus" / "timetables" / "2025-26"
SOURCES = REPO / "data" / "bus" / "sources.json"
# Raw posters are gitignored and live only in the main checkout (third-party, copyrighted).
# A worktree has none of them, so point TIMETABLE_RAW_DIR at the main checkout's copy.
RAW_DIR = Path(os.environ.get("TIMETABLE_RAW_DIR", REPO / "data" / "bus" / "raw" / "2025-26"))
OUT = PKG / "out"  # gitignored: crops, renders, predictions
DATA = PKG / "data"  # gitignored: training JSONL
ADAPTERS = PKG / "adapters"  # gitignored: LoRA weights
SPLIT = PKG / "split.json"  # committed: file names only
MODEL = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"
