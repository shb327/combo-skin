"""Public CORS on the public read routes; admin origins keep their own CORS."""

import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.importer import import_snapshot
from combo_api.catalog.snapshot import load_display_order, load_snapshot
from tests.support import ADMIN_ORIGIN, API_DIR

pytestmark = pytest.mark.anyio

WEBSITE_ORIGIN = "http://localhost:5173"
PUBLIC_TAGS = {"catalog", "combos"}
# Slugs from the committed catalog for each kind's path parameters.
SLUGS = {
    "gloves": {"type_slug": "specialist", "finish_slug": "mogul"},
    "knives": {"type_slug": "karambit", "finish_slug": "doppler-ruby"},
}


def public_paths() -> list[str]:
    """Every GET route tagged catalog or combos in the OpenAPI snapshot, with real slugs."""
    schema = json.loads((API_DIR / "openapi.json").read_text())
    paths = []
    for path, operations in schema["paths"].items():
        get = operations.get("get")
        if get and PUBLIC_TAGS & set(get.get("tags", [])):
            paths.append(path.format(**SLUGS[path.split("/")[1]]))
    return paths


PUBLIC_PATHS = public_paths()


def cors(headers: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.startswith("access-control-")}


@pytest.fixture
async def catalog(db_session: AsyncSession) -> AsyncSession:
    await import_snapshot(db_session, load_snapshot(), load_display_order())
    return db_session


def test_public_paths_cover_catalog_and_combos() -> None:
    assert "/gloves" in PUBLIC_PATHS
    assert "/knives/karambit/doppler-ruby" in PUBLIC_PATHS
    assert "/gloves/specialist/mogul/combos" in PUBLIC_PATHS
    assert "/knives/karambit/doppler-ruby/combos" in PUBLIC_PATHS
    assert len(PUBLIC_PATHS) == 8


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize("path", PUBLIC_PATHS)
@pytest.mark.parametrize("origin", [WEBSITE_ORIGIN, None])
async def test_public_routes_allow_any_origin(
    client: AsyncClient, path: str, origin: str | None
) -> None:
    headers = {"Origin": origin} if origin else {}
    response = await client.get(path, headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "origin" in response.headers["vary"].lower()
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize(
    "path", ["/gloves/specialist/nope/combos", "/knives/nope", "/gloves/specialist/nope"]
)
async def test_public_404_allows_any_origin(client: AsyncClient, path: str) -> None:
    response = await client.get(path, headers={"Origin": WEBSITE_ORIGIN})
    assert response.status_code == 404
    assert response.headers["access-control-allow-origin"] == "*"
    assert "origin" in response.headers["vary"].lower()
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/admin/me"),
        ("GET", "/admin/combos"),
        ("GET", "/health/ready"),
        ("GET", "/health/live"),
        ("GET", "/openapi.json"),
        ("GET", "/docs"),
        ("POST", "/admin/login"),
        ("POST", "/gloves"),
    ],
)
async def test_other_routes_get_no_cors(client: AsyncClient, method: str, path: str) -> None:
    response = await client.request(method, path, headers={"Origin": WEBSITE_ORIGIN}, json={})
    assert cors(dict(response.headers)) == {}


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize("path", ["/gloves", "/gloves/specialist/mogul/combos"])
async def test_preflight_from_website_gets_no_cors(client: AsyncClient, path: str) -> None:
    response = await client.options(
        path, headers={"Origin": WEBSITE_ORIGIN, "Access-Control-Request-Method": "GET"}
    )
    assert cors(dict(response.headers)) == {}


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize("path", ["/gloves", "/gloves/specialist/mogul/combos"])
async def test_admin_origin_keeps_credentialed_cors(client: AsyncClient, path: str) -> None:
    response = await client.get(path, headers={"Origin": ADMIN_ORIGIN})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "origin" in response.headers["vary"].lower()


async def test_admin_origin_on_admin_route_unchanged(client: AsyncClient) -> None:
    response = await client.get("/admin/me", headers={"Origin": ADMIN_ORIGIN})
    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
