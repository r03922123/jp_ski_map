"""MCP server: read-only Hakuba trip-planning tools over the Hakuba Ski Map HTTP API.

Each tool is a thin GET wrapper that trims the API response to what a planner needs
(ids, names, minutes, cm, levels), so the model's context stays small. See SPEC-agent-tools.md.
"""

import os
from typing import Any, Literal

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

API_URL = os.environ.get("HAKUBA_API_URL", "http://127.0.0.1:8011").rstrip("/")
TIMEOUT_S = 30.0  # a cold Valhalla matrix or Open-Meteo fetch can take several seconds

SortKey = Literal[
    "drive_time", "fresh_snow", "snow_depth", "crowd", "terrain_size", "vertical", "price"
]
Mode = Literal["drive", "walk"]

READ_ONLY = ToolAnnotations(read_only_hint=True)

mcp = MCPServer(
    "hakuba",
    instructions=(
        "Tools for planning a ski day in Hakuba Valley, Japan (10 resorts). Places are passed "
        "between tools as 'lat,lng' strings. Bus times are estimates from published timetables."
    ),
)


def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    """GET the API; turn transport and HTTP errors into a ToolError the model can read."""
    query = {k: v for k, v in (params or {}).items() if v is not None}
    try:
        r = httpx.get(f"{API_URL}{path}", params=query, timeout=TIMEOUT_S)
    except httpx.HTTPError as e:
        raise ToolError(f"Hakuba API not reachable at {API_URL} ({type(e).__name__})") from e
    if r.is_error:
        try:
            detail = str(r.json()["detail"])  # FastAPI's error shape
        except (ValueError, KeyError, TypeError):
            detail = r.text
        raise ToolError(f"Hakuba API {r.status_code} on {path}: {detail[:300]}")
    return r.json()


def _obj(value: Any) -> dict[str, Any]:
    """A nested JSON object, or {} when the API sent null (e.g. snow unknown)."""
    return value or {}


def _coord(c: dict[str, float]) -> str:
    return f"{c['lat']:.5f},{c['lng']:.5f}"


def _min(seconds: float | None) -> float | None:
    return None if seconds is None else round(seconds / 60, 1)


@mcp.tool(annotations=READ_ONLY)
def search_place(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Find a hotel, station or any place in Hakuba by name (English or Japanese) or a
    Google Maps link. Use this first to turn the user's starting point into an origin.

    Returns places with `coord` as a 'lat,lng' string to pass as `origin` to other tools.
    """
    places = _get("/api/places/suggest", {"q": query, "limit": limit})
    return [
        {
            "name": p["name"],
            "nameJa": p.get("nameJa"),
            "kind": p.get("kind"),
            "coord": _coord(p["coord"]),
            "detail": p.get("detail"),
        }
        for p in places
    ]


@mcp.tool(annotations=READ_ONLY)
def rank_resorts(
    origin: str,
    sort: SortKey = "drive_time",
    date: str | None = None,
    night_skiing: bool | None = None,
    hakuba_valley_pass: bool | None = None,
    max_drive_min: float | None = None,
    top: int = 5,
) -> list[dict[str, Any]]:
    """Rank the Hakuba Valley resorts from an origin by ONE criterion and return the top ones.

    origin: 'lat,lng' (from search_place). sort: drive_time (shortest first), fresh_snow
    (cm, past 24 h + half of next 24 h), snow_depth (summit cm), crowd (quietest first),
    terrain_size (runs), vertical (m), price (cheapest day ticket, JPY).
    date: YYYY-MM-DD for the crowd estimate (default today, JST). Filters are optional.
    Each item gives resortId, driveMin, sortValue (in the sort's unit), snow in cm and
    crowdLevel (low/medium/high/very_high).
    """
    ranked = _get(
        "/api/rank",
        {
            "from": origin,
            "sort": sort,
            "date": date,
            "nightSkiing": night_skiing,
            "hakubaValleyPass": hakuba_valley_pass,
            "maxDriveMin": max_drive_min,
        },
    )
    out: list[dict[str, Any]] = []
    for r in ranked[:top]:
        snow = _obj(r.get("snow"))
        crowd = _obj(r.get("crowd"))
        out.append(
            {
                "rank": r["rank"],
                "resortId": r["resortId"],
                "name": r["name"],
                "sortValue": r["sortValue"],
                "driveMin": _min(r.get("driveS")),
                "summitDepthCm": _obj(snow.get("depthCm")).get("summit"),
                "newSnow24hCm": _obj(snow.get("newSnowCm")).get("past24h"),
                "crowdLevel": crowd.get("level"),
            }
        )
    return out


@mcp.tool(annotations=READ_ONLY)
def next_buses(
    origin: str,
    at: str | None = None,
    origin_name: str | None = None,
    per_resort: int = 2,
) -> dict[str, Any]:
    """Next Hakuba Valley shuttle buses from an origin to each reachable resort.

    origin: 'lat,lng'. at: ISO time like 2026-12-20T08:00:00+09:00 (default now, JST).
    origin_name: the hotel's name, so its own pickup stop counts as 0 min walk.
    Returns `status` (ok, no_service with `nextServiceDate` = first service day, or
    awaiting_review = timetable not checked yet),
    `basis` (published, or expected = projected from last season), and per resort the
    earliest options: board stop, walkMin to it, departs/arrives (local time), rideMin.
    Times are timetable estimates, not live positions.
    """
    res = _get("/api/bus/options", {"from": origin, "at": at, "name": origin_name})
    return {
        "status": res["status"],
        "nextServiceDate": res.get("nextServiceDate"),
        "basis": res.get("basis"),
        "newerTimetablePending": res.get("newerSourcePending"),
        "resorts": [
            {
                "resortId": r["resortId"],
                "options": [
                    {
                        "boardStop": o["boardStopName"],
                        "walkMin": _min(o["walkS"]),
                        "departs": o["departsAt"][:16],
                        "arrives": o["arrivesAt"][:16],
                        "rideMin": _min(o["rideS"]),
                        "route": o["routeName"],
                        "timed": o["timed"],
                    }
                    for o in r["options"][:per_resort]
                ],
            }
            for r in res["resorts"]
        ],
    }


def _resolve(place: str) -> str:
    """'lat,lng' passes through; a resort id becomes its main access point."""
    if "," in place:
        return place
    for resort in _get("/api/resorts"):
        if resort["id"] == place:
            return _coord(resort["accessPoints"][0]["coord"])
    raise ToolError(f"unknown place {place!r}: pass 'lat,lng' or a resort id like 'happo-one'")


@mcp.tool(annotations=READ_ONLY)
def route(mode: Mode, origin: str, destination: str) -> dict[str, Any]:
    """Drive or walk ETA between two places (Valhalla road routing, no live traffic).

    origin / destination: 'lat,lng', or a resort id (e.g. 'happo-one') for its main base.
    Returns durationMin, distanceKm and a one-line road summary.
    """
    r = _get("/api/route", {"mode": mode, "from": _resolve(origin), "to": _resolve(destination)})
    return {
        "mode": r["mode"],
        "durationMin": _min(r["durationS"]),
        "distanceKm": round(r["distanceM"] / 1000, 1),
        "summary": r.get("summary"),
    }


@mcp.tool(annotations=READ_ONLY)
def nearby_pois(
    origin: str,
    category: Literal["food", "convenience"],
    mode: Mode = "walk",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Restaurants (food) or convenience stores near a place, closest by travel time first.

    origin: 'lat,lng' or a resort id. Returns name, minutes away by `mode`, distanceM,
    coord and opening hours when OpenStreetMap has them.
    """
    pois = _get(
        "/api/pois/nearby",
        {"from": _resolve(origin), "category": category, "mode": mode, "limit": limit},
    )
    return [
        {
            "name": p["name"],
            "nameJa": p.get("nameJa"),
            "minutes": _min(p.get("durationS")),
            "distanceM": p.get("distanceM"),
            "coord": _coord(p["coord"]),
            "openingHours": p.get("openingHours"),
        }
        for p in pois
    ]


@mcp.tool(annotations=READ_ONLY)
def crowd_and_snow(date: str | None = None) -> list[dict[str, Any]]:
    """Crowd estimate and snow for every resort. Use it to compare conditions before ranking.

    date: YYYY-MM-DD for the crowd estimate (default today, JST). Snow is the current
    model forecast (Open-Meteo), whatever the date. Units: cm for snow, crowdScore 0..1,
    crowdLevel low/medium/high/very_high. Crowd is a heuristic estimate.
    """
    crowd = _get("/api/crowd", {"date": date})
    snow = {s["resortId"]: s for s in _get("/api/snow")}
    out: list[dict[str, Any]] = []
    for c in crowd:
        s = snow.get(c["resortId"], {})
        depth, new = _obj(s.get("depthCm")), _obj(s.get("newSnowCm"))
        out.append(
            {
                "resortId": c["resortId"],
                "date": c["date"],
                "crowdLevel": c["level"],
                "crowdScore": c["score"],
                "crowdReasons": c.get("reasons", []),
                "summitDepthCm": depth.get("summit"),
                "baseDepthCm": depth.get("base"),
                "newSnowPast24hCm": new.get("past24h"),
                "newSnowNext24hCm": new.get("next24h"),
                "newSnowNext72hCm": new.get("next72h"),
            }
        )
    return out


@mcp.prompt()
def plan_ski_day(start: str, date: str = "today") -> str:
    """Plan a ski day in Hakuba from a starting place."""
    return f"""Plan a ski day in Hakuba Valley starting from "{start}" on {date}.
1. Find the origin with search_place and use its 'lat,lng' coord from then on.
2. Check conditions with crowd_and_snow for that date.
3. Rank resorts with rank_resorts on the criterion that matters most (fresh_snow on a powder
   day, crowd on a holiday, drive_time otherwise).
4. For the top pick, get next_buses from the origin (pass origin_name) and the drive route.
5. Answer with the resort, departure and arrival times, snow in cm, crowd level, and say that
   bus times are timetable estimates and crowd is a heuristic, so check before leaving."""


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
