from fastapi import FastAPI

from hakuba_api.catalog.router import router as catalog_router

app = FastAPI(title="Hakuba Ski Map API")
app.include_router(catalog_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
