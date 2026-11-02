"""Load a snapshot into the catalog tables: insert, update in place, deactivate, never delete."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog import models
from combo_api.catalog.snapshot import (
    KINDS,
    CatalogError,
    DisplayOrder,
    Snapshot,
    ordered_finishes,
    ordered_types,
)
from combo_api.catalog.validate import label, validate


@dataclass
class Counts:
    inserted: int = 0
    updated: int = 0
    deactivated: int = 0
    unchanged: int = 0


def apply(row: models.ItemType | models.Finish, values: dict[str, Any], now: datetime) -> bool:
    """Set the values that differ; touch `updated_at` only if something did."""
    changed = False
    for field, value in values.items():
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed = True
    if changed:
        row.updated_at = now
    return changed


def slug_problems(
    snapshot: Snapshot,
    types: dict[int, models.ItemType],
    finishes: dict[tuple[int, int], models.Finish],
) -> list[str]:
    """Slugs never change once stored, and a stored slug is never reused, even if inactive."""
    problems = []
    type_slugs = {(row.kind, row.slug): row for row in types.values()}
    finish_slugs = {(row.item_type_id, row.slug): row for row in finishes.values()}
    for item_type in snapshot.item_types:
        row = types.get(item_type.def_index)
        owner = type_slugs.get((item_type.kind, item_type.slug))
        if row is not None and row.slug != item_type.slug:
            problems.append(
                f"{label(item_type)}: stored slug {row.slug!r} differs from {item_type.slug!r}"
            )
        elif owner is not None and owner is not row:
            problems.append(
                f"{label(item_type)}: slug {item_type.slug!r} is already used by {owner.name}"
            )
        if row is None:
            continue
        for finish in item_type.finishes:
            stored = finishes.get((row.id, finish.paint_index))
            holder = finish_slugs.get((row.id, finish.slug))
            if stored is not None and stored.slug != finish.slug:
                problems.append(
                    f"{label(item_type, finish)}: stored slug {stored.slug!r} "
                    f"differs from {finish.slug!r}"
                )
            elif holder is not None and holder is not stored:
                problems.append(
                    f"{label(item_type, finish)}: slug {finish.slug!r} is already used by "
                    f"{holder.display_name} ({holder.paint_index})"
                )
    return problems


async def import_snapshot(session: AsyncSession, snapshot: Snapshot, order: DisplayOrder) -> Counts:
    """Upsert the snapshot. Raises CatalogError before writing anything if it cannot."""
    validate(snapshot, order)
    types = {row.def_index: row for row in await session.scalars(select(models.ItemType))}
    finishes = {
        (row.item_type_id, row.paint_index): row
        for row in await session.scalars(select(models.Finish))
    }
    problems = slug_problems(snapshot, types, finishes)
    if problems:
        raise CatalogError("\n".join(problems))

    counts = Counts()
    now = datetime.now(UTC)

    def count(changed: bool) -> None:
        if changed:
            counts.updated += 1
        else:
            counts.unchanged += 1

    seen_types: set[int] = set()
    seen_finishes: set[tuple[int, int]] = set()
    for kind in KINDS:
        for position, item_type in enumerate(ordered_types(snapshot, order, kind)):
            values: dict[str, Any] = {
                "kind": item_type.kind,
                "codename": item_type.codename,
                "slug": item_type.slug,
                "name": item_type.name,
                "position": position,
                "active": True,
            }
            row = types.get(item_type.def_index)
            if row is None:
                row = models.ItemType(
                    def_index=item_type.def_index, created_at=now, updated_at=now, **values
                )
                session.add(row)
                await session.flush()
                counts.inserted += 1
            else:
                count(apply(row, values, now))
            seen_types.add(row.id)

            for finish_position, finish in enumerate(ordered_finishes(item_type, order)):
                values = {
                    "paint_codename": finish.paint_codename,
                    "slug": finish.slug,
                    "name": finish.name,
                    "phase": finish.phase,
                    "rarity_code": finish.rarity.code,
                    "rarity_name": finish.rarity.name,
                    "rarity_color": finish.rarity.color,
                    "float_min": finish.float_min,
                    "float_max": finish.float_max,
                    "image_url": finish.image_url,
                    "position": finish_position,
                    "active": True,
                }
                key = (row.id, finish.paint_index)
                seen_finishes.add(key)
                stored = finishes.get(key)
                if stored is None:
                    session.add(
                        models.Finish(
                            item_type_id=row.id,
                            paint_index=finish.paint_index,
                            created_at=now,
                            updated_at=now,
                            **values,
                        )
                    )
                    counts.inserted += 1
                else:
                    count(apply(stored, values, now))

    for type_row in types.values():
        if type_row.id not in seen_types and type_row.active:
            apply(type_row, {"active": False}, now)
            counts.deactivated += 1
    for key, finish_row in finishes.items():
        if key not in seen_finishes and finish_row.active:
            apply(finish_row, {"active": False}, now)
            counts.deactivated += 1
    await session.flush()
    return counts
