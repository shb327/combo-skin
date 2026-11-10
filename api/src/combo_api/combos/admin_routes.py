"""Admin endpoints for combos. Every route depends on `require_admin`."""

import logging
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request, status
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
from combo_api.combos import batches, order, queries, rules
from combo_api.combos.models import Combo, Status
from combo_api.combos.schemas import (
    AdminCombo,
    BatchFinish,
    BatchIn,
    BatchSaved,
    Candidate,
    Candidates,
    Changed,
    ComboIn,
    ComboPage,
    ComboUpdate,
    Existing,
    KnifeFinishName,
    KnifeOrderIn,
    KnifeOrderOut,
    KnifeTypeName,
    PublicId,
    PublishRequest,
    Slug,
    UnpublishRequest,
    decimal,
)
from combo_api.screenshots.models import ComboScreenshot
from combo_api.screenshots.objects import delete_objects, objects_of
from combo_api.screenshots.shapes import ImageBase

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


async def load(db: AsyncSession, public_id: str, base_url: str) -> AdminCombo:
    found = await queries.find(db, public_id, base_url)
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
async def create_combo(
    combo: ComboIn, current: AdminDep, db: Session, images: ImageBase
) -> AdminCombo:
    """Create a draft combo of one glove finish and one knife finish."""
    problems = rules.Problems()
    glove = await rules.resolve(db, "glove", combo.glove, ("body", "glove"), problems, new=True)
    knife = await rules.resolve(db, "knife", combo.knife, ("body", "knife"), problems, new=True)
    if glove:
        rules.check_conditions(glove[0], combo.glove, ("body", "glove"), problems)
    if knife:
        rules.check_conditions(knife[0], combo.knife, ("body", "knife"), problems)
    agent = await rules.agent_id(db, combo.screenshot_agent, ("body", "screenshot_agent"), problems)
    if glove is None or knife is None or problems.errors:
        raise problems.error()
    if await queries.pairing_exists(db, glove[0], knife[0]):
        raise refuse(status.HTTP_409_CONFLICT, "combo_exists")
    row = queries.new_combo(
        glove[0],
        knife[0],
        combo.glove,
        combo.knife,
        combo.rating,
        combo.description,
        agent,
        current.id,
        clock.now(),
    )
    await queries.insert(db, [row])
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
    return await load(db, row.public_id, images)


SlugQuery = Annotated[Slug | None, Query()]
# Far beyond any real catalog of combos; keeps the value inside the database's integer range.
OFFSET_MAX = 1_000_000


@router.get("/combos")
async def list_combos(
    current: AdminDep,
    db: Session,
    images: ImageBase,
    glove_type: SlugQuery = None,
    glove_finish: SlugQuery = None,
    knife_type: SlugQuery = None,
    knife_finish: SlugQuery = None,
    status_filter: Annotated[Status | None, Query(alias="status")] = None,
    sort: Literal["rating", "updated"] = "rating",
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0, le=OFFSET_MAX)] = 0,
) -> ComboPage:
    """Combos in any status, filtered by glove and knife type and finish (a finish needs its
    type) and status. Sorted by rating, highest first, or by last change, newest first."""
    query = queries.admin_combos()
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
    return ComboPage(total=total or 0, items=[queries.admin_out(row, images) for row in rows])


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
async def get_combo(
    combo_id: PublicId, current: AdminDep, db: Session, images: ImageBase
) -> AdminCombo:
    """One combo, in any status."""
    return await load(db, combo_id, images)


@router.put(
    "/combos/{combo_id}",
    responses={**NOT_FOUND, **conflict("`version_conflict`")},
)
async def update_combo(
    combo_id: PublicId, change: ComboUpdate, current: AdminDep, db: Session, images: ImageBase
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
    agent = await rules.agent_id(
        db,
        change.screenshot_agent,
        ("body", "screenshot_agent"),
        problems,
        keep=row.screenshot_agent_id,
    )
    if problems.errors:
        raise problems.error()
    for column, value in {
        **queries.stored("glove", change.glove),
        **queries.stored("knife", change.knife),
        "rating": decimal(change.rating),
        "description": change.description,
        "screenshot_agent_id": agent,
        "version": row.version + 1,
        "updated_at": clock.now(),
        "updated_by": current.id,
    }.items():
        setattr(row, column, value)
    await db.commit()
    logger.info("combo updated admin=%s id=%s version=%s", current.username, combo_id, row.version)
    return await load(db, combo_id, images)


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
    images: ImageBase,
    request: Request,
) -> None:
    """Delete a draft or unpublished combo, at the version it was read at, and its
    screenshot. A published combo must be unpublished first."""
    row = await locked(db, combo_id)
    if row.version != version:
        raise refuse(status.HTTP_409_CONFLICT, "version_conflict")
    if row.status == "published":
        raise refuse(status.HTTP_409_CONFLICT, "combo_published")
    removed = await load(db, combo_id, images)
    shot = await db.get(ComboScreenshot, row.id)
    objects = objects_of(combo_id, shot) if shot else []
    await db.delete(row)
    await db.commit()
    logger.info("combo removed admin=%s id=%s %s", current.username, combo_id, described(removed))
    await delete_objects(request.app.state.storage, objects)


async def locked_ids(db: AsyncSession, ids: list[str]) -> list[Combo]:
    """The combos with these ids, locked in id order; 422 naming each unknown id."""
    rows = await queries.lock(db, ids)
    known = set(rows)
    problems = rules.Problems()
    for index, public_id in enumerate(ids):
        if public_id not in known:
            problems.add(("body", "ids", index), "combo_not_found", "No combo has this id")
    if problems.errors:
        raise problems.error()
    return list(rows.values())


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
        query = select(Combo).where(Combo.status == "draft").order_by(Combo.id).with_for_update()
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


@router.get("/batches/finishes")
async def list_batch_finishes(current: AdminDep, db: Session) -> list[BatchFinish]:
    """The knife finish names a batch can use, by display name."""
    return await batches.finish_names(db)


@router.get("/batches/candidates")
async def get_batch_candidates(
    current: AdminDep, db: Session, glove_type: Slug, glove_finish: Slug, knife_finish: Slug
) -> Candidates:
    """For a glove finish and a knife finish name: every active knife type with that finish,
    in knife order, with the combo it already has with these gloves, if any."""
    problems = rules.Problems()
    item_type = await rules.find_type(db, "glove", glove_type)
    if item_type is None:
        problems.add(("query", "glove_type"), "finish_not_found", "No glove type has this slug")
        raise problems.error()
    finish = await rules.find_finish(db, item_type, glove_finish)
    if finish is None:
        problems.add(("query", "glove_finish"), "finish_not_found", "No finish of this type")
        raise problems.error()
    if not (finish.active and item_type.active):
        problems.add(("query", "glove_finish"), "finish_retired", "No longer in the game")
        raise problems.error()
    knives = await batches.knife_finishes(db, knife_finish)
    combos = await batches.existing(db, finish, [knife for knife, _ in knives])
    return Candidates(
        glove=queries.item(finish, item_type),
        knife_finish=KnifeFinishName(
            slug=knife_finish,
            display_name=knives[0][0].display_name if knives else None,
        ),
        candidates=[
            Candidate(
                knife=queries.item(knife, knife_type),
                existing=existing_out(combos.get(knife.id)),
            )
            for knife, knife_type in knives
        ],
    )


def existing_out(row: Combo | None) -> Existing | None:
    if row is None:
        return None
    return Existing(
        id=row.public_id,
        status=row.status,
        version=row.version,
        rating=float(row.rating),
        description=row.description,
    )


@router.post("/batches", responses=conflict("`version_conflict` or `combo_exists`"))
async def save_batch(
    batch: BatchIn, current: AdminDep, db: Session, images: ImageBase
) -> BatchSaved:
    """Save a batch in one request: all of it, or nothing."""
    created, updated = await batches.save(db, batch, current)
    logger.info(
        "batch saved admin=%s glove=%s/%s knife_finish=%s created=%s updated=%s",
        current.username,
        batch.glove.type_slug,
        batch.glove.finish_slug,
        batch.knife_finish,
        ",".join(created),
        ",".join(updated),
    )
    return BatchSaved(
        created=[await load(db, public_id, images) for public_id in created],
        updated=[await load(db, public_id, images) for public_id in updated],
    )


async def knife_order_out(db: AsyncSession) -> KnifeOrderOut:
    return KnifeOrderOut(
        knife_types=[KnifeTypeName(slug=t.slug, name=t.name) for t in await order.knife_types(db)]
    )


@router.get("/knife-order")
async def get_knife_order(current: AdminDep, db: Session) -> KnifeOrderOut:
    """Active knife types in the order batches follow."""
    return await knife_order_out(db)


@router.put("/knife-order")
async def replace_knife_order(
    new_order: KnifeOrderIn, current: AdminDep, db: Session
) -> KnifeOrderOut:
    """Replace the knife order. The list must name every active knife type exactly once."""
    if not await order.replace(db, new_order.slugs):
        problems = rules.Problems()
        problems.add(
            ("body", "slugs"),
            "knife_order_mismatch",
            "List every active knife type exactly once",
        )
        raise problems.error()
    logger.info(
        "knife order replaced admin=%s slugs=%s", current.username, ",".join(new_order.slugs)
    )
    return await knife_order_out(db)
