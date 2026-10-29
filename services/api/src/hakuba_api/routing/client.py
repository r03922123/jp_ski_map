from typing import Any

import httpx

from hakuba_api.common.geo import Coord
from hakuba_api.routing.maneuvers import maneuver_for, route_summary
from hakuba_api.routing.models import LineString, MatrixCell, Mode, Route, RouteSet, Step
from hakuba_api.routing.polyline import decode_polyline

COSTING: dict[Mode, str] = {"drive": "auto", "walk": "pedestrian"}
MAX_ALTERNATE_RATIO = 1.5  # slower alternates are detours nobody would pick


class NoRouteError(Exception):
    """Valhalla could not connect the locations (off-graph point, no path)."""


class RoutingUnavailableError(Exception):
    """Valhalla is down or failed unexpectedly."""


def _location(coord: Coord) -> dict[str, Any]:
    return {"lat": coord.lat, "lon": coord.lng}


def _to_route(mode: Mode, trip: dict[str, Any]) -> Route:
    """One Valhalla trip (all legs joined) → Route."""
    coordinates: list[list[float]] = []
    steps: list[Step] = []
    roads: list[tuple[list[str], float]] = []  # (street names, km) per maneuver
    for leg in trip["legs"]:
        offset = max(len(coordinates) - 1, 0)  # legs share their joining point
        shape = [[lng, lat] for lng, lat in decode_polyline(leg["shape"])]
        coordinates += shape[1:] if coordinates else shape
        for m in leg["maneuvers"]:
            street_names: list[str] = m.get("street_names") or []
            roads.append((street_names, m["length"]))
            if steps and m["type"] in (4, 5, 6) and leg is not trip["legs"][-1]:
                continue  # intermediate "arrive" of a via-point
            steps.append(
                Step(
                    instruction=m["instruction"],
                    distance_m=round(m["length"] * 1000),
                    duration_s=round(m["time"]),
                    maneuver=maneuver_for(m["type"]),
                    street_names=street_names,
                    shape_range=(
                        m["begin_shape_index"] + offset,
                        m["end_shape_index"] + offset,
                    ),
                )
            )
    return Route(
        mode=mode,
        duration_s=round(trip["summary"]["time"]),
        distance_m=round(trip["summary"]["length"] * 1000),
        geometry=LineString(coordinates=coordinates),
        steps=steps,
        summary=route_summary(roads),
    )


class ValhallaClient:
    def __init__(self, base_url: str, timeout_s: float = 10) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        try:
            response = httpx.post(f"{self._base_url}{path}", json=body, timeout=self._timeout_s)
        except httpx.HTTPError as e:
            raise RoutingUnavailableError(str(e)) from e
        if response.status_code == 400:
            raise NoRouteError(response.json().get("error", "no route"))
        if response.status_code != 200:
            raise RoutingUnavailableError(f"valhalla returned {response.status_code}")
        return response.json()

    def route(self, mode: Mode, origin: Coord, destination: Coord) -> Route:
        return self.routes(mode, origin, destination, alternates=0).primary

    def routes(self, mode: Mode, origin: Coord, destination: Coord, alternates: int) -> RouteSet:
        body: dict[str, Any] = {
            "locations": [_location(origin), _location(destination)],
            "costing": COSTING[mode],
            "units": "kilometers",
        }
        if alternates:
            body["alternates"] = alternates
        data = self._post("/route", body)
        primary = _to_route(mode, data["trip"])
        others = [_to_route(mode, a["trip"]) for a in data.get("alternates", [])]
        return RouteSet(
            primary=primary,
            alternates=[
                r for r in others if r.duration_s <= primary.duration_s * MAX_ALTERNATE_RATIO
            ][:alternates],
        )

    def path(self, mode: Mode, points: list[Coord]) -> Route:
        """One route through ordered points; middle points are pass-through (no stop)."""
        locations = [_location(p) for p in points]
        for loc in locations[1:-1]:
            loc["type"] = "through"
        data = self._post(
            "/route", {"locations": locations, "costing": COSTING[mode], "units": "kilometers"}
        )
        return _to_route(mode, data["trip"])

    def matrix(
        self, mode: Mode, origin: Coord, targets: list[tuple[str, Coord]]
    ) -> list[MatrixCell]:
        """One-to-many durations, in target order (Valhalla `sources_to_targets`)."""
        data = self._post(
            "/sources_to_targets",
            {
                "sources": [_location(origin)],
                "targets": [_location(c) for _, c in targets],
                "costing": COSTING[mode],
                "units": "kilometers",
            },
        )
        cells = sorted(data["sources_to_targets"][0], key=lambda c: c["to_index"])
        return [
            MatrixCell(
                id=target_id,
                duration_s=None if cell["time"] is None else round(cell["time"]),
                distance_m=None if cell["distance"] is None else round(cell["distance"] * 1000),
            )
            for (target_id, _), cell in zip(targets, cells, strict=True)
        ]
