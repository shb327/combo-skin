"""An unexpected exception is answered 500 `internal_error`, with the CORS headers the route
would have sent, and logged with its traceback."""

import logging
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response

from combo_api.main import create_app
from combo_api.screenshots.storage import MemoryStorage
from combo_api.settings import Settings
from tests.support import ADMIN_ORIGIN, running

pytestmark = pytest.mark.anyio

WEBSITE_ORIGIN = "http://localhost:5173"


class Boom(RuntimeError):
    """What a bug would raise."""


def boom() -> None:
    raise Boom("a detail that must not reach the client")


@pytest.fixture
async def failing(test_settings: Settings) -> AsyncIterator[AsyncClient]:
    """The app with three routes that fail: public, admin and worker."""
    app: FastAPI = create_app(settings=test_settings, storage=MemoryStorage())
    app.add_api_route("/gloves-boom", boom, methods=["GET"], tags=["catalog"])
    app.add_api_route("/admin/boom", boom, methods=["GET", "POST"], tags=["admin"])
    app.add_api_route("/worker/boom", boom, methods=["POST"], tags=["worker"])
    async with running(app) as client:
        yield client


def is_internal_error(response: Response) -> None:
    assert response.status_code == 500
    assert response.json() == {"detail": "internal_error"}
    assert "must not reach" not in response.text
    assert response.headers["cache-control"] == "no-store"


async def test_a_public_route_keeps_its_cors_headers(failing: AsyncClient) -> None:
    response = await failing.get("/gloves-boom", headers={"Origin": WEBSITE_ORIGIN})
    is_internal_error(response)
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.headers["vary"].lower() == "origin"


async def test_an_admin_route_keeps_its_cors_headers(failing: AsyncClient) -> None:
    response = await failing.get("/admin/boom", headers={"Origin": ADMIN_ORIGIN})
    is_internal_error(response)
    assert response.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


async def test_a_worker_route_gets_no_cors_headers(failing: AsyncClient) -> None:
    response = await failing.post("/worker/boom")
    is_internal_error(response)
    assert "access-control-allow-origin" not in response.headers


async def test_the_traceback_is_logged(
    failing: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="combo_api"):
        await failing.post("/admin/boom?secret=1")
    [record] = [r for r in caplog.records if r.name == "combo_api.errors"]
    assert record.getMessage() == "unhandled error method=POST path=/admin/boom"
    assert record.exc_info is not None and record.exc_info[0] is Boom
