"""Helpers for combo tests. Every username and password here is a placeholder."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.models import Finish, ItemType


async def finish_id(db: AsyncSession, kind: str, type_slug: str, finish_slug: str) -> int:
    found = await db.scalar(
        select(Finish.id)
        .join(ItemType)
        .where(ItemType.kind == kind, ItemType.slug == type_slug, Finish.slug == finish_slug)
    )
    assert found is not None, (kind, type_slug, finish_slug)
    return found
