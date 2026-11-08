from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import accounts, clock
from combo_api.db import get_session
from combo_api.main import create_app
from combo_api.screenshots.storage import MemoryStorage
from combo_api.settings import Settings
from tests.admins.support import OTHER_PASSWORD, OTHER_USERNAME, PASSWORD, USERNAME, Clock

API_URL = "https://api.example.test"


@pytest.fixture
def fake_clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    fake = Clock()
    monkeypatch.setattr(clock, "now", fake)
    return fake


@pytest.fixture
def admin_settings(test_settings: Settings) -> Settings:
    return test_settings


@pytest.fixture
def storage() -> MemoryStorage:
    """Object storage in memory; `tests/screenshots/test_s3.py` uses the real service."""
    return MemoryStorage()


@pytest.fixture
async def app(
    admin_settings: Settings, db_session: AsyncSession, storage: MemoryStorage
) -> AsyncIterator[FastAPI]:
    app = create_app(settings=admin_settings, storage=storage)

    async def test_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = test_session
    async with app.router.lifespan_context(app):
        yield app


@pytest.fixture
async def clients(app: FastAPI) -> AsyncIterator[Callable[[str], AsyncClient]]:
    """Clients of the app over https, one per client IP."""
    async with AsyncExitStack() as stack:

        def make(ip: str = "127.0.0.1") -> AsyncClient:
            transport = ASGITransport(app=app, client=(ip, 40000))
            client = AsyncClient(transport=transport, base_url=API_URL)
            stack.push_async_callback(client.aclose)
            return client

        yield make


@pytest.fixture
async def admin_client(clients: Callable[[str], AsyncClient]) -> AsyncClient:
    return clients("127.0.0.1")


@pytest.fixture
async def admin(db_session: AsyncSession) -> int:
    row = await accounts.create(db_session, USERNAME, PASSWORD)
    return row.id


@pytest.fixture
async def other_admin(db_session: AsyncSession) -> int:
    row = await accounts.create(db_session, OTHER_USERNAME, OTHER_PASSWORD)
    return row.id
