"""Load the groups file into the database. Groups are frozen once imported (spec 020): the
import adds groups, adds seeds for item types a group did not cover yet and updates sources, and
refuses a file that changes or leaves out anything already imported."""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.patterns.data import (
    Catalog,
    Group,
    GroupsFile,
    PatternError,
    catalog_from_db,
    problems_with,
)
from combo_api.patterns.models import PatternGroup, PatternGroupSeed


@dataclass
class Counts:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0


def sources_of(group: Group) -> list[dict[str, Any]]:
    return [source.model_dump(mode="json") for source in group.sources]


def frozen_changes(
    group: Group | None, row: PatternGroup, seeds: dict[str, int], slug: str
) -> list[str]:
    """What a file changes in an imported group; empty when it only adds."""
    if group is None:
        return [f"{slug}: removed from the file"]
    changes = [
        f"{slug}: {label} changed from {before!r} to {after!r}"
        for label, before, after in (
            ("name", row.name, group.name),
            ("kind", row.kind, group.kind),
            ("finish", row.finish_slug, group.finish),
        )
        if before != after
    ]
    for type_slug, seed in sorted(seeds.items()):
        if type_slug not in group.seeds:
            changes.append(f"{slug}: {type_slug}'s seed {seed} removed")
        elif group.seeds[type_slug] != seed:
            changes.append(
                f"{slug}: {type_slug}'s seed changed from {seed} to {group.seeds[type_slug]}"
            )
    return changes


async def import_groups(
    db: AsyncSession, groups: GroupsFile, catalog: Catalog | None = None, *, check: bool = False
) -> Counts:
    """Check the file against the catalog and the imported groups, then write it, unless `check`.
    Nothing is written when anything is refused. The caller commits."""
    problems = problems_with(groups, catalog or await catalog_from_db(db))
    rows = {row.slug: row for row in await db.scalars(select(PatternGroup))}
    seeds: dict[int, dict[str, int]] = {}
    for seed in await db.scalars(select(PatternGroupSeed)):
        seeds.setdefault(seed.group_id, {})[seed.type_slug] = seed.seed
    by_slug = {group.slug: group for group in groups.groups}
    for slug, row in sorted(rows.items()):
        problems += frozen_changes(by_slug.get(slug), row, seeds.get(row.id, {}), slug)
    if problems:
        raise PatternError(problems)

    counts = Counts()
    now = clock.now()
    for position, group in enumerate(groups.groups, start=1):
        existing = rows.get(group.slug)
        if existing is None:
            counts.inserted += 1
            if check:
                continue
            row = PatternGroup(
                slug=group.slug,
                name=group.name,
                kind=group.kind,
                finish_slug=group.finish,
                position=position,
                sources=sources_of(group),
                updated_at=now,
            )
            db.add(row)
            await db.flush()
            db.add_all(
                PatternGroupSeed(group_id=row.id, type_slug=t, seed=s)
                for t, s in group.seeds.items()
            )
            continue
        row = existing
        stored = seeds.get(row.id, {})
        added = {t: s for t, s in group.seeds.items() if t not in stored}
        changed = added or row.sources != sources_of(group) or row.position != position
        if not changed:
            counts.unchanged += 1
            continue
        counts.updated += 1
        if check:
            continue
        db.add_all(PatternGroupSeed(group_id=row.id, type_slug=t, seed=s) for t, s in added.items())
        row.sources = sources_of(group)
        row.position = position
        row.updated_at = now
    await db.flush()
    return counts
