"""Helpers shared by tests and fixtures."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from combo_api.settings import Settings

API_DIR = Path(__file__).resolve().parents[1]
# The admin dashboard origin allowed in test settings.
ADMIN_ORIGIN = "https://admin.example.test"


def alembic_config(settings: Settings) -> Config:
    config = Config(API_DIR / "alembic.ini")
    config.attributes["database_url"] = settings.database_url()
    return config


@asynccontextmanager
async def rolled_back_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """A session inside a transaction that is always rolled back."""
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@asynccontextmanager
async def running(app: FastAPI) -> AsyncIterator[AsyncClient]:
    """Run the app's lifespan and yield a client that calls it in process."""
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client
