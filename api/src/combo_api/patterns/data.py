"""The committed groups file and its checks against the catalog."""

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog import models
from combo_api.catalog.snapshot import Snapshot
from combo_api.combos.models import SEED_MAX

GROUPS = Path(__file__).with_name("groups.json")

NAME_MAX = 40
SOURCE_TEXT_MAX = 200
URL_MAX = 500

Kind = Literal["knife", "glove"]
GroupSlug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=NAME_MAX)]
CatalogSlug = Annotated[str, Field(min_length=1, max_length=64)]
Seed = Annotated[int, Field(strict=True, ge=0, le=SEED_MAX)]
SourceText = Annotated[str, Field(min_length=1, max_length=SOURCE_TEXT_MAX)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Source(Strict):
    """A guide a group's seeds come from: credited wherever the group is described."""

    title: SourceText
    author: SourceText
    url: Annotated[str, Field(pattern=r"^https://\S+$", max_length=URL_MAX)]
    checked: date


class Group(Strict):
    slug: GroupSlug
    name: Annotated[str, Field(min_length=1, max_length=NAME_MAX)]
    kind: Kind
    finish: CatalogSlug
    # One example seed per item type slug.
    seeds: Annotated[dict[CatalogSlug, Seed], Field(min_length=1)]
    # Empty: the owner's own picks.
    sources: list[Source]


class GroupsFile(Strict):
    groups: list[Group]


class PatternError(Exception):
    """A groups file the import refuses; the message lists every problem."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("\n".join(problems))
        self.problems = problems


def load_groups(path: Path = GROUPS) -> GroupsFile:
    return GroupsFile.model_validate_json(path.read_text())


@dataclass
class Catalog:
    """Finish slugs of each item type, by kind and type slug, and which types are active."""

    finishes: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    active: dict[tuple[str, str], set[str]] = field(default_factory=dict)


def catalog_from_snapshot(snapshot: Snapshot) -> Catalog:
    catalog = Catalog()
    for item_type in snapshot.item_types:
        key = (item_type.kind, item_type.slug)
        catalog.finishes[key] = {f.slug for f in item_type.finishes}
        if not item_type.retired:
            catalog.active[key] = {f.slug for f in item_type.finishes if not f.retired}
    return catalog


async def catalog_from_db(db: AsyncSession) -> Catalog:
    catalog = Catalog()
    rows = await db.execute(
        select(models.ItemType.kind, models.ItemType.slug, models.ItemType.active)
        .add_columns(models.Finish.slug, models.Finish.active)
        .join(models.Finish, models.Finish.item_type_id == models.ItemType.id)
    )
    for kind, type_slug, type_active, finish_slug, finish_active in rows:
        key = (kind, type_slug)
        catalog.finishes.setdefault(key, set()).add(finish_slug)
        if type_active:
            found = catalog.active.setdefault(key, set())
            if finish_active:
                found.add(finish_slug)
    return catalog


def problems_with(groups: GroupsFile, catalog: Catalog) -> list[str]:
    """What is wrong with a groups file against the catalog; empty when nothing is."""
    problems: list[str] = []
    seen: set[str] = set()
    for group in groups.groups:
        if group.slug in seen:
            problems.append(f"{group.slug} appears twice")
        seen.add(group.slug)
        if not any(
            group.finish in finishes
            for (kind, _), finishes in catalog.active.items()
            if kind == group.kind
        ):
            problems.append(
                f"{group.slug}: no active {group.kind} type has the finish {group.finish}"
            )
            continue
        for type_slug in group.seeds:
            finishes = catalog.finishes.get((group.kind, type_slug))
            if finishes is None:
                problems.append(f"{group.slug}: no {group.kind} type {type_slug}")
            elif group.finish not in finishes:
                problems.append(f"{group.slug}: {type_slug} has no {group.finish}")
    return problems


def validate(groups: GroupsFile, catalog: Catalog) -> None:
    problems = problems_with(groups, catalog)
    if problems:
        raise PatternError(problems)
