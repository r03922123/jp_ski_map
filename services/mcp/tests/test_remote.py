import asyncio
import json

import httpx
import pytest

from hakuba_mcp import remote

TOKEN = "t" * 40
HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
INIT = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "0"},
    },
}


def post(path: str, body: object) -> httpx.Response:
    async def go() -> httpx.Response:
        transport = httpx.ASGITransport(app=remote.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://x.test") as c:
            return await c.post(path, content=json.dumps(body), headers=HEADERS)

    return asyncio.run(asyncio.wait_for(go(), 5))  # in-process ASGI ignores httpx timeouts


@pytest.fixture
def token(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("HAKUBA_MCP_TOKEN", TOKEN)
    return TOKEN


def test_no_token_configured_is_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HAKUBA_MCP_TOKEN", raising=False)
    assert post("/mcp/", INIT).status_code == 404


def test_short_token_configured_is_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAKUBA_MCP_TOKEN", "short")
    assert post("/mcp/short", INIT).status_code == 404


def test_wrong_token_is_404(token: str) -> None:
    assert post("/mcp/" + "x" * 40, INIT).status_code == 404
    assert post("/mcp/", INIT).status_code == 404
    assert post("/other/" + token, INIT).status_code == 404


def test_initialize_with_token(token: str) -> None:
    r = post(f"/mcp/{token}", INIT)
    assert r.status_code == 200
    assert r.json()["result"]["serverInfo"]["name"] == "hakuba"


def test_tools_list_with_token(token: str) -> None:
    r = post(f"/mcp/{token}", {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert r.status_code == 200
    names = {t["name"] for t in r.json()["result"]["tools"]}
    assert names == {
        "search_place",
        "rank_resorts",
        "next_buses",
        "route",
        "nearby_pois",
        "crowd_and_snow",
    }


def request(method: str, path: str) -> httpx.Response:
    async def go() -> httpx.Response:
        transport = httpx.ASGITransport(app=remote.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://x.test") as c:
            return await c.request(method, path, headers=HEADERS, timeout=5)

    return asyncio.run(asyncio.wait_for(go(), 5))  # in-process ASGI ignores httpx timeouts


def test_token_prefix_and_suffix_are_404(token: str) -> None:
    assert post(f"/mcp/{token}/extra", INIT).status_code == 404
    assert post(f"/mcp/{token[:-1]}", INIT).status_code == 404


def test_token_length_boundary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HAKUBA_MCP_TOKEN", "a" * 31)
    assert post("/mcp/" + "a" * 31, INIT).status_code == 404
    monkeypatch.setenv("HAKUBA_MCP_TOKEN", "a" * 32)
    assert post("/mcp/" + "a" * 32, INIT).status_code == 200


def test_get_stream_is_refused_not_held_open(token: str) -> None:
    # nothing would ever write to a stateless event stream, so it must not open one
    r = request("GET", f"/mcp/{token}")
    assert r.status_code == 405
    assert r.headers["allow"] == "POST"


def test_lifespan_starts_and_stops() -> None:
    async def go() -> list[str]:
        inbox: asyncio.Queue[dict[str, str]] = asyncio.Queue()
        sent: list[str] = []
        for t in ("lifespan.startup", "lifespan.shutdown"):
            inbox.put_nowait({"type": t})

        async def send(msg: object) -> None:
            assert isinstance(msg, dict)
            sent.append(str(msg["type"]))  # pyright: ignore[reportUnknownArgumentType]

        await remote.app({"type": "lifespan"}, inbox.get, send)  # pyright: ignore[reportArgumentType]
        return sent

    assert asyncio.run(asyncio.wait_for(go(), 5)) == [
        "lifespan.startup.complete",
        "lifespan.shutdown.complete",
    ]
