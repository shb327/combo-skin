"""Batches: one glove finish with one knife finish name across knife types."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.deps import CurrentAdmin, refuse
from combo_api.catalog.models import Finish, ItemType
from combo_api.combos import order, queries, rules
from combo_api.combos.models import Combo
from combo_api.combos.schemas import BatchCreate, BatchFinish, BatchIn, BatchUpdate, decimal


def display_name(name: str, phase: str | None) -> str:
    return f"{name} ({phase})" if phase else name


async def finish_names(db: AsyncSession) -> list[BatchFinish]:
    """Every active knife finish name, with the number of active knife types that have it."""
    rows = await db.execute(
        select(Finish.slug, Finish.name, Finish.phase, func.count(Finish.item_type_id.distinct()))
        .join(ItemType)
        .where(ItemType.kind == "knife", ItemType.active, Finish.active)
        .group_by(Finish.slug, Finish.name, Finish.phase)
    )
    finishes = [
        BatchFinish(slug=slug, display_name=display_name(name, phase), knife_types=count)
        for slug, name, phase, count in rows
    ]
    return sorted(finishes, key=lambda f: (f.display_name, f.slug))


async def knife_finishes(db: AsyncSession, slug: str) -> list[tuple[Finish, ItemType]]:
    """The active finishes with this slug, of active knife types, in knife order."""
    types = await order.knife_types(db)
    finishes = (
        await db.scalars(
            select(Finish).where(
                Finish.slug == slug, Finish.active, Finish.item_type_id.in_([t.id for t in types])
            )
        )
    ).all()
    by_type = {finish.item_type_id: finish for finish in finishes}
    return [(by_type[t.id], t) for t in types if t.id in by_type]


async def existing(db: AsyncSession, glove: Finish, knives: list[Finish]) -> dict[int, Combo]:
    """The combos of these gloves with these knife finishes, by knife finish id."""
    rows = await db.scalars(
        select(Combo).where(
            Combo.glove_finish_id == glove.id,
            Combo.knife_finish_id.in_([knife.id for knife in knives]),
        )
    )
    return {row.knife_finish_id: row for row in rows}


async def save(
    db: AsyncSession, batch: BatchIn, current: CurrentAdmin
) -> tuple[list[str], list[str]]:
    """Check the whole batch, then write it: the ids created and updated, in request order.
    Nothing is written if any item is refused."""
    problems = rules.Problems()
    # A retired glove finish refuses new combos only: its existing ones can still be updated.
    glove = await rules.resolve(
        db, "glove", batch.glove, ("body", "glove"), problems, new=bool(batch.create)
    )
    glove_finish = glove[0] if glove else None
    knife_types: set[int] = set()

    creates: list[tuple[BatchCreate, Finish, int | None]] = []
    for index, entry in enumerate(batch.create):
        loc: rules.Loc = ("body", "create", index)
        knife_type = await rules.find_type(db, "knife", entry.knife_type)
        finish = (
            None
            if knife_type is None
            else (await rules.find_finish(db, knife_type, batch.knife_finish))
        )
        if knife_type is None or finish is None:
            problems.add((*loc, "knife_type"), "finish_not_found", "No such knife finish")
            continue
        if knife_type.id in knife_types:
            problems.add((*loc, "knife_type"), "duplicate_knife_type", "Knife type repeated")
            continue
        knife_types.add(knife_type.id)
        if not (finish.active and knife_type.active):
            problems.add(loc, "finish_retired", "This finish is no longer in the game")
        if glove_finish is not None:
            rules.check_conditions(glove_finish, entry.glove, (*loc, "glove"), problems)
        rules.check_conditions(finish, entry.knife, (*loc, "knife"), problems)
        agent = await rules.agent_id(
            db, entry.screenshot_agent, (*loc, "screenshot_agent"), problems
        )
        creates.append((entry, finish, agent))

    updates: list[tuple[BatchUpdate, Combo]] = []
    rows = await queries.lock(db, [change.id for change in batch.update])
    for index, change in enumerate(batch.update):
        id_loc: rules.Loc = ("body", "update", index, "id")
        row = rows.get(change.id)
        if row is None:
            problems.add(id_loc, "combo_not_found", "No combo has this id")
            continue
        knife = await db.get_one(Finish, row.knife_finish_id)
        if glove_finish is not None and (
            row.glove_finish_id != glove_finish.id or knife.slug != batch.knife_finish
        ):
            problems.add(id_loc, "combo_not_in_batch", "This combo is not of this batch")
            continue
        if knife.item_type_id in knife_types:
            problems.add(id_loc, "duplicate_knife_type", "Knife type repeated")
            continue
        knife_types.add(knife.item_type_id)
        updates.append((change, row))

    if glove_finish is None or problems.errors:
        raise problems.error()
    if any(row.version != change.version for change, row in updates):
        raise refuse(409, "version_conflict")
    for _, finish, _ in creates:
        if await queries.pairing_exists(db, glove_finish, finish):
            raise refuse(409, "combo_exists")

    now = clock.now()
    created = [
        queries.new_combo(
            glove_finish,
            finish,
            entry.glove,
            entry.knife,
            entry.rating,
            entry.description,
            agent,
            current.id,
            now,
        )
        for entry, finish, agent in creates
    ]
    await queries.insert(db, created)
    for change, row in updates:
        row.rating = decimal(change.rating)
        row.description = change.description
        row.version += 1
        row.updated_at = now
        row.updated_by = current.id
    await db.commit()
    return [row.public_id for row in created], [row.public_id for _, row in updates]
