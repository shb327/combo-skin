"""Read endpoints for knife and glove types and their finishes."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog import models
from combo_api.catalog.snapshot import Kind
from combo_api.db import get_session

Session = Annotated[AsyncSession, Depends(get_session)]
NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Not found"}
}

router = APIRouter(tags=["catalog"])


class Rarity(BaseModel):
    code: str
    name: str
    color: str


class Finish(BaseModel):
    slug: str
    name: str
    phase: str | None
    display_name: str
    paint_index: int
    paint_codename: str | None
    rarity: Rarity
    float_min: float | None
    float_max: float | None
    image_url: str
    active: bool


class TypeSummary(BaseModel):
    slug: str
    name: str
    def_index: int
    codename: str
    finish_count: int


class TypeDetail(TypeSummary):
    finishes: list[Finish]


class ItemTypeRef(BaseModel):
    slug: str
    name: str
    def_index: int
    kind: Kind
    active: bool


class FinishDetail(Finish):
    item_type: ItemTypeRef


def finish_out(row: models.Finish) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "name": row.name,
        "phase": row.phase,
        "display_name": row.display_name,
        "paint_index": row.paint_index,
        "paint_codename": row.paint_codename,
        "rarity": Rarity(code=row.rarity_code, name=row.rarity_name, color=row.rarity_color),
        "float_min": row.float_min,
        "float_max": row.float_max,
        "image_url": row.image_url,
        "active": row.active,
    }


def summary(row: models.ItemType, finish_count: int) -> dict[str, Any]:
    return {
        "slug": row.slug,
        "name": row.name,
        "def_index": row.def_index,
        "codename": row.codename,
        "finish_count": finish_count,
    }


async def list_types(session: AsyncSession, kind: Kind) -> list[TypeSummary]:
    finish_count = (
        select(func.count())
        .where(models.Finish.item_type_id == models.ItemType.id, models.Finish.active)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(models.ItemType, finish_count)
        .where(models.ItemType.kind == kind, models.ItemType.active)
        .order_by(models.ItemType.position)
    )
    return [TypeSummary(**summary(row, count)) for row, count in rows]


async def get_type(session: AsyncSession, kind: Kind, type_slug: str) -> TypeDetail:
    row = await session.scalar(
        select(models.ItemType).where(
            models.ItemType.kind == kind, models.ItemType.slug == type_slug, models.ItemType.active
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    finishes = (
        await session.scalars(
            select(models.Finish)
            .where(models.Finish.item_type_id == row.id, models.Finish.active)
            .order_by(models.Finish.position)
        )
    ).all()
    return TypeDetail(
        **summary(row, len(finishes)), finishes=[Finish(**finish_out(f)) for f in finishes]
    )


async def get_finish(
    session: AsyncSession, kind: Kind, type_slug: str, finish_slug: str
) -> FinishDetail:
    result = await session.execute(
        select(models.Finish, models.ItemType)
        .join(models.ItemType)
        .where(
            models.ItemType.kind == kind,
            models.ItemType.slug == type_slug,
            models.Finish.slug == finish_slug,
        )
    )
    found = result.first()
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    finish, item_type = found
    ref = ItemTypeRef(
        slug=item_type.slug,
        name=item_type.name,
        def_index=item_type.def_index,
        kind=kind,
        active=item_type.active,
    )
    return FinishDetail(**finish_out(finish), item_type=ref)


@router.get("/knives")
async def list_knife_types(session: Session) -> list[TypeSummary]:
    """Knife types in display order."""
    return await list_types(session, "knife")


@router.get("/knives/{type_slug}", responses=NOT_FOUND)
async def get_knife_type(type_slug: str, session: Session) -> TypeDetail:
    """One knife type with its finishes in display order."""
    return await get_type(session, "knife", type_slug)


@router.get("/knives/{type_slug}/{finish_slug}", responses=NOT_FOUND)
async def get_knife_finish(type_slug: str, finish_slug: str, session: Session) -> FinishDetail:
    """One knife finish, including one no longer in the game (`active: false`) or whose type
    is not (`item_type.active: false`)."""
    return await get_finish(session, "knife", type_slug, finish_slug)


@router.get("/gloves")
async def list_glove_types(session: Session) -> list[TypeSummary]:
    """Glove types in display order."""
    return await list_types(session, "glove")


@router.get("/gloves/{type_slug}", responses=NOT_FOUND)
async def get_glove_type(type_slug: str, session: Session) -> TypeDetail:
    """One glove type with its finishes in display order."""
    return await get_type(session, "glove", type_slug)


@router.get("/gloves/{type_slug}/{finish_slug}", responses=NOT_FOUND)
async def get_glove_finish(type_slug: str, finish_slug: str, session: Session) -> FinishDetail:
    """One glove finish, including one no longer in the game (`active: false`) or whose type
    is not (`item_type.active: false`)."""
    return await get_finish(session, "glove", type_slug, finish_slug)
