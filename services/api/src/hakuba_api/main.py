from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from hakuba_api.catalog.router import router as catalog_router
from hakuba_api.routing.client import NoRouteError, RoutingUnavailableError
from hakuba_api.routing.router import router as routing_router

app = FastAPI(title="Hakuba Ski Map API")
app.include_router(catalog_router)
app.include_router(routing_router)


@app.exception_handler(NoRouteError)
def no_route(_: Request, __: NoRouteError) -> JSONResponse:
    return JSONResponse({"error": "no_route"}, status_code=404)


@app.exception_handler(RoutingUnavailableError)
def routing_unavailable(_: Request, __: RoutingUnavailableError) -> JSONResponse:
    return JSONResponse({"error": "routing_unavailable"}, status_code=503)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
