"""Database engine, per-request sessions and the shared model metadata."""

from collections.abc import AsyncIterator
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import Request
from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from combo_api.settings import Settings

API_DIR = Path(__file__).resolve().parents[2]

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def create_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        settings.database_url(),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 2},
    )


def head_revision() -> str | None:
    """The latest migration revision in the code."""
    return ScriptDirectory.from_config(Config(API_DIR / "alembic.ini")).get_current_head()


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessionmaker() as session:
        yield session
