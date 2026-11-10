"""Writes that race other requests: a pairing stored by another request after this one's
existence check, and a public id that is already taken."""

from collections.abc import Iterator
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.combos import ids, queries
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
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = await logged_in(admin_client)
    first = await create(admin_client, headers)
    ids_from(monkeypatch, [first["id"]] * 3)
    with pytest.raises(Exception, match="uq_combos_public_id"):
        await admin_client.post(
            "/admin/combos", json=combo_body(knife=("butterfly", "fade")), headers=headers
        )
