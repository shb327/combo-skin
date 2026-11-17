"""Importing groups: inserts and additions only; frozen once imported."""

from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.patterns.data import PatternError
from combo_api.patterns.importer import import_groups
from combo_api.patterns.models import PatternGroup, PatternGroupSeed
from tests.patterns.support import SOURCE, group, groups_file


async def stored(db: AsyncSession) -> dict[str, dict[str, int]]:
    rows = await db.execute(
        select(PatternGroup.slug, PatternGroupSeed.type_slug, PatternGroupSeed.seed).join(
            PatternGroupSeed
        )
    )
    found: dict[str, dict[str, int]] = {}
    for slug, type_slug, seed in rows:
        found.setdefault(slug, {})[type_slug] = seed
    return found


async def count(db: AsyncSession) -> int:
    return await db.scalar(select(func.count()).select_from(PatternGroup)) or 0


@pytest.mark.anyio
async def test_import_inserts_and_is_safe_to_run_again(catalog: AsyncSession) -> None:
    counts = await import_groups(catalog, groups_file())
    assert (counts.inserted, counts.updated, counts.unchanged) == (1, 0, 0)
    assert await stored(catalog) == {"blue-gem": {"karambit": 387, "m9-bayonet": 601}}
    row = await catalog.scalar(select(PatternGroup))
    assert row is not None
    first = row.updated_at
    again = await import_groups(catalog, groups_file())
    assert (again.inserted, again.updated, again.unchanged) == (0, 0, 1)
    await catalog.refresh(row)
    assert row.updated_at == first


@pytest.mark.anyio
async def test_additions_are_imported(catalog: AsyncSession) -> None:
    await import_groups(catalog, groups_file())
    row = await catalog.scalar(select(PatternGroup))
    assert row is not None
    first = row.updated_at
    seeds = {"karambit": 387, "m9-bayonet": 601, "bayonet": 555}
    changed = {**SOURCE, "url": "https://example.com/moved", "checked": "2026-12-01"}
    counts = await import_groups(
        catalog,
        groups_file(group(seeds=seeds, sources=[changed]), group("gold-gem", name="Gold Gem")),
    )
    assert (counts.inserted, counts.updated) == (1, 1)
    assert (await stored(catalog))["blue-gem"] == seeds
    await catalog.refresh(row)
    assert row.sources == [changed]
    assert row.updated_at > first
    assert await count(catalog) == 2


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("changed", "frozen"),
    [
        (group(name="Blue Gems"), "name"),
        (group(finish="fade", seeds={"karambit": 387, "m9-bayonet": 601}), "finish"),
        (group(seeds={"karambit": 388, "m9-bayonet": 601}), "karambit's seed"),
        (group(seeds={"karambit": 387}), "m9-bayonet's seed"),
        (group("gold-gem", name="Gold Gem"), "removed"),
    ],
)
async def test_imported_groups_are_frozen(
    catalog: AsyncSession, changed: dict[str, Any], frozen: str
) -> None:
    await import_groups(catalog, groups_file())
    before = await stored(catalog)
    with pytest.raises(PatternError) as refused:
        await import_groups(catalog, groups_file(changed))
    assert "blue-gem" in str(refused.value)
    assert frozen in str(refused.value)
    assert await stored(catalog) == before
    assert await count(catalog) == 1


@pytest.mark.anyio
async def test_a_refused_file_writes_nothing(catalog: AsyncSession) -> None:
    with pytest.raises(PatternError):
        await import_groups(catalog, groups_file(group(), group("bad", finish="no-such")))
    assert await count(catalog) == 0


@pytest.mark.anyio
async def test_check_writes_nothing(catalog: AsyncSession) -> None:
    counts = await import_groups(catalog, groups_file(), check=True)
    assert counts.inserted == 1
    assert await count(catalog) == 0
