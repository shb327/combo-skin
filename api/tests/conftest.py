from collections.abc import AsyncIterator, Iterator

import pytest
from alembic import command
from alembic.config import Config
from httpx import AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from combo_api.db import get_session
from combo_api.main import create_app
from combo_api.screenshots.storage import MemoryStorage
from combo_api.settings import Settings, load_settings
from tests.support import ADMIN_ORIGIN, alembic_config, rolled_back_session, running


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """Settings for a separate test database, created if missing and migrated to head."""
    settings = load_settings()
    settings = settings.model_copy(
        update={
            "postgres_db": f"{settings.postgres_db}_test",
            "admin_origins": [ADMIN_ORIGIN],
            "session_cookie_secure": True,
            "session_idle_minutes": 60,
            "session_max_hours": 12,
            "trusted_proxies": [],
        }
    )
    admin = create_engine(settings.database_url("postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        exists = connection.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": settings.postgres_db},
        )
        if not exists:
            connection.execute(text(f'CREATE DATABASE "{settings.postgres_db}"'))
    admin.dispose()
    command.upgrade(alembic_config(settings), "head")
    return settings


@pytest.fixture
def migrations(test_settings: Settings) -> Iterator[Config]:
    """Alembic config for the test database; leaves it at head afterwards."""
    config = alembic_config(test_settings)
    yield config
    command.upgrade(config, "head")


@pytest.fixture
async def engine(test_settings: Settings) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(test_settings.database_url())
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with rolled_back_session(engine) as session:
        yield session


@pytest.fixture
async def client(test_settings: Settings, db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app(settings=test_settings, storage=MemoryStorage())

    async def test_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = test_session
    async with running(app) as client:
        yield client
