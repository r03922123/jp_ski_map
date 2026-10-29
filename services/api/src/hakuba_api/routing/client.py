from typing import Any

import httpx

from hakuba_api.common.geo import Coord
from hakuba_api.routing.models import LineString, MatrixCell, Mode, Route, Step
from hakuba_api.routing.polyline import decode_polyline

COSTING: dict[Mode, str] = {"drive": "auto", "walk": "pedestrian"}


class NoRouteError(Exception):
    """Valhalla could not connect the locations (off-graph point, no path)."""


class RoutingUnavailableError(Exception):
    """Valhalla is down or failed unexpectedly."""


def _location(coord: Coord) -> dict[str, float]:
    return {"lat": coord.lat, "lon": coord.lng}


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
        data = self._post(
            "/route",
            {
                "locations": [_location(origin), _location(destination)],
                "costing": COSTING[mode],
                "units": "kilometers",
            },
        )
        trip = data["trip"]
        leg = trip["legs"][0]
        return Route(
            mode=mode,
            duration_s=round(trip["summary"]["time"]),
            distance_m=round(trip["summary"]["length"] * 1000),
            geometry=LineString(
                coordinates=[[lng, lat] for lng, lat in decode_polyline(leg["shape"])]
            ),
            steps=[
                Step(
                    instruction=m["instruction"],
                    distance_m=round(m["length"] * 1000),
                    duration_s=round(m["time"]),
                )
                for m in leg["maneuvers"]
            ],
        )

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
