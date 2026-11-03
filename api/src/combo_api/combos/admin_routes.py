"""Admin endpoints for combos. Every route depends on `require_admin`."""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.deps import ADMIN_RESPONSES, AdminDep, Session, error_response, refuse
from combo_api.catalog.models import Finish
from combo_api.combos import queries, rules
from combo_api.combos.ids import new_public_id
from combo_api.combos.models import Combo
from combo_api.combos.schemas import AdminCombo, ComboIn, ComboUpdate, PublicId, decimal

logger = logging.getLogger("combo_api.combos")
router = APIRouter(prefix="/admin", tags=["admin"], responses=ADMIN_RESPONSES)

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: error_response("`combo_not_found`")
}


def conflict(codes: str) -> dict[int | str, dict[str, Any]]:
    return {status.HTTP_409_CONFLICT: error_response(codes)}


async def locked(db: AsyncSession, public_id: str) -> Combo:
    """The combo with this id, locked until the transaction ends, or 404."""
    row = await db.scalar(select(Combo).where(Combo.public_id == public_id).with_for_update())
    if row is None:
        raise refuse(status.HTTP_404_NOT_FOUND, "combo_not_found")
    return row


async def load(db: AsyncSession, public_id: str) -> AdminCombo:
    found = await queries.find(db, public_id)
    if found is None:
        raise refuse(status.HTTP_404_NOT_FOUND, "combo_not_found")
    return found


def described(combo: AdminCombo) -> str:
    """A removed combo's content, for the log."""
    sides = " ".join(
        f"{side}={item.type_slug}/{item.finish_slug} {side}_float={item.float_from}-{item.float_to}"
        f" {side}_seeds={item.seeds}"
        for side, item in (("glove", combo.glove), ("knife", combo.knife))
    )
    return f"{sides} rating={combo.rating} description={combo.description!r} status={combo.status}"


@router.post(
    "/combos",
    status_code=status.HTTP_201_CREATED,
    responses=conflict("`combo_exists`"),
)
async def create_combo(combo: ComboIn, current: AdminDep, db: Session) -> AdminCombo:
    """Create a draft combo of one glove finish and one knife finish."""
    problems = rules.Problems()
    glove = await rules.resolve(db, "glove", combo.glove, ("body", "glove"), problems, new=True)
    knife = await rules.resolve(db, "knife", combo.knife, ("body", "knife"), problems, new=True)
    if glove:
        rules.check_conditions(glove[0], combo.glove, ("body", "glove"), problems)
    if knife:
        rules.check_conditions(knife[0], combo.knife, ("body", "knife"), problems)
    if glove is None or knife is None or problems.errors:
        raise problems.error()
    if await pairing_exists(db, glove[0], knife[0]):
        raise refuse(status.HTTP_409_CONFLICT, "combo_exists")
    now = clock.now()
    row = Combo(
        public_id=new_public_id(),
        glove_finish_id=glove[0].id,
        knife_finish_id=knife[0].id,
        **queries.stored("glove", combo.glove),
        **queries.stored("knife", combo.knife),
        rating=decimal(combo.rating),
        description=combo.description,
        status="draft",
        version=1,
        created_at=now,
        updated_at=now,
        created_by=current.id,
        updated_by=current.id,
    )
    db.add(row)
    await db.commit()
    logger.info(
        "combo created admin=%s id=%s glove=%s/%s knife=%s/%s",
        current.username,
        row.public_id,
        combo.glove.type_slug,
        combo.glove.finish_slug,
        combo.knife.type_slug,
        combo.knife.finish_slug,
    )
    return await load(db, row.public_id)


async def pairing_exists(db: AsyncSession, glove: Finish, knife: Finish) -> bool:
    found = await db.scalar(
        select(Combo.id).where(Combo.glove_finish_id == glove.id, Combo.knife_finish_id == knife.id)
    )
    return found is not None


@router.get("/combos/{combo_id}", responses=NOT_FOUND)
async def get_combo(combo_id: PublicId, current: AdminDep, db: Session) -> AdminCombo:
    """One combo, in any status."""
    return await load(db, combo_id)


@router.put(
    "/combos/{combo_id}",
    responses={**NOT_FOUND, **conflict("`version_conflict`")},
)
async def update_combo(
    combo_id: PublicId, change: ComboUpdate, current: AdminDep, db: Session
) -> AdminCombo:
    """Change a combo's rating, description and conditions. `version` is the version the
    change was made from; another version refuses it. The pairing and status do not change."""
    row = await locked(db, combo_id)
    if row.version != change.version:
        raise refuse(status.HTTP_409_CONFLICT, "version_conflict")
    problems = rules.Problems()
    for side, conditions, finish_id in (
        ("glove", change.glove, row.glove_finish_id),
        ("knife", change.knife, row.knife_finish_id),
    ):
        finish = await db.get_one(Finish, finish_id)
        rules.check_conditions(finish, conditions, ("body", side), problems)
    if problems.errors:
        raise problems.error()
    for column, value in {
        **queries.stored("glove", change.glove),
        **queries.stored("knife", change.knife),
        "rating": decimal(change.rating),
        "description": change.description,
        "version": row.version + 1,
        "updated_at": clock.now(),
        "updated_by": current.id,
    }.items():
        setattr(row, column, value)
    await db.commit()
    logger.info("combo updated admin=%s id=%s version=%s", current.username, combo_id, row.version)
    return await load(db, combo_id)


@router.delete(
    "/combos/{combo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **conflict("`version_conflict` or `combo_published`")},
)
async def remove_combo(
    combo_id: PublicId,
    version: Annotated[int, Query(ge=1)],
    current: AdminDep,
    db: Session,
) -> None:
    """Delete a draft or unpublished combo, at the version it was read at. A published combo
    must be unpublished first."""
    row = await locked(db, combo_id)
    if row.version != version:
        raise refuse(status.HTTP_409_CONFLICT, "version_conflict")
    if row.status == "published":
        raise refuse(status.HTTP_409_CONFLICT, "combo_published")
    removed = await load(db, combo_id)
    await db.delete(row)
    await db.commit()
    logger.info("combo removed admin=%s id=%s %s", current.username, combo_id, described(removed))
