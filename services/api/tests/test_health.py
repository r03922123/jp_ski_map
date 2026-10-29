from fastapi.testclient import TestClient

from hakuba_api.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_schema_is_served() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Hakuba Ski Map API"
