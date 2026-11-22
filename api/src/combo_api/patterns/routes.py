"""The admin route that lists pattern groups. It depends on `require_admin`."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from combo_api.admins.deps import ADMIN_RESPONSES, AdminDep, Session
from combo_api.patterns.models import PatternGroup, PatternGroupSeed

router = APIRouter(prefix="/admin", tags=["admin"], responses=ADMIN_RESPONSES)


class PatternSource(BaseModel):
    title: str
    author: str
    url: str
    checked: str


class PatternGroupOut(BaseModel):
    slug: str
    name: str
    kind: str
    finish_slug: str
    # The example seed for each item type the group exists on, by type slug.
    seeds: dict[str, int]
    # Empty: the owner's own picks.
    sources: list[PatternSource]


def source_out(source: dict[str, Any]) -> PatternSource:
    return PatternSource.model_validate(source)


@router.get("/pattern-groups")
async def list_pattern_groups(current: AdminDep, db: Session) -> list[PatternGroupOut]:
    """Every pattern group, in the groups file's order, with its seeds and sources."""
    groups = list(await db.scalars(select(PatternGroup).order_by(PatternGroup.position)))
    seeds: dict[int, dict[str, int]] = {}
    for row in await db.scalars(select(PatternGroupSeed).order_by(PatternGroupSeed.type_slug)):
        seeds.setdefault(row.group_id, {})[row.type_slug] = row.seed
    return [
        PatternGroupOut(
            slug=group.slug,
            name=group.name,
            kind=group.kind,
            finish_slug=group.finish_slug,
            seeds=seeds.get(group.id, {}),
            sources=[source_out(source) for source in group.sources],
        )
        for group in groups
    ]
