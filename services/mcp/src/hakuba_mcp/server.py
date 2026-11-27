"""MCP server: read-only Hakuba trip-planning tools over the Hakuba Ski Map HTTP API.

Each tool is a thin GET wrapper that trims the API response to what a planner needs
(ids, names, minutes, cm), so the model's context stays small. See SPEC-agent-tools.md.
"""

import os
from typing import Any, Literal

import httpx
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from hakuba_mcp import tracing

API_URL = os.environ.get("HAKUBA_API_URL", "http://127.0.0.1:8010").rstrip("/")
TIMEOUT_S = 30.0  # a cold Valhalla matrix or Open-Meteo fetch can take several seconds

SortKey = Literal[
    "walk_time",
    "fresh_snow",
    "snow_depth",
    "runs",
    "area",
    "run_length",
    "vertical",
    "price",
]

READ_ONLY = ToolAnnotations(read_only_hint=True)


class TracedServer(MCPServer):
    """MCPServer that wraps every tool call in a Langfuse span when tracing is on."""

    async def call_tool(self, name: str, arguments: dict[str, Any], context: Any = None) -> Any:
        tool = self._tool_manager.get_tool(name)
        declared = set(tool.parameters.get("properties", {})) if tool else set[str]()
        # declared names only: an agent could put anything, even a hotel name, in a key
        # the name too: an unknown one is the client's string, so it is not kept either
        with tracing.tool_span(
            name if tool else "unknown_tool", sorted(declared & arguments.keys())
        ):
            return await super().call_tool(name, arguments, context)


mcp = TracedServer(
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


def _to_minute(iso: str | None) -> str | None:
    """An ISO time cut to the minute, as the bus times are (local time, JST)."""
    return iso[:16] if iso else None


@mcp.tool(annotations=READ_ONLY)
def search_place(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Find a hotel, station or any place in Hakuba by name (English or Japanese) or a
    Google Maps link. Use this first to turn the user's starting point into an origin.

    Returns places with `coord` as a 'lat,lng' string to pass as `origin` to other tools,
    and a stable `id`.
    """
    places = _get("/api/places/suggest", {"q": query, "limit": limit})
    return [
        {
            "id": p["id"],
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
    sort: SortKey = "walk_time",
    night_skiing: bool | None = None,
    hakuba_valley_pass: bool | None = None,
    max_walk_min: float | None = None,
    top: int = 5,
) -> list[dict[str, Any]]:
    """Rank the Hakuba Valley resorts from an origin by ONE criterion and return the top ones.

    origin: 'lat,lng' (from search_place). sort: walk_time (shortest walk first), fresh_snow
    (cm, past 24 h + half of next 24 h), snow_depth (summit cm),
    runs (as each resort counts them), area (skiable ha),
    run_length (total run length, m), vertical (m), price (cheapest day ticket, JPY).
    Filters are optional. Each item gives resortId, walkMin, sortValue (in the sort's unit)
    and snow in cm. snowAsOf is the local time (JST) the snow figures are from: say that
    time when you quote them, because they can be a few hours old when the weather service
    is unreachable.
    """
    ranked = _get(
        "/api/rank",
        {
            "from": origin,
            "sort": sort,
            "nightSkiing": night_skiing,
            "hakubaValleyPass": hakuba_valley_pass,
            "maxWalkMin": max_walk_min,
        },
    )
    out: list[dict[str, Any]] = []
    for r in ranked[:top]:
        snow = _obj(r.get("snow"))
        out.append(
            {
                "rank": r["rank"],
                "resortId": r["resortId"],
                "name": r["name"],
                "sortValue": r["sortValue"],
                "walkMin": _min(r.get("walkS")),
                "summitDepthCm": _obj(snow.get("depthCm")).get("summit"),
                "newSnow24hCm": _obj(snow.get("newSnowCm")).get("past24h"),
                "snowAsOf": _to_minute(snow.get("asOf")),
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
    earliest options: board stop and its stable boardStopId, walkMin to it, departs/arrives
    (local time), rideMin.
    When `timed` is false the timetable has no time at the boarding stop or at the resort:
    `departs` is the time at `departsFrom`, which can be an earlier stop (the bus reaches the
    boarding stop later, at an unpublished time), and arrives/rideMin are null; don't
    estimate them, the stop order may vary. Times are timetable estimates, not live positions.
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
                        "boardStopId": o["boardStopId"],
                        "boardStop": o["boardStopName"],
                        "walkMin": _min(o["walkS"]),
                        "departs": _to_minute(o["departsAt"]),
                        "arrives": _to_minute(o["arrivesAt"]),  # None when untimed
                        "rideMin": _min(o["rideS"]),
                        "route": o["routeName"],
                        "timed": o["timed"],
                    }
                    # untimed only: firstStopName is spelled as in the timetable file, so on a
                    # timed option it can differ from boardStop for the same stop
                    | ({} if o["timed"] else {"departsFrom": o["firstStopName"]})
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
    resorts = _get("/api/resorts")
    for resort in resorts:
        if resort["id"] == place:
            return _coord(resort["accessPoints"][0]["coord"])
    ids = ", ".join(r["id"] for r in resorts)  # so the agent's retry needs no guess
    raise ToolError(f"unknown place {place!r}: pass 'lat,lng' or a resort id: {ids}")


@mcp.tool(annotations=READ_ONLY)
def route(origin: str, destination: str) -> dict[str, Any]:
    """Walking ETA between two places (Valhalla routing). For the shuttle bus, use next_buses.

    origin / destination: 'lat,lng', or a resort id (e.g. 'happo-one') for its main base.
    Returns mode ("walk"), durationMin, distanceKm and a one-line summary of the way.
    """
    r = _get("/api/route", {"mode": "walk", "from": _resolve(origin), "to": _resolve(destination)})
    return {
        "mode": r["mode"],  # "walk": says so to a client whose tool list still offers drive
        "durationMin": _min(r["durationS"]),
        "distanceKm": round(r["distanceM"] / 1000, 1),
        "summary": r.get("summary"),
    }


@mcp.tool(annotations=READ_ONLY)
def snow_conditions() -> list[dict[str, Any]]:
    """Snow for every resort. Use it to compare conditions before ranking.

    Snow is the model forecast (Open-Meteo) as of snowAsOf (local time, JST), whatever date
    the user plans for: say that time when you quote snow figures, because they can be a few
    hours old when the weather service is unreachable. Units: cm. No tool has crowd data:
    if asked how busy a resort will be, say so instead of guessing.
    """
    out: list[dict[str, Any]] = []
    for s in _get("/api/snow"):
        depth, new = _obj(s.get("depthCm")), _obj(s.get("newSnowCm"))
        out.append(
            {
                "resortId": s["resortId"],
                "summitDepthCm": depth.get("summit"),
                "baseDepthCm": depth.get("base"),
                "newSnowPast24hCm": new.get("past24h"),
                "newSnowNext24hCm": new.get("next24h"),
                "newSnowNext72hCm": new.get("next72h"),
                "snowAsOf": _to_minute(s.get("asOf")),
            }
        )
    return out


@mcp.prompt()
def plan_ski_day(start: str, date: str = "today") -> str:
    """Plan a ski day in Hakuba from a starting place."""
    return f"""Plan a ski day in Hakuba Valley starting from "{start}" on {date}.
1. Find the origin with search_place and use its 'lat,lng' coord from then on.
2. Check snow with snow_conditions.
3. Rank resorts with rank_resorts on the criterion that matters most (fresh_snow on a powder
   day, walk_time otherwise).
4. For the top pick, get next_buses from the origin (pass origin_name) and the walking route.
5. Answer with the resort, departure and arrival times and snow in cm, and say that bus
   times are timetable estimates, so check before leaving."""


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
