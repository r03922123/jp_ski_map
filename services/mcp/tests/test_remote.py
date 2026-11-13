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

    return asyncio.run(go())


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
