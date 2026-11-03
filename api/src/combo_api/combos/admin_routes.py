"""Admin endpoints for combos. Every route depends on `require_admin`."""

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.deps import (
    ADMIN_RESPONSES,
    AdminDep,
    CurrentAdmin,
    Session,
    error_response,
    refuse,
)
from combo_api.catalog.models import Finish
from combo_api.catalog.snapshot import Kind
from combo_api.combos import queries, rules
from combo_api.combos.ids import new_public_id
from combo_api.combos.models import Combo, Status
from combo_api.combos.schemas import (
    AdminCombo,
    Changed,
    ComboIn,
    ComboPage,
    ComboUpdate,
    PublicId,
    PublishRequest,
    Slug,
    UnpublishRequest,
    decimal,
)

logger = logging.getLogger("combo_api.combos")
router = APIRouter(prefix="/admin", tags=["admin"], responses=ADMIN_RESPONSES)

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: error_response("`combo_not_found`")
}


# The statuses a combo can move from, for each status it moves to.
MOVES_TO: dict[Status, set[Status]] = {
    "published": {"draft", "unpublished"},
    "unpublished": {"published"},
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


SlugQuery = Annotated[Slug | None, Query()]


@router.get("/combos")
async def list_combos(
    current: AdminDep,
    db: Session,
    glove_type: SlugQuery = None,
    glove_finish: SlugQuery = None,
    knife_type: SlugQuery = None,
    knife_finish: SlugQuery = None,
    status_filter: Annotated[Status | None, Query(alias="status")] = None,
    sort: Literal["rating", "updated"] = "rating",
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ComboPage:
    """Combos in any status, filtered by glove and knife type and finish (a finish needs its
    type) and status. Sorted by rating, highest first, or by last change, newest first."""
    query = queries.combos()
    problems = rules.Problems()
    sides: list[tuple[Kind, str | None, str | None, Any, Any]] = [
        ("glove", glove_type, glove_finish, queries.GloveType.id, queries.GloveFinish.id),
        ("knife", knife_type, knife_finish, queries.KnifeType.id, queries.KnifeFinish.id),
    ]
    for kind, type_slug, finish_slug, type_column, finish_column in sides:
        filters = await finish_filter(db, kind, type_slug, finish_slug, problems)
        if filters is not None:
            item_type, finish = filters
            query = query.where(type_column == item_type)
            if finish is not None:
                query = query.where(finish_column == finish)
    if problems.errors:
        raise problems.error()
    if status_filter is not None:
        query = query.where(Combo.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    order = (
        (Combo.rating.desc(), Combo.id)
        if sort == "rating"
        else (Combo.updated_at.desc(), Combo.id.desc())
    )
    rows = (await db.execute(query.order_by(*order).limit(limit).offset(offset))).all()
    return ComboPage(total=total or 0, items=[queries.admin_out(row) for row in rows])


async def finish_filter(
    db: AsyncSession,
    kind: Kind,
    type_slug: str | None,
    finish_slug: str | None,
    problems: rules.Problems,
) -> tuple[int, int | None] | None:
    """The type id and finish id a list filter names; retired ones included."""
    if type_slug is None:
        if finish_slug is not None:
            problems.add(
                ("query", f"{kind}_finish"), "value_error", f"Value error, needs {kind}_type"
            )
        return None
    item_type = await rules.find_type(db, kind, type_slug)
    if item_type is None:
        problems.add(("query", f"{kind}_type"), "finish_not_found", f"No {kind} type has this slug")
        return None
    if finish_slug is None:
        return item_type.id, None
    finish = await rules.find_finish(db, item_type, finish_slug)
    if finish is None:
        problems.add(("query", f"{kind}_finish"), "finish_not_found", "No finish of this type")
        return None
    return item_type.id, finish.id


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


async def locked_ids(db: AsyncSession, ids: list[str]) -> list[Combo]:
    """The combos with these ids, locked; 422 naming each unknown id."""
    rows = (await db.scalars(select(Combo).where(Combo.public_id.in_(ids)).with_for_update())).all()
    known = {row.public_id for row in rows}
    problems = rules.Problems()
    for index, public_id in enumerate(ids):
        if public_id not in known:
            problems.add(("body", "ids", index), "combo_not_found", "No combo has this id")
    if problems.errors:
        raise problems.error()
    return list(rows)


async def set_status(
    db: AsyncSession, rows: list[Combo], to: Status, current: CurrentAdmin
) -> list[str]:
    """Move the combos not already in that status; returns their ids. The version stays: it
    counts content changes only."""
    now = clock.now()
    changed = [row for row in rows if row.status in MOVES_TO[to]]
    for row in changed:
        row.status = to
        row.updated_at = now
        row.updated_by = current.id
        if to == "published":
            row.published_at = now
    await db.commit()
    return sorted(row.public_id for row in changed)


@router.post("/combos/publish")
async def publish_combos(request: PublishRequest, current: AdminDep, db: Session) -> Changed:
    """Publish the combos with these ids, or every draft. All of them or none."""
    if request.ids is not None:
        rows = await locked_ids(db, request.ids)
    else:
        query = select(Combo).where(Combo.status == "draft").with_for_update()
        rows = list((await db.scalars(query)).all())
    changed = await set_status(db, rows, "published", current)
    logger.info("combos published admin=%s ids=%s", current.username, ",".join(changed))
    return Changed(changed=len(changed))


@router.post("/combos/unpublish")
async def unpublish_combos(request: UnpublishRequest, current: AdminDep, db: Session) -> Changed:
    """Take published combos off the public pages. All of them or none."""
    rows = await locked_ids(db, request.ids)
    changed = await set_status(db, rows, "unpublished", current)
    logger.info("combos unpublished admin=%s ids=%s", current.username, ",".join(changed))
    return Changed(changed=len(changed))
