"""Public endpoints: the published combos of one glove finish or one knife finish, and how many
every finish has."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from combo_api.catalog.models import Finish, ItemType
from combo_api.catalog.routes import NOT_FOUND
from combo_api.catalog.snapshot import Kind
from combo_api.combos import queries
from combo_api.combos.models import Combo, KnifeOrder
from combo_api.combos.schemas import SLUG_MAX, ComboCounts, PublicCombo
from combo_api.db import get_session
from combo_api.screenshots.shapes import ImageBase

Session = Annotated[AsyncSession, Depends(get_session)]

SlugPath = Annotated[str, Path(min_length=1, max_length=SLUG_MAX)]

router = APIRouter(tags=["combos"])


async def finish_of(db: AsyncSession, kind: Kind, type_slug: str, finish_slug: str) -> Finish:
    """The finish these slugs name, retired or not, or 404."""
    finish = await db.scalar(
        select(Finish)
        .join(ItemType)
        .where(ItemType.kind == kind, ItemType.slug == type_slug, Finish.slug == finish_slug)
    )
    if finish is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return finish


async def published(
    db: AsyncSession, query: Select[*queries.ComboColumns], base_url: str
) -> list[PublicCombo]:
    rows = (await db.execute(query.where(queries.PUBLISHED))).all()
    return [queries.public_out(row, base_url) for row in rows]


@router.get("/gloves/{type_slug}/{finish_slug}/combos", responses=NOT_FOUND)
async def list_glove_finish_combos(
    type_slug: SlugPath, finish_slug: SlugPath, db: Session, images: ImageBase
) -> list[PublicCombo]:
    """The published combos of one glove finish, highest rating first; ties in knife order."""
    finish = await finish_of(db, "glove", type_slug, finish_slug)
    query = (
        queries.combos()
        .outerjoin(KnifeOrder, KnifeOrder.type_slug == queries.KnifeType.slug)
        .where(Combo.glove_finish_id == finish.id)
        .order_by(
            Combo.rating.desc(),
            KnifeOrder.position.asc().nulls_last(),
            queries.KnifeType.position,
            queries.KnifeFinish.position,
            Combo.id,
        )
    )
    return await published(db, query, images)


@router.get("/knives/{type_slug}/{finish_slug}/combos", responses=NOT_FOUND)
async def list_knife_finish_combos(
    type_slug: SlugPath, finish_slug: SlugPath, db: Session, images: ImageBase
) -> list[PublicCombo]:
    """The published combos of one knife finish, highest rating first; ties in glove order."""
    finish = await finish_of(db, "knife", type_slug, finish_slug)
    query = (
        queries.combos()
        .where(Combo.knife_finish_id == finish.id)
        .order_by(
            Combo.rating.desc(),
            queries.GloveType.position,
            queries.GloveFinish.position,
            Combo.id,
        )
    )
    return await published(db, query, images)


async def counts_by_finish(
    db: AsyncSession, finish_id: InstrumentedAttribute[int]
) -> dict[str, dict[str, int]]:
    """Published combos per finish of one side, keyed by type slug then finish slug."""
    rows = await db.execute(
        select(ItemType.slug, Finish.slug, func.count())
        .select_from(Combo)
        .join(Finish, finish_id == Finish.id)
        .join(ItemType, Finish.item_type_id == ItemType.id)
        .where(queries.PUBLISHED)
        .group_by(ItemType.slug, Finish.slug)
        .order_by(ItemType.slug, Finish.slug)
    )
    counts: dict[str, dict[str, int]] = {}
    for type_slug, finish_slug, count in rows:
        counts.setdefault(type_slug, {})[finish_slug] = count
    return counts


@router.get("/combo-counts")
async def get_combo_counts(db: Session) -> ComboCounts:
    """How many published combos every glove finish and knife finish has; none means left out."""
    return ComboCounts(
        gloves=await counts_by_finish(db, Combo.glove_finish_id),
        knives=await counts_by_finish(db, Combo.knife_finish_id),
    )
