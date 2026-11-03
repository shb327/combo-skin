"""Alembic environment: runs migrations through the API's async engine settings."""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import URL, pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import combo_api.admins.models  # registers the admin tables
import combo_api.catalog.models  # registers the catalog tables
import combo_api.combos.models  # noqa: F401  (registers the combo tables)
from combo_api.db import Base
from combo_api.settings import load_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> URL:
    url = config.attributes.get("database_url")
    return url if isinstance(url, URL) else load_settings().database_url()


def run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    engine = create_async_engine(database_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(dialect_name="postgresql", target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_online())
