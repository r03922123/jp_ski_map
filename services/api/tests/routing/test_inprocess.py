"""In-process routing with a fake Actor, so these run in CI without tiles (SPEC-deploy.md Phase B).

The real Actor is covered by the `live` tests. `ValhallaError` here is the real class."""

import json
import threading
import time
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest
import respx
from fastapi.testclient import TestClient
from valhalla import ValhallaError  # pyright: ignore[reportMissingTypeStubs]

from hakuba_api.main import app
from hakuba_api.routing import engine as engine_module
from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError
from hakuba_api.routing.engine import InProcessEngine, get_engine

VALHALLA = "http://valhalla.test"
TILES = "/deploy/valhalla_tiles.tar"
ROUTE_QUERY = {"mode": "drive", "from": "36.70153,137.84561", "to": "36.69824,137.83881"}
ROUTE_ANSWER = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "valhalla" / "route_drive.json").read_text()
)
Body = dict[str, Any]


def valhalla_error(http_code: int, message: str = "no path") -> Exception:
    error: Any = ValhallaError(message)  # the binding sets these two; Python callers can't
    error.http_code = http_code
    error.message = message
    return error


class FakeActor:
    """Stands in for the binding, and records how many calls ran at the same time."""

    def __init__(self, answer: Any = None) -> None:
        self.answer = answer
        self.calls: list[tuple[str, Body]] = []
        self.max_overlap = 0
        self._running = 0
        self._guard = threading.Lock()

    def _run(self, name: str, req: Body) -> Any:
        with self._guard:
            self._running += 1
            self.max_overlap = max(self.max_overlap, self._running)
            self.calls.append((name, req))
        time.sleep(0.002)
        with self._guard:
            self._running -= 1
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer

    def route(self, req: Body) -> Any:
        return self._run("route", req)

    def matrix(self, req: Body) -> Any:
        return self._run("matrix", req)


class FakeBinding:
    """The `valhalla` package's Actor and get_config, counting how often an Actor is built."""

    def __init__(self) -> None:
        self.actor = FakeActor()
        self.builds = 0
        self.build_error: Exception | None = None
        self.config_kwargs: list[dict[str, Any]] = []

    def get_config(self, **kwargs: Any) -> dict[str, Any]:
        self.config_kwargs.append(kwargs)
        return {"fake": "config"}

    def build(self, config: dict[str, Any]) -> FakeActor:
        time.sleep(0.01)  # a slow build is what lets racing first calls both start one
        self.builds += 1
        if self.build_error:
            raise self.build_error
        return self.actor


def engine_with(actor: FakeActor, wait_s: float = 5) -> InProcessEngine:
    return InProcessEngine(actor, ValhallaError, wait_s=wait_s)


def run_at_once[T](count: int, work: Callable[[], T]) -> list[T]:
    """Run `work` on `count` threads released together, so first calls really race."""
    start = threading.Barrier(count)

    def started() -> T:
        start.wait()
        return work()

    with ThreadPoolExecutor(count) as pool:
        return [f.result() for f in [pool.submit(started) for _ in range(count)]]


@pytest.fixture(autouse=True)
def no_engine_yet(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine_module, "_engine", None)


@pytest.fixture
def binding(monkeypatch: pytest.MonkeyPatch) -> FakeBinding:
    fake = FakeBinding()
    monkeypatch.setattr("valhalla.Actor", fake.build)
    monkeypatch.setattr("valhalla.get_config", fake.get_config)
    return fake


@pytest.fixture
def in_process(binding: FakeBinding, monkeypatch: pytest.MonkeyPatch) -> FakeBinding:
    monkeypatch.setenv("VALHALLA_TILES", TILES)
    return binding


@pytest.fixture
def http_backend() -> Iterator[respx.MockRouter]:
    with respx.mock(base_url=VALHALLA, assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("VALHALLA_URL", VALHALLA)
    return TestClient(app)


# --- one call at a time ---------------------------------------------------------


def test_eight_threads_never_run_the_actor_at_the_same_time() -> None:
    actor = FakeActor(answer={"ok": True})
    engine = engine_with(actor)

    answers = run_at_once(8, lambda: engine.post("/route", {}))

    assert answers == [{"ok": True}] * 8
    assert actor.max_overlap == 1


def test_waiting_too_long_for_the_lock_is_routing_unavailable() -> None:
    entered, finish = threading.Event(), threading.Event()

    class SlowActor(FakeActor):
        def route(self, req: Body) -> Any:
            entered.set()
            assert finish.wait(5)
            return {"ok": True}

    engine = engine_with(SlowActor(), wait_s=0.05)
    with ThreadPoolExecutor(1) as pool:
        first = pool.submit(engine.post, "/route", {})
        assert entered.wait(5)

        with pytest.raises(RoutingUnavailableError, match="busy"):
            engine.post("/route", {})

        finish.set()
        assert first.result() == {"ok": True}
    assert engine.post("/route", {}) == {"ok": True}


# --- paths and errors -----------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "actor_call"), [("/route", "route"), ("/sources_to_targets", "matrix")]
)
def test_each_path_reaches_its_actor_call(path: str, actor_call: str) -> None:
    actor = FakeActor(answer={"ok": True})

    assert engine_with(actor).post(path, {"costing": "auto"}) == {"ok": True}

    assert actor.calls == [(actor_call, {"costing": "auto"})]


def test_valhalla_400_is_no_route() -> None:
    engine = engine_with(FakeActor(answer=valhalla_error(400, "No path could be found")))

    with pytest.raises(NoRouteError, match="No path could be found"):
        engine.post("/route", {})


@pytest.mark.parametrize(
    "error", [valhalla_error(404), valhalla_error(500), RuntimeError("c++ said no")]
)
def test_every_other_error_is_routing_unavailable(error: Exception) -> None:
    with pytest.raises(RoutingUnavailableError):
        engine_with(FakeActor(answer=error)).post("/route", {})


def test_the_lock_is_free_again_after_an_error() -> None:
    actor = FakeActor(answer=valhalla_error(400))
    engine = engine_with(actor, wait_s=0.05)
    with pytest.raises(NoRouteError):
        engine.post("/route", {})

    actor.answer = {"ok": True}

    assert engine.post("/route", {}) == {"ok": True}


# --- one engine per process -----------------------------------------------------


def test_concurrent_first_calls_build_one_engine(binding: FakeBinding) -> None:
    engines = run_at_once(16, lambda: get_engine(TILES))

    assert binding.builds == 1
    assert all(e is engines[0] for e in engines)


def test_actor_config_is_the_tar_only_config(binding: FakeBinding) -> None:
    get_engine(TILES)

    assert binding.config_kwargs == [{"tile_extract": TILES, "tile_dir": "", "verbose": False}]


def test_a_failed_build_is_routing_unavailable_and_is_retried(binding: FakeBinding) -> None:
    binding.build_error = RuntimeError("bad tar")
    with pytest.raises(RoutingUnavailableError):
        get_engine(TILES)

    binding.build_error = None

    assert isinstance(get_engine(TILES), InProcessEngine)
    assert binding.builds == 2


def test_a_missing_tile_file_is_routing_unavailable() -> None:
    """Real binding: its config helper refuses a path that doesn't exist."""
    with pytest.raises(RoutingUnavailableError):
        get_engine("/no/such/valhalla_tiles.tar")


# --- backend choice -------------------------------------------------------------


def test_tiles_setting_sends_the_api_in_process(
    in_process: FakeBinding, http_backend: respx.MockRouter, api: TestClient
) -> None:
    in_process.actor.answer = ROUTE_ANSWER
    http = http_backend.post("/route").respond(json={})

    response = api.get("/api/route", params=ROUTE_QUERY)

    assert (response.status_code, response.json()["durationS"]) == (200, 172)
    assert not http.called


def test_empty_tiles_setting_stays_on_http(
    binding: FakeBinding,
    http_backend: respx.MockRouter,
    api: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VALHALLA_TILES", "")
    http = http_backend.post("/route").respond(json=ROUTE_ANSWER)

    assert api.get("/api/route", params=ROUTE_QUERY).status_code == 200
    assert http.called
    assert binding.builds == 0


@pytest.mark.parametrize(
    ("error", "status", "body"),
    [
        (valhalla_error(400), 404, {"error": "no_route"}),
        (valhalla_error(500), 503, {"error": "routing_unavailable"}),
        (RuntimeError("c++ said no"), 503, {"error": "routing_unavailable"}),
    ],
)
def test_in_process_errors_keep_their_api_meaning(
    in_process: FakeBinding, api: TestClient, error: Exception, status: int, body: dict[str, str]
) -> None:
    in_process.actor.answer = error

    response = api.get("/api/route", params=ROUTE_QUERY)

    assert (response.status_code, response.json()) == (status, body)


# --- /api/matrix bound ----------------------------------------------------------


@pytest.mark.parametrize(("targets", "status"), [(25, 200), (26, 422)])
def test_matrix_takes_at_most_25_targets(
    http_backend: respx.MockRouter, api: TestClient, targets: int, status: int
) -> None:
    cells = [{"to_index": i, "time": 60, "distance": 1.0} for i in range(targets)]
    http = http_backend.post("/sources_to_targets").respond(json={"sources_to_targets": [cells]})
    body = {
        "mode": "drive",
        "origin": {"lat": 36.7, "lng": 137.84},
        "targets": [{"id": f"t{i}", "lat": 36.7, "lng": 137.85} for i in range(targets)],
    }

    response = api.post("/api/matrix", json=body)

    assert response.status_code == status
    assert http.called is (status == 200)
