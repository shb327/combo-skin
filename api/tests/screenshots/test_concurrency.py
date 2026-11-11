"""Concurrent claims, on committed rows and separate database sessions.

The other tests run inside one transaction that is rolled back; row locks need separate
sessions and committed rows, so this test commits its own and deletes them afterwards.
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from typing import Any

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
from combo_api.screenshots import queue
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob, Worker
from combo_api.screenshots.storage import MemoryStorage
from combo_api.screenshots.workers import CurrentWorker, digest, new_token
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
# Claims one worker sends at once in the R10 test.
TOGETHER = 3


async def clean(engine: AsyncEngine) -> None:
    async with AsyncSession(engine) as db:
        for table in TABLES:
            await db.execute(delete(table))
        await db.commit()


@pytest.fixture
async def committed(engine: AsyncEngine) -> AsyncIterator[list[str]]:
    """Ten due combos and one worker per claim, committed; yields the workers' tokens."""
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
            tokens = [new_token() for _ in range(CLAIMS)]
            for number, token in enumerate(tokens, start=1):
                db.add(
                    Worker(
                        name=f"render-box-{number}",
                        token_digest=digest(token),
                        created_at=clock.now(),
                        created_by=admin.id,
                    )
                )
            await db.commit()
        yield tokens
    finally:
        await clean(engine)


async def test_concurrent_claims_never_share_a_combo(
    committed: list[str], test_settings: Settings
) -> None:
    """Claims from many workers at once: each due combo goes to one of them."""
    app = create_app(settings=test_settings, storage=MemoryStorage())
    async with running(app) as client:
        responses = await asyncio.gather(
            *(client.post("/worker/jobs/claim", headers=bearer(token)) for token in committed)
        )
    claimed = [r.json()["combo_id"] for r in responses if r.status_code == 200]
    assert sorted(r.status_code for r in responses) == [200] * DUE + [204] * (CLAIMS - DUE)
    assert len(set(claimed)) == DUE


async def test_one_workers_concurrent_claims_leave_at_most_one_live_claim(
    committed: list[str], engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A worker's claims are taken one at a time, so each abandons the one before it (R10),
    however many it sends at once."""
    async with AsyncSession(engine) as db:
        row = await db.scalar(select(Worker).where(Worker.name == "render-box-1"))
    assert row is not None
    worker = CurrentWorker(id=row.id, name=row.name)

    # Each claim waits after `abandon` until all have got there, or half a second has passed.
    # Claims that were not serialised all get there, each having found no earlier claim; claims
    # taken one at a time cannot, and each goes on after the wait.
    abandon = queue.abandon
    arrived = 0
    everyone = asyncio.Event()

    async def abandon_together(*args: Any) -> None:
        nonlocal arrived
        await abandon(*args)
        arrived += 1
        if arrived == TOGETHER:
            everyone.set()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(everyone.wait(), 0.5)

    monkeypatch.setattr(queue, "abandon", abandon_together)

    async def one() -> object:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            return await queue.claim(db, worker, clock.now())

    jobs = await asyncio.gather(*(one() for _ in range(TOGETHER)))
    async with AsyncSession(engine) as db:
        live = await db.scalar(
            select(func.count())
            .select_from(ScreenshotJob)
            .where(ScreenshotJob.lease_expires_at.is_not(None))
        )
        abandoned = await db.scalar(
            select(func.count())
            .select_from(ScreenshotJob)
            .where(ScreenshotJob.last_reason == "abandoned")
        )
    claimed = sum(job is not None for job in jobs)
    assert claimed == TOGETHER
    assert live == 1
    # Every claim but the last was abandoned by the claim after it.
    assert abandoned == claimed - 1
