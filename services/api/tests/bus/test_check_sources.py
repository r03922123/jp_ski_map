import hashlib
import json
from collections.abc import Iterator
from pathlib import Path

import pytest
import respx

from hakuba_api.bus.check_sources import (
    PAGE_URL,
    SourceAsset,
    SourcesManifest,
    diff_assets,
    kml_url,
    parse_page,
    run,
)

PAGE_HTML = (Path(__file__).parents[1] / "fixtures" / "hv" / "shuttle.html").read_text()


def test_finds_every_timetable_asset_on_the_page() -> None:
    page = parse_page(PAGE_HTML)

    names = sorted(url.rsplit("/", 1)[1] for url in page.asset_urls)
    assert len(names) == 18
    assert "TimetableV2.jpg" in names
    assert "VN-1.jpg" in names
    assert "2025-2026-Shuttle-Bus-Timetable.pdf" in names
    assert page.season == "2025-26"


def test_reads_which_lines_serve_each_resort() -> None:
    page = parse_page(PAGE_HTML)

    assert page.line_resorts["Hakuba Happo-One Snow Resort"] == ["v", "h", "e"]
    assert page.line_resorts["Hakuba Cortina Snow Resort"] == ["v"]
    assert page.line_resorts["Jigatake Snow Resort"] == ["v", "o"]
    assert len(page.line_resorts) == 11  # Goryu has two bases listed separately


def test_finds_the_stop_map_next_to_every_timetable() -> None:
    page = parse_page(PAGE_HTML)

    by_timetable = {m.timetable_file: m.mid for m in page.my_maps}
    assert len(page.my_maps) == 13
    assert by_timetable["T.jpg"] == "1ukUFrg55fWfTmp3f9jivhpNpzp7I_9Y"
    assert by_timetable["F.jpg"] == "1l0L1JCykPT9AGMFB8gXc31vUkIBlzVg"
    assert by_timetable["R.jpg"] == "1_EOV2ZXFvBmxKWgsMi03d4ydOCtopps"
    assert by_timetable["V1.jpg"] == "1yduAPDNxPBZHo-7A2APVQi_2xC_1GYY"


def asset(name: str, sha: str) -> SourceAsset:
    return SourceAsset(url=f"https://x.test/{name}", file=name, sha256=sha)


def test_diff_reports_new_changed_and_removed() -> None:
    old = [asset("E.jpg", "a"), asset("F.jpg", "b"), asset("H.jpg", "c")]
    new = [asset("E.jpg", "a"), asset("F.jpg", "B"), asset("I.jpg", "d")]

    changes = diff_assets(old, new)

    assert changes == {"new": ["I.jpg"], "changed": ["F.jpg"], "removed": ["H.jpg"]}


# --- end to end against a temp data dir -----------------------------------------


@pytest.fixture
def data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("HAKUBA_DATA_DIR", str(tmp_path))
    (tmp_path / "bus").mkdir()
    return tmp_path


@pytest.fixture
def site() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as mock:
        mock.get(PAGE_URL).respond(text=PAGE_HTML)
        page = parse_page(PAGE_HTML)
        for url in page.asset_urls:
            mock.get(url).respond(content=url.encode())  # bytes differ per asset
        for m in page.my_maps:
            mock.get(kml_url(m.mid)).respond(text=f"<kml>{m.mid}</kml>")
        yield mock


def test_first_run_reports_everything_new_and_accept_writes_manifest(
    data: Path, site: respx.MockRouter, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run(accept=False) == 1
    assert "NEW" in capsys.readouterr().out

    assert run(accept=True) == 0

    manifest = SourcesManifest.model_validate_json((data / "bus" / "sources.json").read_text())
    assert manifest.season == "2025-26"
    assert len(manifest.assets) == 18
    assert len(manifest.my_maps) == 13
    t_map = next(m for m in manifest.my_maps if m.timetable_file == "T.jpg")
    assert (data / "bus" / "raw" / "2025-26" / "mymaps" / f"{t_map.mid}.kml").exists()
    v2 = next(a for a in manifest.assets if a.file == "TimetableV2.jpg")
    assert v2.sha256 == hashlib.sha256(v2.url.encode()).hexdigest()
    assert (data / "bus" / "raw" / "2025-26" / "TimetableV2.jpg").exists()


def test_unchanged_run_exits_zero(data: Path, site: respx.MockRouter) -> None:
    run(accept=True)

    assert run(accept=False) == 0


def test_changed_image_exits_one_and_names_it(
    data: Path, site: respx.MockRouter, capsys: pytest.CaptureFixture[str]
) -> None:
    run(accept=True)
    capsys.readouterr()
    v2 = next(u for u in parse_page(PAGE_HTML).asset_urls if u.endswith("TimetableV2.jpg"))
    site.get(v2).respond(content=b"new timetable")

    assert run(accept=False) == 1
    out = capsys.readouterr().out
    assert "CHANGED" in out
    assert "TimetableV2.jpg" in out


def test_changed_stop_map_exits_one_and_names_it(
    data: Path, site: respx.MockRouter, capsys: pytest.CaptureFixture[str]
) -> None:
    run(accept=True)
    capsys.readouterr()
    r_map = next(m for m in parse_page(PAGE_HTML).my_maps if m.timetable_file == "R.jpg")
    site.get(kml_url(r_map.mid)).respond(text="<kml>moved a stop</kml>")

    assert run(accept=False) == 1
    assert f"mymaps/{r_map.mid}.kml" in capsys.readouterr().out


def test_manifest_is_stable_json(data: Path, site: respx.MockRouter) -> None:
    run(accept=True)
    first = (data / "bus" / "sources.json").read_text()

    run(accept=True)

    assert (data / "bus" / "sources.json").read_text() == first
    assert json.loads(first)["lineResorts"]["Tsugaike Mountain Resort"] == ["v", "t"]
