from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from hakuba_api.bus.router import router as bus_router
from hakuba_api.catalog.router import router as catalog_router
from hakuba_api.common import ratelimit
from hakuba_api.common.upstream import UpstreamBusyError, UpstreamError
from hakuba_api.crowd.router import router as crowd_router
from hakuba_api.places.router import router as places_router
from hakuba_api.pois.router import router as pois_router
from hakuba_api.ranking.router import router as ranking_router
from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError
from hakuba_api.routing.router import router as routing_router
from hakuba_api.snow.router import router as snow_router

# The app's biggest request is a 25-point path (~2 KB); anything far over it is refused
# before it is read, parsed or echoed back
MAX_BODY_BYTES = 64 * 1024


class BodyTooLargeError(HTTPException):
    """Raised from inside the body read; FastAPI passes an HTTPException through as is."""

    def __init__(self) -> None:
        super().__init__(413, "request body too large")


class BodyLimit:
    """Refuse a body over the limit: by its Content-Length up front, or, when streamed
    without one, as soon as the bytes read pass it."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        length = dict(scope["headers"]).get(b"content-length")
        if length is not None and (not length.isdigit() or int(length) > self.max_bytes):
            await JSONResponse({"error": "body_too_large"}, status_code=413)(scope, receive, send)
            return
        read = 0

        async def limited() -> Message:
            nonlocal read
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > self.max_bytes:
                    raise BodyTooLargeError
            return message

        await self.app(scope, limited, send)


# Licence links for the data the API serves (CDLA-P §2.1; Foursquare's NOTICE names API docs)
_REPO = "https://github.com/r03922123/jp_ski_map/blob/main"
DESCRIPTION = f"""Code: MIT. Data: each source keeps its own licence, see \
[DATA-LICENSES.md]({_REPO}/DATA-LICENSES.md). Overture Maps Places lodging records are under \
[CDLA-Permissive-2.0]({_REPO}/LICENSES/CDLA-Permissive-2.0.txt), or for Foursquare's \
[Apache-2.0]({_REPO}/LICENSES/Apache-2.0.txt) with its [NOTICE]({_REPO}/LICENSES/Foursquare-NOTICE.txt), \
or for AllThePlaces' [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)."""

app = FastAPI(title="Hakuba Ski Map API", description=DESCRIPTION)
app.add_middleware(BodyLimit, max_bytes=MAX_BODY_BYTES)
app.include_router(catalog_router)
app.include_router(routing_router)
app.include_router(places_router)
app.include_router(pois_router)
app.include_router(snow_router)
app.include_router(crowd_router)
app.include_router(ranking_router)
app.include_router(bus_router)


@app.middleware("http")
async def limit_clients(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    limits = ratelimit.LIMITS
    key = ratelimit.client_key(
        request.headers.get("x-forwarded-for"),
        request.client.host if request.client else None,
        limits.trusted_hops,
    )
    if key is not None and request.url.path != "/api/health":
        wait = limits.client_retry_after(key)
        if wait is not None:
            return JSONResponse(
                {"error": "rate_limited"}, status_code=429, headers={"Retry-After": str(wait)}
            )
    return await call_next(request)


@app.exception_handler(RequestValidationError)
def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    """FastAPI's 422, minus the `input` it would echo back (and its `ctx`, `url`)."""
    errors = [{k: e[k] for k in ("type", "loc", "msg") if k in e} for e in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


@app.exception_handler(BodyTooLargeError)
def body_too_large(_: Request, __: BodyTooLargeError) -> JSONResponse:
    return JSONResponse({"error": "body_too_large"}, status_code=413)


@app.exception_handler(NoRouteError)
def no_route(_: Request, __: NoRouteError) -> JSONResponse:
    return JSONResponse({"error": "no_route"}, status_code=404)


@app.exception_handler(RoutingUnavailableError)
def routing_unavailable(_: Request, __: RoutingUnavailableError) -> JSONResponse:
    return JSONResponse({"error": "routing_unavailable"}, status_code=503)


@app.exception_handler(UpstreamBusyError)
def upstream_busy(_: Request, exc: UpstreamBusyError) -> JSONResponse:
    return JSONResponse({"error": "upstream_busy", "source": exc.source}, status_code=503)


@app.exception_handler(UpstreamError)
def upstream_unavailable(_: Request, exc: UpstreamError) -> JSONResponse:
    return JSONResponse({"error": "upstream_unavailable", "source": exc.source}, status_code=502)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
