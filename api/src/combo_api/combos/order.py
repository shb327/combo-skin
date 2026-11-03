"""The knife order batches follow: the saved order, then active knife types missing from it."""

from sqlalchemy import delete, select, text
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


async def replace(db: AsyncSession, slugs: list[str]) -> bool:
    """Save a new order. Refused (False) unless it names every active knife type once.

    Concurrent replaces take turns on a table lock, so the last one wins; without it, a
    replace that starts during another would not see that one's rows and could not delete
    them."""
    await db.execute(text("LOCK TABLE knife_order IN SHARE ROW EXCLUSIVE MODE"))
    active = {t.slug for t in await knife_types(db)}
    if len(slugs) != len(active) or set(slugs) != active:
        return False
    await db.execute(delete(KnifeOrder))
    db.add_all(KnifeOrder(position=i, type_slug=slug) for i, slug in enumerate(slugs, start=1))
    await db.commit()
    return True
