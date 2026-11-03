"""Checks of combo input against the catalog. Problems are reported as 422 errors in FastAPI's
format, with the location of the offending field."""

from typing import Any

from fastapi.exceptions import RequestValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.models import Finish, ItemType
from combo_api.catalog.snapshot import Kind
from combo_api.combos.schemas import Conditions, FinishRef, decimal

Loc = tuple[str | int, ...]


class Problems:
    def __init__(self) -> None:
        self.errors: list[dict[str, Any]] = []

    def add(self, loc: Loc, code: str, message: str) -> None:
        self.errors.append({"loc": loc, "msg": message, "type": code})

    def error(self) -> RequestValidationError:
        return RequestValidationError(self.errors)


async def find_type(db: AsyncSession, kind: Kind, slug: str) -> ItemType | None:
    return await db.scalar(select(ItemType).where(ItemType.kind == kind, ItemType.slug == slug))


async def find_finish(db: AsyncSession, item_type: ItemType, slug: str) -> Finish | None:
    return await db.scalar(
        select(Finish).where(Finish.item_type_id == item_type.id, Finish.slug == slug)
    )


async def resolve(
    db: AsyncSession, kind: Kind, ref: FinishRef, loc: Loc, problems: Problems, *, new: bool
) -> tuple[Finish, ItemType] | None:
    """The finish a request names, or None with a problem added. A new combo may not use a
    retired finish, or a finish of a retired type."""
    item_type = await find_type(db, kind, ref.type_slug)
    if item_type is None:
        problems.add((*loc, "type_slug"), "finish_not_found", f"No {kind} type has this slug")
        return None
    finish = await find_finish(db, item_type, ref.finish_slug)
    if finish is None:
        problems.add((*loc, "finish_slug"), "finish_not_found", "No finish of this type")
        return None
    if new and not (finish.active and item_type.active):
        problems.add(loc, "finish_retired", "This finish is no longer in the game")
    return finish, item_type


def check_conditions(finish: Finish, conditions: Conditions, loc: Loc, problems: Problems) -> None:
    """A float range inside the finish's own range; no range or seeds without one (Vanilla)."""
    if finish.float_min is None or finish.float_max is None:
        if conditions.float_from is not None:
            problems.add((*loc, "float_from"), "finish_has_no_float", "This finish has no float")
        if conditions.seeds:
            problems.add((*loc, "seeds"), "finish_has_no_pattern", "This finish has no pattern")
        return
    low, high = decimal(finish.float_min), decimal(finish.float_max)
    message = f"Outside the finish's float range, {low} to {high}"
    if conditions.float_from is not None and decimal(conditions.float_from) < low:
        problems.add((*loc, "float_from"), "float_outside_finish", message)
    if conditions.float_to is not None and decimal(conditions.float_to) > high:
        problems.add((*loc, "float_to"), "float_outside_finish", message)
