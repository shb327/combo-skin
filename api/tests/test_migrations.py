import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import insert, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from combo_api.catalog.models import Finish, ItemType
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
        "0006": "0005",
        "0007": "0006",
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
            "workers",
            "combo_screenshots",
            "screenshot_jobs",
        }


@pytest.mark.anyio
async def test_default_agent_is_seeded(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        rows = await connection.execute(
            text("SELECT id, default_agent_def_index, updated_by FROM screenshot_settings")
        )
        assert rows.all() == [(1, 5404, None)]


@pytest.mark.anyio
@pytest.mark.parametrize("bounds", [(0.1, None), (None, 0.9)])
async def test_a_finish_with_one_float_bound_is_refused(
    engine: AsyncEngine, bounds: tuple[float | None, float | None]
) -> None:
    async with rolled_back_session(engine) as db:
        type_id = await db.scalar(
            insert(ItemType)
            .values(
                kind="knife",
                def_index=99100,
                codename="one_bound",
                slug="one-bound",
                name="One Bound",
                position=1,
            )
            .returning(ItemType.id)
        )
        row = {
            "item_type_id": type_id,
            "paint_index": 1,
            "slug": "one-bound",
            "name": "One Bound",
            "rarity_code": "r",
            "rarity_name": "R",
            "rarity_color": "#fff",
            "image_url": "https://example.com/i.png",
            "position": 1,
            "float_min": bounds[0],
            "float_max": bounds[1],
        }
        with pytest.raises(IntegrityError, match="ck_finishes_float_range"):
            await db.execute(insert(Finish).values(**row))
