"""Helpers for combo tests. Every username and password here is a placeholder."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.models import Finish, ItemType
from combo_api.combos.models import Combo
from tests.admins.support import login, write_headers


async def finish_id(db: AsyncSession, kind: str, type_slug: str, finish_slug: str) -> int:
    found = await db.scalar(
        select(Finish.id)
        .join(ItemType)
        .where(ItemType.kind == kind, ItemType.slug == type_slug, Finish.slug == finish_slug)
    )
    assert found is not None, (kind, type_slug, finish_slug)
    return found


async def logged_in(client: AsyncClient) -> dict[str, str]:
    """Log in as the placeholder admin; returns the headers a write needs."""
    response = await login(client)
    assert response.status_code == 200
    return write_headers(response.json()["csrf_token"])


def item(type_slug: str, finish_slug: str, **conditions: Any) -> dict[str, Any]:
    return {"type_slug": type_slug, "finish_slug": finish_slug, **conditions}


def combo_body(
    glove: tuple[str, str] = ("specialist", "crimson-kimono"),
    knife: tuple[str, str] = ("karambit", "doppler-ruby"),
    rating: Any = 8.88,
    description: Any = None,
    glove_conditions: dict[str, Any] | None = None,
    knife_conditions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "glove": item(*glove, **(glove_conditions or {})),
        "knife": item(*knife, **(knife_conditions or {})),
        "rating": rating,
        "description": description,
    }


async def create(client: AsyncClient, headers: dict[str, str], **body: Any) -> dict[str, Any]:
    response = await client.post("/admin/combos", json=combo_body(**body), headers=headers)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def retire_finish(db: AsyncSession, kind: str, type_slug: str, finish_slug: str) -> None:
    found = await finish_id(db, kind, type_slug, finish_slug)
    await db.execute(update(Finish).where(Finish.id == found).values(active=False))


async def retire_type(db: AsyncSession, kind: str, type_slug: str) -> None:
    await db.execute(
        update(ItemType)
        .where(ItemType.kind == kind, ItemType.slug == type_slug)
        .values(active=False)
    )


async def combo_count(db: AsyncSession) -> int:
    count = await db.scalar(select(func.count()).select_from(Combo))
    return count or 0
