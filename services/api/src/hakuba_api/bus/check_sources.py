"""Detect Hakuba Valley shuttle timetable changes.

Usage: `python -m hakuba_api.bus.check_sources [--accept]`.

Fetches the official shuttle page, downloads every timetable image/PDF it links to
data/bus/raw/<season>/ (gitignored), and compares sha256 hashes with
data/bus/sources.json. Exit 1 when anything is new, changed or removed, so the
images can be (re)transcribed; `--accept` records the current state.
"""

import hashlib
import html
import re
import sys
from dataclasses import dataclass

import httpx

from hakuba_api.common.models import ApiModel
from hakuba_api.common.upstream import USER_AGENT, UpstreamError
from hakuba_api.data.paths import data_dir

PAGE_URL = "https://www.hakubavalley.com/en/access_en/shuttlebus_en/"
_UPLOAD_LINK = re.compile(
    r'href="(https://www\.hakubavalley\.com/cms/wp-content/uploads/[^"]+\.(?:jpe?g|png|pdf))"'
)
_SEASON = re.compile(r"/(\d{4})-(\d{4})-[^/]+\.pdf$")
_LINE_ANCHOR = re.compile(r'href="#line-([a-z0-9-]+)"')
# Each timetable image is followed by the operator's My Maps layer of that line's stops
# (embedded lazily, so the URL is in data-src rather than src).
_MY_MAP = re.compile(r"google\.com/maps/d/embed\?mid=([A-Za-z0-9_-]+)")
_UPLOAD_IMAGE = re.compile(r"uploads/\d{4}/\d{2}/([A-Za-z0-9_-]+?)(?:-\d+x\d+)?\.(jpe?g|png)")


def kml_url(mid: str) -> str:
    """Official KML export of a My Maps layer."""
    return f"https://www.google.com/maps/d/kml?mid={mid}&forcekml=1"


class SourceAsset(ApiModel):
    url: str
    file: str
    sha256: str


class MyMapSource(ApiModel):
    mid: str
    timetable_file: str  # the timetable image this stop map sits next to
    file: str  # mymaps/<mid>.kml under data/bus/raw/<season>/
    sha256: str


class SourcesManifest(ApiModel):
    season: str
    page_url: str
    line_resorts: dict[str, list[str]]  # resort name as printed -> line ids
    assets: list[SourceAsset]
    my_maps: list[MyMapSource] = []


@dataclass(frozen=True)
class PageMyMap:
    mid: str
    timetable_file: str


@dataclass
class ShuttlePage:
    season: str
    asset_urls: list[str]
    line_resorts: dict[str, list[str]]
    my_maps: list[PageMyMap]


def _my_maps(page: str) -> list[PageMyMap]:
    found: dict[str, PageMyMap] = {}
    for m in _MY_MAP.finditer(page):
        images = _UPLOAD_IMAGE.findall(page[: m.start()])
        if m.group(1) not in found and images:
            stem, ext = images[-1]
            found[m.group(1)] = PageMyMap(m.group(1), f"{stem}.{ext}")
    return list(found.values())


def _line_resorts(page: str) -> dict[str, list[str]]:
    start = page.find("The listed routes stop at each ski resort")
    block = page[start : page.find("</p>", start)]
    mapping: dict[str, list[str]] = {}
    for segment in block.split("<br>")[1:]:
        lines = list(dict.fromkeys(_LINE_ANCHOR.findall(segment)))
        name = html.unescape(re.sub(r"<[^>]+>", "", re.split(r"<mark|<a ", segment)[0])).strip()
        if name and lines:
            mapping[name] = lines
    return mapping


def parse_page(page: str) -> ShuttlePage:
    urls = sorted(set(_UPLOAD_LINK.findall(page)))
    seasons = [f"{m.group(1)}-{m.group(2)[2:]}" for u in urls if (m := _SEASON.search(u))]
    if not seasons:
        raise UpstreamError("hakubavalley", "no season PDF found on the shuttle page")
    return ShuttlePage(
        season=seasons[0],
        asset_urls=urls,
        line_resorts=_line_resorts(page),
        my_maps=_my_maps(page),
    )


def diff_assets(old: list[SourceAsset], new: list[SourceAsset]) -> dict[str, list[str]]:
    before = {a.file: a.sha256 for a in old}
    after = {a.file: a.sha256 for a in new}
    return {
        "new": sorted(f for f in after if f not in before),
        "changed": sorted(f for f in after if f in before and before[f] != after[f]),
        "removed": sorted(f for f in before if f not in after),
    }


def _get(url: str) -> httpx.Response:
    try:
        response = httpx.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True
        )
        response.raise_for_status()
    except httpx.HTTPError as e:
        raise UpstreamError("hakubavalley", f"{url}: {e}") from e
    return response


def run(accept: bool) -> int:
    page = parse_page(_get(PAGE_URL).text)
    raw_dir = data_dir() / "bus" / "raw" / page.season
    raw_dir.mkdir(parents=True, exist_ok=True)

    current: list[SourceAsset] = []
    for url in page.asset_urls:
        content = _get(url).content
        file = url.rsplit("/", 1)[1]
        (raw_dir / file).write_bytes(content)
        current.append(SourceAsset(url=url, file=file, sha256=hashlib.sha256(content).hexdigest()))

    (raw_dir / "mymaps").mkdir(exist_ok=True)
    maps: list[MyMapSource] = []
    for m in page.my_maps:
        content = _get(kml_url(m.mid)).content
        file = f"mymaps/{m.mid}.kml"
        (raw_dir / file).write_bytes(content)
        maps.append(
            MyMapSource(
                mid=m.mid,
                timetable_file=m.timetable_file,
                file=file,
                sha256=hashlib.sha256(content).hexdigest(),
            )
        )

    def tracked(assets: list[SourceAsset], my_maps: list[MyMapSource]) -> list[SourceAsset]:
        return assets + [
            SourceAsset(url=kml_url(m.mid), file=m.file, sha256=m.sha256) for m in my_maps
        ]

    manifest_path = data_dir() / "bus" / "sources.json"
    old = (
        SourcesManifest.model_validate_json(manifest_path.read_text())
        if manifest_path.exists()
        else None
    )
    previous = tracked(old.assets, old.my_maps) if old else []
    changes = diff_assets(previous, tracked(current, maps))
    for kind, files in changes.items():
        for file in files:
            print(f"{kind.upper():8} {file}")

    if accept:
        manifest = SourcesManifest(
            season=page.season,
            page_url=PAGE_URL,
            line_resorts=page.line_resorts,
            assets=current,
            my_maps=maps,
        )
        manifest_path.write_text(manifest.model_dump_json(by_alias=True, indent=2) + "\n")
        print(f"accepted {len(current)} assets and {len(maps)} stop maps for {page.season}")
        return 0

    changed_files = [f for files in changes.values() for f in files]
    if not changed_files:
        print("no timetable or stop-map changes")
    else:
        maps_only = all(f.startswith("mymaps/") for f in changed_files)
        print(
            "stop maps changed — run import_mymaps and locate_stops"
            if maps_only
            else "timetables changed — transcribe them"
        )
    changed = bool(changed_files)
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(run(accept="--accept" in sys.argv[1:]))
