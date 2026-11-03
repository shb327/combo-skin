import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from combo_api.catalog.models import ItemType
from combo_api.combos import order as knife_order
from combo_api.combos.models import KnifeOrder
from tests.combos.support import logged_in, retire_type
from tests.combos.test_models import OWNER_ORDER

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]


async def order(client: AsyncClient) -> list[str]:
    response = await client.get("/admin/knife-order")
    assert response.status_code == 200
    return [k["slug"] for k in response.json()["knife_types"]]


async def test_read_the_seeded_order(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    await logged_in(admin_client)
    response = await admin_client.get("/admin/knife-order")
    knife_types = response.json()["knife_types"]
    assert [k["slug"] for k in knife_types] == OWNER_ORDER
    assert knife_types[:3] == [
        {"slug": "butterfly", "name": "Butterfly Knife"},
        {"slug": "karambit", "name": "Karambit"},
        {"slug": "m9-bayonet", "name": "M9 Bayonet"},
    ]
    await retire_type(db_session, "knife", "talon")
    db_session.add(
        ItemType(
            kind="knife",
            def_index=9999,
            codename="weapon_knife_placeholder",
            slug="placeholder",
            name="Placeholder Knife",
            position=99,
        )
    )
    await db_session.flush()
    expected = [s for s in OWNER_ORDER if s != "talon"] + ["placeholder"]
    assert await order(admin_client) == expected


async def test_replace_the_order(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    new_order = list(reversed(OWNER_ORDER))
    response = await admin_client.put(
        "/admin/knife-order", json={"slugs": new_order}, headers=headers
    )
    assert response.status_code == 200, response.text
    assert [k["slug"] for k in response.json()["knife_types"]] == new_order
    assert await order(admin_client) == new_order
    candidates = await admin_client.get(
        "/admin/batches/candidates",
        params={"glove_type": "specialist", "glove_finish": "mogul", "knife_finish": "fade"},
    )
    assert [c["knife"]["type_slug"] for c in candidates.json()["candidates"]] == new_order


async def test_refuse_a_wrong_order(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    await retire_type(db_session, "knife", "talon")
    active = [s for s in OWNER_ORDER if s != "talon"]
    wrong: list[list[Any]] = [
        active[1:],
        [*active, active[0]],
        [*active, "nope"],
        [*active, "specialist"],
        [*active, "talon"],
        [],
    ]
    for slugs in wrong:
        response = await admin_client.put(
            "/admin/knife-order", json={"slugs": slugs}, headers=headers
        )
        assert response.status_code == 422, slugs
        errors = response.json()["detail"]
        assert [(e["loc"], e["type"]) for e in errors] == [
            (["body", "slugs"], "knife_order_mismatch")
        ]
    assert await order(admin_client) == active


async def test_concurrent_replaces_last_write_wins(
    engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A replace that starts while another is writing waits for it, then wins."""
    first = OWNER_ORDER[::-1]
    second = OWNER_ORDER[1:] + OWNER_ORDER[:1]

    async def every_knife(db: AsyncSession) -> list[SimpleNamespace]:
        return [SimpleNamespace(slug=slug) for slug in OWNER_ORDER]

    monkeypatch.setattr(knife_order, "knife_types", every_knife)
    writer = await engine.connect()
    try:
        await writer.begin()
        await writer.execute(delete(KnifeOrder))
        await writer.execute(insert(KnifeOrder), rows(first))
        async with AsyncSession(engine) as db:
            replacing = asyncio.create_task(knife_order.replace(db, second))
            await asyncio.sleep(0.3)
            assert not replacing.done()
            await writer.commit()
            assert await replacing is True
        async with engine.connect() as reader:
            saved = await reader.scalars(select(KnifeOrder.type_slug).order_by(KnifeOrder.position))
            assert list(saved) == second
    finally:
        await writer.close()
        async with engine.begin() as restore:
            await restore.execute(delete(KnifeOrder))
            await restore.execute(insert(KnifeOrder), rows(OWNER_ORDER))


def rows(slugs: list[str]) -> list[dict[str, Any]]:
    return [{"position": i, "type_slug": slug} for i, slug in enumerate(slugs, start=1)]
