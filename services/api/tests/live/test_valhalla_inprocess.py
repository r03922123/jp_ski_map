"""The in-process Valhalla answers exactly like the Valhalla server (SPEC-deploy.md Phase B).

`pytest -m live` needs the server on :8002 and the gitignored tile tar, so it runs in the main
checkout. If the process dies here, check the tar first: a truncated one segfaults on the first
route. The generator's own tests have no `live` mark, so CI runs them without tiles.
"""

import json
import os
import random
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, NamedTuple

import httpx
import pytest

from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError
from hakuba_api.routing.engine import InProcessEngine, get_engine

ROOT = Path(__file__).parents[4]
TILES = ROOT / "infra/valhalla/custom_files/hakuba/valhalla_tiles.tar"
VALHALLA_URL = os.environ.get("VALHALLA_URL", "http://127.0.0.1:8002")
SEED = int(os.environ.get("VALHALLA_PARITY_SEED", "20261109"))  # set it to replay a failure
UNITS = {"units": "kilometers"}
MATRIX_TARGETS = 25  # the most /api/matrix accepts; bus queries send more internally
MATRIX_COST_TOLERANCE = 0.01  # see same_answer
THREADS = 40
REQUESTS_PER_THREAD = 50

Answer = dict[str, Any]
Point = dict[str, float]


@dataclass(frozen=True)
class Case:
    path: str
    body: dict[str, Any]


Ask = Callable[[Case], Answer]


class Requests(NamedTuple):
    mixed: list[Case]
    paths: list[Case]
    errors: list[Case]


def _load_points() -> tuple[list[Point], list[Point]]:
    """Real access points and bus stops, so requests look like the app's."""
    resorts = json.loads((ROOT / "data/resorts.json").read_text())
    stops = json.loads((ROOT / "data/bus_stops.json").read_text())
    access = [a["coord"] for r in resorts for a in r["accessPoints"]]
    located = [s["coord"] for s in stops if s.get("coord")]
    return (
        [{"lat": c["lat"], "lon": c["lng"]} for c in access],
        [{"lat": c["lat"], "lon": c["lng"]} for c in located],
    )


def _route(locations: list[Point], costing: str, **extra: Any) -> Case:
    return Case("/route", {"locations": locations, "costing": costing, **UNITS, **extra})


def _matrix(sources: list[Point], targets: list[Point], costing: str) -> Case:
    body = {"sources": sources, "targets": targets, "costing": costing, **UNITS}
    return Case("/sources_to_targets", body)


def _mixed(rng: random.Random, everywhere: list[Point], stops: list[Point]) -> list[Case]:
    """The bodies routing/client.py sends, including the biggest matrix: a bus query's walk
    to every stop, which holds the engine's lock longest."""
    cases: list[Case] = []
    for costing in ("auto", "pedestrian"):
        for i in range(40):
            alternates = {"alternates": i % 3} if i % 3 else {}  # the API takes 0, 1 or 2
            cases.append(_route(rng.sample(everywhere, 2), costing, **alternates))
        for _ in range(10):
            targets = rng.sample(everywhere, MATRIX_TARGETS) if costing == "auto" else stops
            cases.append(_matrix([rng.choice(everywhere)], targets, costing))
    return cases


def _paths(rng: random.Random, stops: list[Point]) -> list[Case]:
    """The bodies /api/route/path sends: middle points pass through, or are real stops."""
    cases: list[Case] = []
    for stop_at_points in (False, True):
        for _ in range(10):
            points = [dict(p) for p in rng.sample(stops, rng.randint(3, 8))]
            if not stop_at_points:
                for point in points[1:-1]:
                    point["type"] = "through"  # type: ignore[assignment]
            cases.append(_route(points, rng.choice(("auto", "pedestrian"))))
    return cases


def _errors(rng: random.Random, stops: list[Point]) -> list[Case]:
    a, b = rng.sample(stops, 2)
    far_away = {"lat": 0.1, "lon": 0.1}  # past the distance limit
    no_roads = {"lat": 36.0, "lon": 139.5}  # outside the Hakuba tiles
    return [
        _route([far_away, a], "auto"),
        _route([a, no_roads], "pedestrian"),
        _route([a], "auto"),  # one location
        _route([a, b], "nope"),  # no such costing
        _matrix([far_away], [a, b], "auto"),
    ]


def generate_requests(seed: int) -> Requests:
    rng = random.Random(seed)
    access, stops = _load_points()
    everywhere = access + stops
    return Requests(_mixed(rng, everywhere, stops), _paths(rng, stops), _errors(rng, stops))


def server_answer(case: Case) -> Answer:
    answer: Answer = httpx.post(f"{VALHALLA_URL}{case.path}", json=case.body, timeout=30).json()
    if "error_code" not in answer:
        return answer
    return {k: answer[k] for k in ("status_code", "error_code", "error")}


def engine_answer(engine: InProcessEngine, case: Case) -> Answer:
    """Errors in the server's shape, so a wrong code or message counts as a difference."""
    try:
        return engine.post(case.path, case.body)
    except (NoRouteError, RoutingUnavailableError) as e:
        cause = e.__cause__  # the binding's error; "routing busy" has none, and so differs
        return {
            "status_code": getattr(cause, "http_code", None),
            "error_code": getattr(cause, "code", None),
            "error": str(e),
        }


def _split_matrix_costs(answer: Answer) -> tuple[Answer, list[float]]:
    """The answer without its matrix costs, and those costs in cell order. A null stays put."""
    if "sources_to_targets" not in answer:
        return answer, []
    rows: list[list[dict[str, Any]]] = answer["sources_to_targets"]
    costs = [c["cost"] for row in rows for c in row if c.get("cost") is not None]
    plain = [
        [{k: v for k, v in c.items() if k != "cost" or v is None} for c in row] for row in rows
    ]
    return {**answer, "sources_to_targets": plain}, costs


def same_answer(expected: Answer, actual: Answer) -> bool:
    """Exact, except a matrix cell's `cost` (owner's decision, 2026-11-10). Measured over 6 seeds:
    11 of 7380 cells differ, by at most 0.002, each side repeating its own value. The API never
    reads that field; it reads `time` and `distance`, which stay exact."""
    plain_expected, expected_costs = _split_matrix_costs(expected)
    plain_actual, actual_costs = _split_matrix_costs(actual)
    return (
        plain_expected == plain_actual
        and len(expected_costs) == len(actual_costs)
        and all(
            abs(e - a) <= MATRIX_COST_TOLERANCE
            for e, a in zip(expected_costs, actual_costs, strict=True)
        )
    )


def assert_same_answers(cases: list[Case], seed: int, server: Ask, engine: Ask) -> list[Answer]:
    """A relaxed check would hide what this file exists to catch, so see `same_answer`."""
    answers: list[Answer] = []
    different: list[tuple[int, Case, list[str]]] = []
    for index, case in enumerate(cases):
        expected, actual = server(case), engine(case)
        answers.append(expected)
        if not same_answer(expected, actual):
            keys = expected.keys() | actual.keys()
            different.append(
                (index, case, sorted(k for k in keys if expected.get(k) != actual.get(k)))
            )
    if different:
        index, case, keys = different[0]
        pytest.fail(
            f"{len(different)} of {len(cases)} answers differ. First: seed {seed}, index {index}, "
            f"differing keys {keys}, request {case}. Replay with VALHALLA_PARITY_SEED={seed}."
        )
    return answers


@pytest.fixture(scope="module")
def engine() -> InProcessEngine:
    if not TILES.is_file():
        pytest.fail(f"no tiles at {TILES}: run the live tests in the main checkout")
    return get_engine(str(TILES))  # the production path: real Actor, tar-only config


def _compare(cases: list[Case], engine: InProcessEngine) -> list[Answer]:
    return assert_same_answers(cases, SEED, server_answer, lambda c: engine_answer(engine, c))


def _refused(answers: list[Answer]) -> int:
    """Two identical refusals would pass while comparing no route at all."""
    return sum("error_code" in a for a in answers)


@pytest.mark.live
def test_100_mixed_requests_match_the_server(engine: InProcessEngine) -> None:
    answers = _compare(generate_requests(SEED).mixed, engine)

    assert (len(answers), _refused(answers)) == (100, 0)


@pytest.mark.live
def test_20_path_requests_match_the_server(engine: InProcessEngine) -> None:
    answers = _compare(generate_requests(SEED).paths, engine)

    assert (len(answers), _refused(answers)) == (20, 0)


@pytest.mark.live
def test_5_error_cases_match_the_server(engine: InProcessEngine) -> None:
    answers = _compare(generate_requests(SEED).errors, engine)

    assert [a["status_code"] for a in answers] == [400] * 5  # both sides really refused


@pytest.mark.live
def test_40_threads_share_the_real_actor_with_no_wrong_answer(engine: InProcessEngine) -> None:
    """2000 requests, errors included. Expected answers come from one thread; the tests above
    tie those to the server. Reaching the assert at all is the "no crash" half."""
    requests = generate_requests(SEED)
    cases = [*requests.mixed, *requests.paths, *requests.errors]
    expected = [engine_answer(engine, c) for c in cases]
    schedule = list(range(len(cases))) * 16
    random.Random(SEED).shuffle(schedule)
    assert len(schedule) == THREADS * REQUESTS_PER_THREAD == 2000
    start = threading.Barrier(THREADS)  # every thread exists before the first request

    def worker(thread: int) -> list[int]:
        start.wait()
        share = schedule[thread * REQUESTS_PER_THREAD : (thread + 1) * REQUESTS_PER_THREAD]
        return [i for i in share if engine_answer(engine, cases[i]) != expected[i]]

    with ThreadPoolExecutor(THREADS) as pool:
        wrong = [i for result in pool.map(worker, range(THREADS)) for i in result]

    assert wrong == [], f"seed {SEED}: wrong answers for request indexes {wrong[:20]}"


def test_one_seed_always_gives_the_same_requests() -> None:
    assert generate_requests(7) == generate_requests(7)
    assert generate_requests(7) != generate_requests(8)


def test_the_generator_makes_100_mixed_20_path_and_5_error_requests() -> None:
    requests = generate_requests(SEED)

    assert (len(requests.mixed), len(requests.paths), len(requests.errors)) == (100, 20, 5)


def test_mixed_requests_cover_both_costings_on_both_endpoints() -> None:
    kinds = {(c.path, c.body["costing"]) for c in generate_requests(SEED).mixed}

    assert kinds == {
        ("/route", "auto"),
        ("/route", "pedestrian"),
        ("/sources_to_targets", "auto"),
        ("/sources_to_targets", "pedestrian"),
    }


def test_matrix_requests_include_the_biggest_the_app_sends() -> None:
    matrices = [c for c in generate_requests(SEED).mixed if c.path == "/sources_to_targets"]
    sizes = {c.body["costing"]: len(c.body["targets"]) for c in matrices}

    assert sizes == {"auto": MATRIX_TARGETS, "pedestrian": len(_load_points()[1])}


def test_path_requests_are_half_through_points_and_half_stops() -> None:
    middles = [c.body["locations"][1:-1] for c in generate_requests(SEED).paths]
    through = [m for m in middles if all(p.get("type") == "through" for p in m)]
    stops = [m for m in middles if not any("type" in p for p in m)]

    assert (len(through), len(stops)) == (10, 10)


def test_a_difference_names_its_seed_index_and_request() -> None:
    cases = [Case("/route", {"costing": "auto"}), Case("/route", {"costing": "pedestrian"})]

    with pytest.raises(pytest.fail.Exception) as failure:
        assert_same_answers(
            cases,
            seed=42,
            server=lambda case: {"trip": 1, "id": case.body["costing"]},
            engine=lambda case: {"trip": 2, "id": case.body["costing"]},
        )

    message = str(failure.value)
    assert "2 of 2" in message
    assert "seed 42" in message
    assert "index 0" in message
    assert "'costing': 'auto'" in message
    assert "['trip']" in message


def test_matching_answers_pass() -> None:
    cases = [Case("/route", {"costing": "auto"})]

    assert_same_answers(cases, 42, server=lambda _: {"a": 1}, engine=lambda _: {"a": 1})


def _matrix_answer(**cell: Any) -> Answer:
    return {"sources_to_targets": [[{"time": 60, "distance": 1.5, "cost": 393.955, **cell}]]}


def test_a_matrix_cost_may_differ_within_the_tolerance() -> None:
    assert same_answer(_matrix_answer(), _matrix_answer(cost=393.955 + 0.002))


def test_a_matrix_cost_beyond_the_tolerance_differs() -> None:
    assert not same_answer(_matrix_answer(), _matrix_answer(cost=393.955 + 0.02))


@pytest.mark.parametrize(
    "changed",
    [{"time": 61}, {"distance": 1.501}, {"cost": None}, {"extra": 1}],
    ids=["time", "distance", "null-cost", "extra-field"],
)
def test_everything_else_in_a_matrix_cell_stays_exact(changed: dict[str, Any]) -> None:
    assert not same_answer(_matrix_answer(), _matrix_answer(**changed))


def test_a_matrix_with_a_missing_cost_differs() -> None:
    no_cost: Answer = {"sources_to_targets": [[{"time": 60, "distance": 1.5}]]}

    assert not same_answer(_matrix_answer(), no_cost)


def test_a_cost_outside_a_matrix_stays_exact() -> None:
    server: Answer = {"trip": {"summary": {"cost": 393.955}}}
    engine: Answer = {"trip": {"summary": {"cost": 393.956}}}

    assert not same_answer(server, engine)


def test_a_matrix_cost_within_the_tolerance_is_not_reported() -> None:
    cases = [Case("/sources_to_targets", {"costing": "auto"})]

    assert_same_answers(
        cases,
        42,
        server=lambda _: _matrix_answer(),
        engine=lambda _: _matrix_answer(cost=393.956),
    )
