"""`python -m hakuba_pipeline run [--all | STAGE ...] [--offline] [--store DIR]`."""

import argparse
import sys
from pathlib import Path

from hakuba_pipeline.runner import Stage, run
from hakuba_pipeline.stages import crawl

STAGES = [Stage.of(crawl)]  # in dependency order


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hakuba_pipeline")
    parser.add_argument("command", choices=["run"])
    parser.add_argument("stages", nargs="*", help="stage names (default with --all: every stage)")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--offline", action="store_true", help="read only the snapshot store")
    parser.add_argument("--store", type=Path, help="snapshot store (default: $HAKUBA_SNAPSHOTS)")
    args = parser.parse_args(argv)
    known = {s.name for s in STAGES}
    if not args.all and not args.stages or set(args.stages) - known:
        parser.error(f"name stages from {sorted(known)} or pass --all")
    selected = [s for s in STAGES if args.all or s.name in args.stages]
    result = run(selected, store=args.store, offline=args.offline)
    for url in result.changed:
        print(f"CHANGED  {url}")
    print(f"ran {result.ran or 'nothing (all up to date)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
