import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from combo_api.db import Base
from tests.support import API_DIR, rolled_back_session


def test_revision_history() -> None:
    script = ScriptDirectory.from_config(Config(API_DIR / "alembic.ini"))
    revisions = {r.revision: r.down_revision for r in script.walk_revisions()}
    assert revisions == {
        "0001": None,
        "0002": "0001",
        "0003": "0002",
        "0004": "0003",
        "0005": "0004",
    }


def test_upgrade_downgrade_upgrade(migrations: Config) -> None:
    command.upgrade(migrations, "head")
    command.downgrade(migrations, "base")
    command.upgrade(migrations, "head")


def test_models_match_migrations(migrations: Config) -> None:
    command.check(migrations)


def test_metadata_has_naming_convention() -> None:
    assert {"ix", "uq", "ck", "fk", "pk"} <= set(Base.metadata.naming_convention)


@pytest.mark.anyio
async def test_session_changes_are_rolled_back(engine: AsyncEngine) -> None:
    async with rolled_back_session(engine) as session:
        await session.execute(text("CREATE TABLE rollback_probe (id integer)"))
        await session.commit()
    async with engine.connect() as connection:
        exists = await connection.scalar(text("SELECT to_regclass('rollback_probe')"))
    assert exists is None


@pytest.mark.anyio
async def test_head_has_only_known_tables(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        tables = await connection.scalars(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        assert set(tables) == {
            "alembic_version",
            "item_types",
            "finishes",
            "admins",
            "admin_sessions",
            "login_failures",
            "combos",
            "knife_order",
            "agents",
            "screenshot_settings",
        }


@pytest.mark.anyio
async def test_default_agent_is_seeded(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        rows = await connection.execute(
            text("SELECT id, default_agent_def_index, updated_by FROM screenshot_settings")
        )
        assert rows.all() == [(1, 5404, None)]
