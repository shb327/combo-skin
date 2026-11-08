import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.routing import iter_route_contexts
from httpx import AsyncClient

from combo_api import openapi
from combo_api.main import create_app
from combo_api.settings import Settings
from tests.support import API_DIR, running


@pytest.mark.anyio
async def test_schema_is_served(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert schema["openapi"].startswith("3.1")
    assert schema["info"]["title"] == "Combo Skin API"
    assert {"/health/live", "/health/ready"} <= set(schema["paths"])


@pytest.mark.anyio
async def test_docs_are_served(client: AsyncClient) -> None:
    response = await client.get("/docs")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert (await client.get("/redoc")).status_code == 404


@pytest.mark.anyio
async def test_docs_can_be_turned_off(test_settings: Settings) -> None:
    settings = test_settings.model_copy(update={"docs_enabled": False})
    async with running(create_app(settings=settings)) as client:
        assert (await client.get("/docs")).status_code == 404
        assert (await client.get("/openapi.json")).status_code == 404
        assert (await client.get("/health/live")).status_code == 200


def test_operation_ids_are_unique_function_names() -> None:
    app = create_app()
    schema = app.openapi()
    operation_ids = [
        operation["operationId"] for path in schema["paths"].values() for operation in path.values()
    ]
    assert len(operation_ids) == len(set(operation_ids))
    checked = 0
    # Included routers expanded, as the app serves them.
    for route in iter_route_contexts(app.routes):
        if route.path is not None and route.include_in_schema:
            for method in route.methods or ():
                operation = schema["paths"][route.path][method.lower()]
                assert operation["operationId"] == route.name
                checked += 1
    assert checked == len(operation_ids)


def test_snapshot_is_up_to_date() -> None:
    assert openapi.main(["--check"]) == 0


def test_check_fails_on_stale_snapshot(tmp_path: Path) -> None:
    stale = tmp_path / "openapi.json"
    stale.write_text("{}\n")
    assert openapi.main(["--check", "--output", str(stale)]) == 1
    assert openapi.main(["--output", str(stale)]) == 0
    assert openapi.main(["--check", "--output", str(stale)]) == 0
    assert stale.read_text() == (API_DIR / "openapi.json").read_text()


def test_check_needs_no_settings_or_database(tmp_path: Path) -> None:
    env = {key: value for key, value in os.environ.items() if not key.startswith("POSTGRES_")}
    result = subprocess.run(
        [sys.executable, "-m", "combo_api.openapi", "--check"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
