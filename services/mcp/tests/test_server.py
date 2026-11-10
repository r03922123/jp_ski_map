import asyncio

import httpx
import pytest
import respx
from mcp.server.mcpserver.exceptions import ToolError

from hakuba_mcp import server as s

API = s.API_URL
ORIGIN = "36.69830,137.86190"

SNOW = {
    "resortId": "happo-one",
    "depthCm": {"base": 40, "summit": 120, "source": "model"},
    "newSnowCm": {"past24h": 12.0, "past72h": 20.0, "next24h": 5.0, "next72h": 9.0},
}
CROWD = {
    "resortId": "happo-one",
    "date": "2026-12-27",
    "level": "high",
    "score": 0.7,
    "source": "heuristic",
    "isEstimate": True,
    "reasons": ["Sunday"],
}


def ranked(i: int) -> dict[str, object]:
    return {
        "resortId": f"r{i}",
        "name": f"Resort {i}",
        "rank": i,
        "sortValue": 12.0,
        "driveS": 600,
        "driveDistanceM": 5000,
        "accessPointId": "x",
        "factors": {},
        "snow": SNOW,
        "crowd": CROWD,
    }


@respx.mock
def test_search_place_sends_query_and_returns_coord_string() -> None:
    route = respx.get(f"{API}/api/places/suggest").respond(
        json=[
            {
                "id": "osm:node/1",
                "name": "JR Hakuba Station",
                "nameJa": "白馬駅",
                "kind": "station",
                "coord": {"lat": 36.6956821, "lng": 137.8632682},
                "detail": "白馬村",
                "source": "photon",
            }
        ]
    )
    out = s.search_place("白馬駅", limit=3)
    assert route.calls.last.request.url.params == httpx.QueryParams(q="白馬駅", limit="3")
    assert out == [
        {
            "name": "JR Hakuba Station",
            "nameJa": "白馬駅",
            "kind": "station",
            "coord": "36.69568,137.86327",
            "detail": "白馬村",
        }
    ]


@respx.mock
def test_rank_resorts_maps_params_drops_none_and_trims() -> None:
    route = respx.get(f"{API}/api/rank").respond(json=[ranked(i) for i in range(1, 8)])
    out = s.rank_resorts(ORIGIN, sort="fresh_snow", night_skiing=True, top=3)
    params = route.calls.last.request.url.params
    assert dict(params) == {"from": ORIGIN, "sort": "fresh_snow", "nightSkiing": "true"}
    assert len(out) == 3
    assert out[0] == {
        "rank": 1,
        "resortId": "r1",
        "name": "Resort 1",
        "sortValue": 12.0,
        "driveMin": 10.0,
        "summitDepthCm": 120,
        "newSnow24hCm": 12.0,
        "crowdLevel": "high",
    }


@respx.mock
def test_rank_resorts_handles_missing_snow_and_crowd() -> None:
    item = ranked(1) | {"snow": None, "crowd": None, "driveS": None}
    respx.get(f"{API}/api/rank").respond(json=[item])
    out = s.rank_resorts(ORIGIN)
    assert out[0]["driveMin"] is None
    assert out[0]["summitDepthCm"] is None
    assert out[0]["crowdLevel"] is None


@respx.mock
def test_next_buses_trims_options_to_minutes_and_local_times() -> None:
    option = {
        "boardStopName": "Hotel Hakuba",
        "walkS": 652,
        "departsAt": "2026-12-20T08:14:00+09:00",
        "arrivesAt": "2026-12-20T08:19:00+09:00",
        "rideS": 300,
        "routeName": "From Misorano",
        "timed": True,
        "rideStops": [{"stopId": "a"}],
    }
    route = respx.get(f"{API}/api/bus/options").respond(
        json={
            "status": "ok",
            "nextServiceDate": None,
            "basis": "expected",
            "newerSourcePending": False,
            "resorts": [{"resortId": "happo-one", "options": [option] * 4}],
        }
    )
    out = s.next_buses(ORIGIN, at="2026-12-20T08:00:00+09:00", origin_name="Hotel Hakuba")
    assert dict(route.calls.last.request.url.params) == {
        "from": ORIGIN,
        "at": "2026-12-20T08:00:00+09:00",
        "name": "Hotel Hakuba",
    }
    assert out["basis"] == "expected"
    opts = out["resorts"][0]["options"]
    assert len(opts) == 2
    assert opts[0] == {
        "boardStop": "Hotel Hakuba",
        "walkMin": 10.9,
        "departs": "2026-12-20T08:14",
        "arrives": "2026-12-20T08:19",
        "rideMin": 5.0,
        "route": "From Misorano",
        "timed": True,
    }


@respx.mock
def test_route_resolves_resort_id_to_its_first_access_point() -> None:
    respx.get(f"{API}/api/resorts").respond(
        json=[{"id": "happo-one", "accessPoints": [{"coord": {"lat": 36.70179, "lng": 137.83683}}]}]
    )
    route = respx.get(f"{API}/api/route").respond(
        json={"mode": "drive", "durationS": 378, "distanceM": 2612, "summary": "via 白馬岳線"}
    )
    out = s.route("drive", ORIGIN, "happo-one")
    assert dict(route.calls.last.request.url.params) == {
        "mode": "drive",
        "from": ORIGIN,
        "to": "36.70179,137.83683",
    }
    assert out == {
        "mode": "drive",
        "durationMin": 6.3,
        "distanceKm": 2.6,
        "summary": "via 白馬岳線",
    }


@respx.mock
def test_route_unknown_resort_id_is_a_tool_error() -> None:
    respx.get(f"{API}/api/resorts").respond(json=[])
    with pytest.raises(ToolError, match="unknown place 'nowhere'"):
        s.route("walk", "nowhere", ORIGIN)


@respx.mock
def test_nearby_pois_params_and_trimming() -> None:
    route = respx.get(f"{API}/api/pois/nearby").respond(
        json=[
            {
                "id": "osm:node/1",
                "category": "convenience",
                "name": "Lawson",
                "nameJa": "ローソン",
                "coord": {"lat": 36.70089, "lng": 137.84685},
                "brand": "Lawson",
                "cuisine": None,
                "openingHours": "24/7",
                "durationS": 1128,
                "distanceM": 1594,
            }
        ]
    )
    out = s.nearby_pois(ORIGIN, "convenience", limit=1)
    assert dict(route.calls.last.request.url.params) == {
        "from": ORIGIN,
        "category": "convenience",
        "mode": "walk",
        "limit": "1",
    }
    assert out == [
        {
            "name": "Lawson",
            "nameJa": "ローソン",
            "minutes": 18.8,
            "distanceM": 1594,
            "coord": "36.70089,137.84685",
            "openingHours": "24/7",
        }
    ]


@respx.mock
def test_crowd_and_snow_joins_by_resort() -> None:
    crowd = respx.get(f"{API}/api/crowd").respond(json=[CROWD])
    respx.get(f"{API}/api/snow").respond(json=[SNOW])
    out = s.crowd_and_snow("2026-12-27")
    assert dict(crowd.calls.last.request.url.params) == {"date": "2026-12-27"}
    assert out == [
        {
            "resortId": "happo-one",
            "date": "2026-12-27",
            "crowdLevel": "high",
            "crowdScore": 0.7,
            "crowdReasons": ["Sunday"],
            "summitDepthCm": 120,
            "baseDepthCm": 40,
            "newSnowPast24hCm": 12.0,
            "newSnowNext24hCm": 5.0,
            "newSnowNext72hCm": 9.0,
        }
    ]


@respx.mock
def test_http_error_detail_becomes_tool_error() -> None:
    respx.get(f"{API}/api/rank").respond(422, json={"detail": "from must be 'lat,lng'"})
    with pytest.raises(ToolError, match=r"422 on /api/rank: from must be 'lat,lng'"):
        s.rank_resorts("abc")


@respx.mock
def test_non_json_error_body_becomes_tool_error() -> None:
    respx.get(f"{API}/api/snow").respond(502, text="Bad Gateway")
    respx.get(f"{API}/api/crowd").respond(json=[])
    with pytest.raises(ToolError, match="502 on /api/snow: Bad Gateway"):
        s.crowd_and_snow()


@respx.mock
def test_unreachable_api_becomes_tool_error() -> None:
    respx.get(f"{API}/api/crowd").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(ToolError, match="not reachable"):
        s.crowd_and_snow()


@respx.mock
def test_tool_error_survives_mcp_call_tool() -> None:
    respx.get(f"{API}/api/rank").respond(422, json={"detail": "bad from"})
    with pytest.raises(ToolError, match="bad from"):
        asyncio.run(s.mcp.call_tool("rank_resorts", {"origin": "abc"}))


def test_server_lists_six_read_only_tools_and_the_prompt() -> None:
    tools = asyncio.run(s.mcp.list_tools())
    assert {t.name for t in tools} == {
        "search_place",
        "rank_resorts",
        "next_buses",
        "route",
        "nearby_pois",
        "crowd_and_snow",
    }
    assert all(t.annotations and t.annotations.read_only_hint for t in tools)
    prompts = asyncio.run(s.mcp.list_prompts())
    assert [p.name for p in prompts] == ["plan_ski_day"]
