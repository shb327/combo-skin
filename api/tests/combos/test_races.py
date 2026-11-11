"""Writes that race other requests: a pairing stored by another request after this one's
existence check, and a public id that is already taken."""

import asyncio
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, event, insert, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from combo_api.admins.models import Admin
from combo_api.catalog.models import Finish, ItemType
from combo_api.combos import admin_routes, ids, queries
from combo_api.combos.models import Combo
from tests.combos.support import combo_body, combo_count, create, logged_in

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]


@pytest.fixture
def check_misses(monkeypatch: pytest.MonkeyPatch) -> None:
    """The existence check answers as it would for a request that ran it before another
    request stored the same pairing: no combo yet."""

    async def never(*_: Any) -> bool:
        return False

    monkeypatch.setattr(queries, "pairing_exists", never)


def ids_from(monkeypatch: pytest.MonkeyPatch, first: list[str]) -> None:
    """New public ids: the given ones first, then random ones."""
    given: Iterator[str] = iter(first)
    random = ids.new_public_id
    monkeypatch.setattr(queries, "new_public_id", lambda: next(given, None) or random())


async def test_a_pairing_stored_after_the_check_is_409(
    admin_client: AsyncClient, db_session: AsyncSession, check_misses: None
) -> None:
    headers = await logged_in(admin_client)
    await create(admin_client, headers)
    response = await admin_client.post("/admin/combos", json=combo_body(), headers=headers)
    assert response.status_code == 409
    assert response.json() == {"detail": "combo_exists"}
    assert await combo_count(db_session) == 1


async def test_a_batch_pairing_stored_after_the_check_is_409(
    admin_client: AsyncClient, db_session: AsyncSession, check_misses: None
) -> None:
    headers = await logged_in(admin_client)
    await create(admin_client, headers, knife=("butterfly", "doppler-ruby"))
    body = {
        "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
        "knife_finish": "doppler-ruby",
        "create": [
            {"knife_type": "karambit", "rating": 8, "description": None},
            {"knife_type": "butterfly", "rating": 7.95, "description": None},
        ],
        "update": [],
    }
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 409
    assert response.json() == {"detail": "combo_exists"}
    assert await combo_count(db_session) == 1


async def test_a_taken_public_id_is_drawn_again(
    admin_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = await logged_in(admin_client)
    first = await create(admin_client, headers)
    ids_from(monkeypatch, [first["id"]])
    response = await admin_client.post(
        "/admin/combos", json=combo_body(knife=("butterfly", "fade")), headers=headers
    )
    assert response.status_code == 201, response.text
    second = response.json()["id"]
    assert second != first["id"]
    stored = (await db_session.scalars(select(Combo.public_id))).all()
    assert sorted(stored) == sorted([first["id"], second])


async def test_a_batch_draws_a_taken_public_id_again(
    admin_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = await logged_in(admin_client)
    first = await create(admin_client, headers, knife=("butterfly", "fade"))
    ids_from(monkeypatch, [first["id"], first["id"]])
    body = {
        "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
        "knife_finish": "doppler-ruby",
        "create": [
            {"knife_type": "karambit", "rating": 8, "description": None},
            {"knife_type": "butterfly", "rating": 7.95, "description": None},
        ],
        "update": [],
    }
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 200, response.text
    assert first["id"] not in [c["id"] for c in response.json()["created"]]
    assert await combo_count(db_session) == 3


async def test_an_id_taken_three_times_running_is_an_error(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    headers = await logged_in(admin_client)
    first = await create(admin_client, headers)
    ids_from(monkeypatch, [first["id"]] * 3)
    response = await admin_client.post(
        "/admin/combos", json=combo_body(knife=("butterfly", "fade")), headers=headers
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "internal_error"}
    assert "uq_combos_public_id" in caplog.text


@pytest.fixture
async def stored_pair(engine: AsyncEngine) -> AsyncIterator[tuple[str, str]]:
    """Two committed combos, so separate connections can lock them; removed afterwards."""
    now = datetime.now(UTC)
    async with engine.begin() as connection:
        admin = await connection.scalar(
            insert(Admin)
            .values(
                username="lock-order-admin",
                password_hash="unused",
                password_changed_at=now,
                created_at=now,
                updated_at=now,
            )
            .returning(Admin.id)
        )
        glove_type, knife_type = [
            await connection.scalar(
                insert(ItemType)
                .values(
                    kind=kind,
                    def_index=index,
                    codename=f"lock_{kind}",
                    slug=f"lock-{kind}",
                    name=kind,
                    position=1,
                )
                .returning(ItemType.id)
            )
            for kind, index in (("glove", 99001), ("knife", 99002))
        ]
        finishes = [
            await connection.scalar(
                insert(Finish)
                .values(
                    item_type_id=type_id,
                    paint_index=paint,
                    slug=f"lock-{paint}",
                    name="Lock",
                    rarity_code="r",
                    rarity_name="R",
                    rarity_color="#fff",
                    image_url="https://example.com/i.png",
                    position=paint,
                )
                .returning(Finish.id)
            )
            for type_id, paint in ((glove_type, 1), (knife_type, 1), (knife_type, 2))
        ]
        public_ids = ("lockorder001", "lockorder002")
        for public_id, knife in zip(public_ids, finishes[1:], strict=True):
            await connection.execute(
                insert(Combo).values(
                    public_id=public_id,
                    glove_finish_id=finishes[0],
                    knife_finish_id=knife,
                    rating=8,
                    status="draft",
                    version=1,
                    created_at=now,
                    updated_at=now,
                    created_by=admin,
                    updated_by=admin,
                )
            )
    try:
        yield public_ids
    finally:
        async with engine.begin() as connection:
            await connection.execute(delete(Combo).where(Combo.created_by == admin))
            await connection.execute(delete(Finish).where(Finish.id.in_(finishes)))
            await connection.execute(
                delete(ItemType).where(ItemType.id.in_([glove_type, knife_type]))
            )
            await connection.execute(delete(Admin).where(Admin.id == admin))


async def held_by_another(engine: AsyncEngine, public_id: str) -> bool:
    """Whether some other transaction holds this combo's row lock."""
    async with engine.connect() as connection, connection.begin():
        try:
            await connection.execute(
                select(Combo.id).where(Combo.public_id == public_id).with_for_update(nowait=True)
            )
        except DBAPIError:
            return True
        return False


async def locker(name: str, db: AsyncSession, ids: list[str]) -> object:
    if name == "ids":
        return await admin_routes.locked_ids(db, ids)
    return await queries.lock(db, ids)


@pytest.mark.parametrize("name", ["ids", "batch"])
async def test_a_waiting_request_holds_no_lock(
    engine: AsyncEngine, stored_pair: tuple[str, str], name: str
) -> None:
    """Combos are locked in one order: a request that names them in the other order waits for
    the first one before locking any, so two requests can never wait for each other."""
    first, second = stored_pair
    async with AsyncSession(engine) as holder, AsyncSession(engine) as waiter:
        await locker(name, holder, [first])
        waiting = asyncio.create_task(locker(name, waiter, [second, first]))
        await asyncio.sleep(0.3)
        assert not waiting.done()
        assert not await held_by_another(engine, second)
        await holder.rollback()
        await waiting
        await waiter.rollback()


async def test_every_combo_lock_is_ordered(
    admin_client: AsyncClient, engine: AsyncEngine, db_session: AsyncSession
) -> None:
    """Publish by ids, publish every draft, unpublish and batch updates lock with ORDER BY."""
    statements: list[str] = []

    def record(_conn: Any, _cursor: Any, statement: str, *_: Any) -> None:
        if "FOR UPDATE" in statement and "FROM combos" in statement:
            statements.append(statement)

    headers = await logged_in(admin_client)
    one = await create(admin_client, headers)
    two = await create(admin_client, headers, knife=("butterfly", "doppler-ruby"))
    sync_engine = db_session.bind.engine.sync_engine  # type: ignore[union-attr]
    event.listen(sync_engine, "before_cursor_execute", record)
    try:
        ids = {"ids": [two["id"], one["id"]]}
        assert (
            await admin_client.post("/admin/combos/publish", json=ids, headers=headers)
        ).is_success
        assert (
            await admin_client.post("/admin/combos/unpublish", json=ids, headers=headers)
        ).is_success
        drafts = {"all_drafts": True}
        await admin_client.post("/admin/combos/publish", json=drafts, headers=headers)
        body = {
            "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
            "knife_finish": "doppler-ruby",
            "create": [],
            "update": [
                {"id": two["id"], "version": 1, "rating": 7, "description": None},
                {"id": one["id"], "version": 1, "rating": 8, "description": None},
            ],
        }
        assert (await admin_client.post("/admin/batches", json=body, headers=headers)).is_success
    finally:
        event.remove(sync_engine, "before_cursor_execute", record)
    assert len(statements) == 4
    assert all("ORDER BY combos.id" in statement for statement in statements), statements
