from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog import models
from combo_api.catalog.importer import Counts, import_snapshot
from combo_api.catalog.snapshot import (
    CatalogError,
    DisplayOrder,
    Finish,
    Snapshot,
    load_display_order,
    load_snapshot,
)

pytestmark = pytest.mark.anyio

SNAPSHOT = load_snapshot()
ORDER = load_display_order()
ROWS = 28 + 670
IMAGE = "https://community.akamai.steamstatic.com/economy/image/changed"


def with_karambit(
    snapshot: Snapshot,
    drop: int | None = None,
    add: Finish | None = None,
    changes: dict[int, dict[str, Any]] | None = None,
) -> Snapshot:
    """The snapshot with Karambit finishes dropped, changed (keyed by paint index) or added."""
    types = []
    for item_type in snapshot.item_types:
        if item_type.slug == "karambit" and item_type.kind == "knife":
            finishes = [
                f.model_copy(update=(changes or {}).get(f.paint_index, {}))
                for f in item_type.finishes
                if f.paint_index != drop
            ]
            extra = [add] if add else []
            item_type = item_type.model_copy(update={"finishes": (*finishes, *extra)})
        types.append(item_type)
    return snapshot.model_copy(update={"item_types": tuple(types)})


def order_for(snapshot: Snapshot) -> DisplayOrder:
    """The committed display order without finishes the snapshot no longer has."""
    slugs = {f"{t.kind}/{t.slug}": {f.slug for f in t.finishes} for t in snapshot.item_types}
    finishes = {
        key: tuple(s for s in listed if s in slugs[key]) for key, listed in ORDER.finishes.items()
    }
    return ORDER.model_copy(update={"finishes": finishes})


def new_finish(slug: str = "test-finish") -> Finish:
    fade = next(
        f
        for t in SNAPSHOT.item_types
        if t.slug == "karambit"
        for f in t.finishes
        if f.paint_index == 38
    )
    return fade.model_copy(
        update={"paint_index": 9999, "paint_codename": "test", "slug": slug, "name": "Test Finish"}
    )


async def karambit_finishes(session: AsyncSession) -> dict[int, tuple[Any, ...]]:
    rows = await session.execute(
        select(
            models.Finish.paint_index,
            models.Finish.id,
            models.Finish.slug,
            models.Finish.image_url,
            models.Finish.active,
        )
        .join(models.ItemType)
        .where(models.ItemType.slug == "karambit")
    )
    return {row[0]: tuple(row[1:]) for row in rows}


async def all_rows(session: AsyncSession) -> set[tuple[Any, ...]]:
    types = await session.execute(
        select(models.ItemType.id, models.ItemType.slug, models.ItemType.updated_at)
    )
    finishes = await session.execute(
        select(models.Finish.id, models.Finish.slug, models.Finish.updated_at)
    )
    return {("type", *row) for row in types} | {("finish", *row) for row in finishes}


async def test_import_into_empty_catalog(db_session: AsyncSession) -> None:
    assert await db_session.scalar(select(func.count()).select_from(models.Finish)) == 0
    counts = await import_snapshot(db_session, SNAPSHOT, ORDER)
    assert counts == Counts(inserted=ROWS)
    kinds = await db_session.execute(
        select(models.ItemType.kind, func.count()).group_by(models.ItemType.kind)
    )
    assert {kind: n for kind, n in kinds} == {"knife": 20, "glove": 8}
    finishes = await db_session.execute(
        select(models.ItemType.kind, func.count())
        .join(models.Finish)
        .group_by(models.ItemType.kind)
    )
    assert {kind: n for kind, n in finishes} == {"knife": 576, "glove": 94}


async def test_second_import_changes_nothing(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await all_rows(db_session)
    counts = await import_snapshot(db_session, SNAPSHOT, ORDER)
    assert counts == Counts(unchanged=ROWS)
    assert await all_rows(db_session) == before


async def test_newer_snapshot_updates_in_place_and_never_deletes(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await karambit_finishes(db_session)

    newer = with_karambit(SNAPSHOT, drop=38, add=new_finish(), changes={419: {"image_url": IMAGE}})
    counts = await import_snapshot(db_session, newer, order_for(newer))
    after = await karambit_finishes(db_session)
    assert counts.inserted == 1
    assert counts.deactivated == 1
    assert counts.updated >= 1
    assert after[38] == (*before[38][:3], False)
    assert after[419] == (before[419][0], "doppler-phase-2", IMAGE, True)
    assert after[9999][1:] == ("test-finish", before[38][2], True)
    assert set(after) == {*before, 9999}

    await import_snapshot(db_session, SNAPSHOT, ORDER)
    again = await karambit_finishes(db_session)
    assert again[38] == before[38]
    assert again[419] == before[419]


async def test_stored_slug_never_changes(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await all_rows(db_session)
    renamed = with_karambit(SNAPSHOT, changes={419: {"slug": "doppler-p2"}})
    with pytest.raises(CatalogError) as error:
        await import_snapshot(db_session, renamed, order_for(renamed))
    assert "Karambit | Doppler (Phase 2) (507:419): stored slug 'doppler-phase-2'" in str(
        error.value
    )
    assert await all_rows(db_session) == before


async def test_inactive_slug_is_never_reused(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    without_fade = with_karambit(SNAPSHOT, drop=38)
    await import_snapshot(db_session, without_fade, order_for(without_fade))
    before = await all_rows(db_session)
    reused = with_karambit(SNAPSHOT, drop=38, add=new_finish(slug="fade"))
    with pytest.raises(CatalogError) as error:
        await import_snapshot(db_session, reused, order_for(without_fade))
    assert "slug 'fade' is already used by Fade (38)" in str(error.value)
    assert await all_rows(db_session) == before
