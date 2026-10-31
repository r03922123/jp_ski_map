from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

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

app = FastAPI(title="Hakuba Ski Map API")
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
