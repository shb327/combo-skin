from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins.models import Admin
from combo_api.catalog.models import Finish
from combo_api.combos.models import Combo, KnifeOrder
from tests.combos.support import finish_id

pytestmark = pytest.mark.anyio

OWNER_ORDER = [
    "butterfly",
    "karambit",
    "m9-bayonet",
    "talon",
    "skeleton",
    "stiletto",
    "bayonet",
    "flip",
    "nomad",
    "huntsman",
    "falchion",
    "bowie",
    "classic",
    "ursus",
    "kukri",
    "paracord",
    "survival",
    "gut",
    "shadow-daggers",
    "navaja",
]


async def combo_row(db: AsyncSession, admin: int, **values: Any) -> Combo:
    now = datetime.now(UTC)
    row = {
        "public_id": "abcdefghij12",
        "glove_finish_id": await finish_id(db, "glove", "specialist", "crimson-kimono"),
        "knife_finish_id": await finish_id(db, "knife", "karambit", "doppler-ruby"),
        "rating": Decimal("8.88"),
        "status": "draft",
        "version": 1,
        "created_at": now,
        "updated_at": now,
        "created_by": admin,
        "updated_by": admin,
    }
    return Combo(**(row | values))


async def refused(db: AsyncSession, admin: int, **values: Any) -> None:
    row = await combo_row(db, admin, **values)
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(row)
            await db.flush()


async def test_knife_order_is_seeded(db_session: AsyncSession) -> None:
    rows = (await db_session.scalars(select(KnifeOrder).order_by(KnifeOrder.position))).all()
    assert [(r.position, r.type_slug) for r in rows] == list(enumerate(OWNER_ORDER, start=1))


@pytest.mark.usefixtures("catalog")
async def test_a_valid_combo_is_stored(db_session: AsyncSession, admin: int) -> None:
    row = await combo_row(
        db_session,
        admin,
        glove_float_from=Decimal("0.06"),
        glove_float_to=Decimal("0.8"),
        knife_seeds=[0, 1000],
        description="x" * 1000,
    )
    db_session.add(row)
    await db_session.flush()
    stored = await db_session.scalar(select(Combo).where(Combo.id == row.id))
    assert stored is not None
    assert (stored.glove_seeds, stored.knife_seeds) == ([], [0, 1000])
    assert stored.rating == Decimal("8.88")


@pytest.mark.usefixtures("catalog")
async def test_constraints(db_session: AsyncSession, admin: int) -> None:
    db_session.add(await combo_row(db_session, admin))
    await db_session.flush()
    await refused(db_session, admin, public_id="abcdefghij13")  # the same pairing again
    other = await finish_id(db_session, "knife", "karambit", "fade")
    cases: list[dict[str, Any]] = [
        {"glove_float_from": Decimal("0.1")},
        {"knife_float_to": Decimal("0.1")},
        {"glove_float_from": Decimal("0.3"), "glove_float_to": Decimal("0.3")},
        {"knife_float_from": Decimal("0.5"), "knife_float_to": Decimal("0.2")},
        {"knife_float_from": Decimal("-0.1"), "knife_float_to": Decimal("0.2")},
        {"glove_float_from": Decimal("0.5"), "glove_float_to": Decimal("1.0001")},
        {"glove_seeds": [-1]},
        {"knife_seeds": [1001]},
        {"knife_seeds": [1, None]},
        {"glove_seeds": list(range(101))},
        {"rating": Decimal("-0.01")},
        {"rating": Decimal("10.01")},
        {"description": "x" * 1001},
        {"status": "hidden"},
        {"version": 0},
        {"public_id": "abcdefghij1"},
        {"public_id": "Abcdefghij12"},
    ]
    for values in cases:
        await refused(
            db_session, admin, **({"public_id": "zzzzzzzzzzzz", "knife_finish_id": other} | values)
        )


@pytest.mark.usefixtures("catalog")
async def test_referenced_finishes_and_admins_cannot_be_deleted(
    db_session: AsyncSession, admin: int
) -> None:
    row = await combo_row(db_session, admin)
    db_session.add(row)
    await db_session.flush()
    for statement in (
        delete(Finish).where(Finish.id == row.knife_finish_id),
        delete(Finish).where(Finish.id == row.glove_finish_id),
        delete(Admin).where(Admin.id == admin),
    ):
        with pytest.raises(IntegrityError):
            async with db_session.begin_nested():
                await db_session.execute(statement)
