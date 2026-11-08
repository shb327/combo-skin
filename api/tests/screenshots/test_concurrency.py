"""Concurrent claims, on committed rows and separate database sessions.

The other tests run inside one transaction that is rolled back; row locks need separate
sessions and committed rows, so this test commits its own and deletes them afterwards.
"""

import asyncio
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from combo_api.admins import accounts, clock
from combo_api.admins.models import Admin, AdminSession, LoginFailure
from combo_api.catalog.importer import import_snapshot
from combo_api.catalog.models import Agent, Finish, ItemType
from combo_api.combos import queries
from combo_api.combos.models import Combo
from combo_api.combos.schemas import Conditions
from combo_api.main import create_app
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob, Worker
from combo_api.screenshots.storage import MemoryStorage
from combo_api.screenshots.workers import digest, new_token
from combo_api.settings import Settings
from tests.admins.support import PASSWORD, USERNAME
from tests.combos.conftest import ORDER, SNAPSHOT
from tests.screenshots.workers import bearer
from tests.support import running

pytestmark = pytest.mark.anyio

# Deleted afterwards, children first. The tables migrations seed are left alone.
TABLES = [
    ScreenshotJob,
    ComboScreenshot,
    Combo,
    Worker,
    AdminSession,
    LoginFailure,
    Admin,
    Finish,
    ItemType,
    Agent,
]
DUE = 10
CLAIMS = 20


async def clean(engine: AsyncEngine) -> None:
    async with AsyncSession(engine) as db:
        for table in TABLES:
            await db.execute(delete(table))
        await db.commit()


@pytest.fixture
async def committed(engine: AsyncEngine) -> AsyncIterator[str]:
    """Ten due combos and a worker, committed; yields the worker's token."""
    async with AsyncSession(engine) as db:
        for table in TABLES:
            count = await db.scalar(select(func.count()).select_from(table))
            assert count == 0, f"{table.__tablename__} is not empty"
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            await import_snapshot(db, SNAPSHOT, ORDER)
            await db.commit()
            admin = await accounts.create(db, USERNAME, PASSWORD)
            glove = await db.scalar(
                select(Finish)
                .join(ItemType)
                .where(ItemType.slug == "specialist", Finish.slug == "mogul")
            )
            knives = (
                await db.scalars(
                    select(Finish)
                    .join(ItemType)
                    .where(ItemType.kind == "knife", ItemType.slug == "karambit")
                    .order_by(Finish.position)
                    .limit(DUE)
                )
            ).all()
            assert glove is not None and len(knives) == DUE
            for knife in knives:
                db.add(
                    queries.new_combo(
                        glove,
                        knife,
                        Conditions(),
                        Conditions(),
                        5,
                        None,
                        None,
                        admin.id,
                        clock.now(),
                    )
                )
            token = new_token()
            db.add(
                Worker(
                    name="render-box",
                    token_digest=digest(token),
                    created_at=clock.now(),
                    created_by=admin.id,
                )
            )
            await db.commit()
        yield token
    finally:
        await clean(engine)


async def test_concurrent_claims_never_share_a_combo(
    committed: str, test_settings: Settings
) -> None:
    app = create_app(settings=test_settings, storage=MemoryStorage())
    async with running(app) as client:
        responses = await asyncio.gather(
            *(client.post("/worker/jobs/claim", headers=bearer(committed)) for _ in range(CLAIMS))
        )
    claimed = [r.json()["combo_id"] for r in responses if r.status_code == 200]
    assert sorted(r.status_code for r in responses) == [200] * DUE + [204] * (CLAIMS - DUE)
    assert len(set(claimed)) == DUE
