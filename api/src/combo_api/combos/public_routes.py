"""Public endpoints: the published combos of one glove finish or one knife finish."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.models import Finish, ItemType
from combo_api.catalog.routes import NOT_FOUND
from combo_api.catalog.snapshot import Kind
from combo_api.combos import queries
from combo_api.combos.models import Combo, KnifeOrder
from combo_api.combos.schemas import PublicCombo
from combo_api.db import get_session

Session = Annotated[AsyncSession, Depends(get_session)]

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


async def published(db: AsyncSession, query: Select[*queries.ComboColumns]) -> list[PublicCombo]:
    rows = (await db.execute(query.where(Combo.status == "published"))).all()
    return [queries.public_out(row) for row in rows]


@router.get("/gloves/{type_slug}/{finish_slug}/combos", responses=NOT_FOUND)
async def list_glove_finish_combos(
    type_slug: str, finish_slug: str, db: Session
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
    return await published(db, query)


@router.get("/knives/{type_slug}/{finish_slug}/combos", responses=NOT_FOUND)
async def list_knife_finish_combos(
    type_slug: str, finish_slug: str, db: Session
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
    return await published(db, query)
