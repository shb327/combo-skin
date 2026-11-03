"""The knife order batches follow: the saved order, then active knife types missing from it."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.models import ItemType
from combo_api.combos.models import KnifeOrder


async def knife_types(db: AsyncSession) -> list[ItemType]:
    """Active knife types in knife order. Saved slugs of retired or unknown types are skipped;
    active types not saved yet follow in catalog order."""
    saved = (await db.scalars(select(KnifeOrder.type_slug).order_by(KnifeOrder.position))).all()
    rank = {slug: index for index, slug in enumerate(saved)}
    types = (
        await db.scalars(
            select(ItemType)
            .where(ItemType.kind == "knife", ItemType.active)
            .order_by(ItemType.position)
        )
    ).all()
    return sorted(types, key=lambda t: rank.get(t.slug, len(rank)))
