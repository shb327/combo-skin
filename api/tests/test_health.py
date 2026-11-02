import socket
import time

import anyio
import pytest
from alembic import command
from alembic.config import Config
from httpx import AsyncClient

from combo_api.main import create_app
from combo_api.settings import Settings
from tests.support import running

pytestmark = pytest.mark.anyio


def unreachable(settings: Settings) -> Settings:
    """The same settings, pointing at a local port with nothing listening."""
    with socket.socket() as probe:
        probe.bind(("localhost", 0))
        port = probe.getsockname()[1]
    return settings.model_copy(update={"postgres_host": "localhost", "postgres_port": port})


async def test_live(client: AsyncClient) -> None:
    response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_live_without_database(test_settings: Settings) -> None:
    async with running(create_app(settings=unreachable(test_settings))) as client:
        response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready(client: AsyncClient) -> None:
    response = await client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "migrations": "ok"}}


async def test_ready_with_pending_migrations(client: AsyncClient, migrations: Config) -> None:
    await anyio.to_thread.run_sync(command.downgrade, migrations, "base")
    response = await client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "checks": {"database": "ok", "migrations": "pending"},
    }


async def test_ready_without_database(test_settings: Settings) -> None:
    started = time.monotonic()
    async with running(create_app(settings=unreachable(test_settings))) as client:
        response = await client.get("/health/ready")
    assert time.monotonic() - started < 5
    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "checks": {"database": "unavailable", "migrations": "unknown"},
    }
