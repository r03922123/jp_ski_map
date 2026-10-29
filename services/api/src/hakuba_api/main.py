from fastapi import FastAPI

app = FastAPI(title="Hakuba Ski Map API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
