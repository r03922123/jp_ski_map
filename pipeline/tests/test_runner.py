import json
import re
import shutil
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
import respx

from hakuba_pipeline.runner import Stage, fetch, run
from hakuba_pipeline.stages import crawl

# the page check_sources' own tests use: 18 assets and 13 My Maps layers
PAGE_HTML = (Path(__file__).parents[2] / "services/api/tests/fixtures/hv/shuttle.html").read_bytes()
PAGE_URL = "https://www.hakubavalley.com/en/access_en/shuttlebus_en/"
CHANGED_ASSET = "https://www.hakubavalley.com/cms/wp-content/uploads/2026/03/TimetableV2.jpg"


@pytest.fixture
def root(tmp_path: Path) -> Path:
    shutil.copytree(Path(__file__).parents[1] / "seeds", tmp_path / "seeds")
    return tmp_path


@pytest.fixture
def site() -> Iterator[dict[str, bytes]]:
    """The live site, mocked: every URL but the page answers with its own name as bytes."""
    overrides: dict[str, bytes] = {}

    def answer(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        return httpx.Response(200, content=overrides.get(url, url.encode()))

    with respx.mock(assert_all_called=False) as mock:
        mock.get(PAGE_URL).respond(200, content=PAGE_HTML)
        mock.get(url__regex=re.compile(r"^https://www\.(hakubavalley|google)\.com/")).mock(
            side_effect=answer
        )
        yield overrides


def _outputs(root: Path) -> dict[str, bytes]:
    files = [root / "pipeline.lock.json", *sorted((root / "out").rglob("*.json"))]
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in files}


def test_two_offline_runs_give_the_same_lock_and_outputs(
    root: Path, site: dict[str, bytes]
) -> None:
    store = root / "store"
    stages = [Stage.of(crawl)]
    assert run(stages, root=root, store=store).ran == ["crawl"]
    online = _outputs(root)
    sources = json.loads(online["out/crawl/sources.json"])
    assert (len(sources["assets"]), len(sources["myMaps"])) == (18, 13)
    assert len(list(store.iterdir())) == 1 + 18 + 13

    # replay twice from a clean out/ with the same lock and store
    lock = online["pipeline.lock.json"]
    results: list[dict[str, bytes]] = []
    for _ in range(2):
        shutil.rmtree(root / "out")
        (root / "pipeline.lock.json").write_bytes(lock)
        with respx.mock:  # no routes: any network read fails the test
            assert run(stages, root=root, store=store, offline=True).ran == ["crawl"]
        results.append(_outputs(root))
    assert results[0] == results[1] == online


def test_offline_skips_a_stage_whose_inputs_and_outputs_are_unchanged(
    root: Path, site: dict[str, bytes]
) -> None:
    store = root / "store"
    run([Stage.of(crawl)], root=root, store=store)
    with respx.mock:
        assert run([Stage.of(crawl)], root=root, store=store, offline=True).ran == []
        (root / "seeds/hakuba.toml").write_text((root / "seeds/hakuba.toml").read_text() + "\n")
        assert run([Stage.of(crawl)], root=root, store=store, offline=True).ran == ["crawl"]


def test_a_changed_asset_hash_is_detected_and_locked(root: Path, site: dict[str, bytes]) -> None:
    store = root / "store"
    run([Stage.of(crawl)], root=root, store=store)
    before = json.loads((root / "pipeline.lock.json").read_text())["stages"]["crawl"]

    site[CHANGED_ASSET] = b"a new timetable"
    result = run([Stage.of(crawl)], root=root, store=store)

    after = json.loads((root / "pipeline.lock.json").read_text())["stages"]["crawl"]
    assert result.changed == [CHANGED_ASSET]
    assert after["fetches"][CHANGED_ASSET] != before["fetches"][CHANGED_ASSET]
    assert (store / after["fetches"][CHANGED_ASSET]).read_bytes() == b"a new timetable"
    assert after["outputs"] != before["outputs"]  # sources.json carries the new hash


def test_offline_refuses_a_url_the_lock_never_saw(root: Path) -> None:
    def reads_unknown(inputs: object, out: Path) -> None:
        fetch("https://example.com/never-fetched")

    stage = Stage("probe", "1", (), True, reads_unknown)
    with pytest.raises(FileNotFoundError, match="not in pipeline.lock.json"):
        run([stage], root=root, store=root / "store", offline=True)


def test_fetch_outside_a_stage_is_an_error() -> None:
    with pytest.raises(RuntimeError):
        fetch(PAGE_URL)
