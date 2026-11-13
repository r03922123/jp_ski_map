"""The same MCP tools over Streamable HTTP, for Claude's custom connectors (SPEC-agent-tools v2).

Served at /mcp/<HAKUBA_MCP_TOKEN>. claude.ai connectors take no auth or OAuth, so the secret in the
path is what keeps the server to the people who were sent the link.
"""

import hmac
import os

from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.responses import PlainTextResponse
from starlette.types import Receive, Scope, Send

from hakuba_mcp.server import mcp

PREFIX = "/mcp/"
MIN_TOKEN_LEN = 32


def _allowed(path: str) -> bool:
    token = os.environ.get("HAKUBA_MCP_TOKEN", "")
    if len(token) < MIN_TOKEN_LEN or not path.startswith(PREFIX):
        return False  # fail closed: no usable token configured means no server
    return hmac.compare_digest(path[len(PREFIX) :].rstrip("/").encode(), token.encode())


async def app(scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] == "lifespan":  # nothing to start: each request builds its own manager
        while (await receive())["type"] != "lifespan.shutdown":
            await send({"type": "lifespan.startup.complete"})
        await send({"type": "lifespan.shutdown.complete"})
        return
    if scope["type"] != "http" or not _allowed(scope["path"]):
        await PlainTextResponse("Not Found", status_code=404)(scope, receive, send)
        return
    # One manager per request: serverless instances share no memory, and the platform may not
    # run the ASGI lifespan a long-lived manager needs. The SDK has no public handle on this server.
    manager = StreamableHTTPSessionManager(
        app=mcp._lowlevel_server,  # pyright: ignore[reportPrivateUsage]
        stateless=True,
        json_response=True,
    )
    async with manager.run():
        await manager.handle_request(scope, receive, send)
