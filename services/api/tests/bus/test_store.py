import json
import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest

from hakuba_api.bus.store import load_manifest, load_timetables
from hakuba_api.data.paths import data_dir

REAL = data_dir()
E1 = "line-e-e1.json"  # read from E.jpg, a name the operator may reuse next season


@pytest.fixture
def data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    folder = tmp_path / "bus" / "timetables" / "2025-26"
    folder.mkdir(parents=True)
    shutil.copy(REAL / "bus" / "timetables" / "2025-26" / E1, folder)
    monkeypatch.setenv("HAKUBA_DATA_DIR", str(tmp_path))
    load_timetables.cache_clear()
    load_manifest.cache_clear()
    yield tmp_path
    load_timetables.cache_clear()
    load_manifest.cache_clear()


def write_manifest(root: Path, season: str, url: str) -> None:
    manifest: dict[str, object] = {
        "season": season,
        "pageUrl": "https://example.test/",
        "lineResorts": {},
        "assets": [{"url": url, "file": "E.jpg", "sha256": "0"}],
    }
    (root / "bus" / "sources.json").write_text(json.dumps(manifest))


def test_timetable_links_its_file_on_the_operators_page(data: Path) -> None:
    write_manifest(data, "2025-26", "https://example.test/2026/01/E.jpg")

    (e1,) = load_timetables()
    assert e1.source.url == "https://example.test/2026/01/E.jpg"


def test_a_newer_seasons_file_of_the_same_name_is_not_linked(data: Path) -> None:
    write_manifest(data, "2026-27", "https://example.test/2026/12/E.jpg")

    (e1,) = load_timetables()
    assert e1.source.url is None


def test_no_manifest_means_no_link(data: Path) -> None:
    (e1,) = load_timetables()
    assert e1.source.url is None
