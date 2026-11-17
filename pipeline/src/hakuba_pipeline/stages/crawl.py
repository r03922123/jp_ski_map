"""Crawl the shuttle page and every timetable, season PDF and My Maps KML it links.

The page parsing is `hakuba_api.bus.check_sources`'s, so the two can't drift. The bytes go to
the snapshot store through `fetch`; the output is a `sources.json` in the same shape as
`data/bus/sources.json`, which later stages read to find each asset by hash.
"""

import hashlib
import tomllib
from collections.abc import Mapping
from pathlib import Path

from hakuba_api.bus.check_sources import (
    MyMapSource,
    SourceAsset,
    SourcesManifest,
    kml_url,
    parse_page,
)

from hakuba_pipeline.runner import fetch

VERSION = "1"
INPUTS = ("seeds/hakuba.toml",)
NETWORK = True


def run(inputs: Mapping[str, Path], out: Path) -> None:
    page_url: str = tomllib.loads(inputs["seeds/hakuba.toml"].read_text())["shuttle"]["url"]
    page = parse_page(fetch(page_url).decode())

    def sha(url: str) -> str:
        return hashlib.sha256(fetch(url)).hexdigest()

    manifest = SourcesManifest(
        season=page.season,
        page_url=page_url,
        line_resorts=page.line_resorts,
        assets=[
            SourceAsset(url=u, file=u.rsplit("/", 1)[1], sha256=sha(u)) for u in page.asset_urls
        ],
        my_maps=[
            MyMapSource(
                mid=m.mid,
                timetable_file=m.timetable_file,
                file=f"mymaps/{m.mid}.kml",
                sha256=sha(kml_url(m.mid)),
            )
            for m in page.my_maps
        ],
    )
    (out / "sources.json").write_text(manifest.model_dump_json(by_alias=True, indent=2) + "\n")
