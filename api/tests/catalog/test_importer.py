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
from tests.catalog.test_snapshot import with_retired

pytestmark = pytest.mark.anyio

SNAPSHOT = load_snapshot()
ORDER = load_display_order()
AGENTS = 63
ROWS = 28 + 670 + AGENTS
ORDER_NO_KUKRI = ORDER.model_copy(
    update={
        "types": {**ORDER.types, "knife": tuple(s for s in ORDER.types["knife"] if s != "kukri")},
        "finishes": {k: v for k, v in ORDER.finishes.items() if k != "knife/kukri"},
    }
)
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
    agents = await session.execute(
        select(models.Agent.id, models.Agent.def_index, models.Agent.updated_at)
    )
    return (
        {("type", *row) for row in types}
        | {("finish", *row) for row in finishes}
        | {("agent", *row) for row in agents}
    )


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
    teams = await db_session.execute(
        select(models.Agent.team, func.count()).group_by(models.Agent.team)
    )
    assert {team: n for team, n in teams} == {"ct": 29, "t": 34}


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
    assert await db_session.scalar(select(func.count()).select_from(models.Finish)) == 671
    assert await db_session.scalar(select(func.count()).select_from(models.ItemType)) == 28

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
    message = str(error.value)
    assert "Karambit | Test Finish (507:9999): slug 'fade' is already used by Fade (38)" in message
    assert await all_rows(db_session) == before


async def rows_by_key(session: AsyncSession) -> dict[tuple[int, int | None], tuple[Any, ...]]:
    """(def_index, paint_index or None for the type) -> (id, slug, position, active)."""
    types = {row.id: row.def_index for row in await session.scalars(select(models.ItemType))}
    result: dict[tuple[int, int | None], tuple[Any, ...]] = {}
    for row in await session.scalars(select(models.ItemType)):
        result[(row.def_index, None)] = (row.id, row.slug, row.position, row.active)
    for finish in await session.scalars(select(models.Finish)):
        key = (types[finish.item_type_id], finish.paint_index)
        result[key] = (finish.id, finish.slug, finish.position, finish.active)
    return result


async def test_retired_entries_without_rows_are_inserted_inactive(db_session: AsyncSession) -> None:
    counts = await import_snapshot(db_session, with_retired(SNAPSHOT), ORDER)
    rows = await rows_by_key(db_session)
    assert counts.inserted == ROWS
    assert rows[(507, 38)][1:] == ("fade", 34, False)
    assert rows[(523, None)][3] is False
    assert not any(row[3] for key, row in rows.items() if key[0] == 523)
    assert rows[(507, 419)][3] is True


async def test_retiring_and_returning_keep_ids(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await rows_by_key(db_session)
    counts = await import_snapshot(db_session, with_retired(SNAPSHOT), ORDER)
    retired = await rows_by_key(db_session)
    assert counts.deactivated == 1 + 1 + 25
    assert counts.inserted == 0
    assert retired[(507, 38)] == (*before[(507, 38)][:3], False)
    assert retired[(523, None)] == (*before[(523, None)][:3], False)
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    assert await rows_by_key(db_session) == before


async def test_reused_codename_is_refused(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await all_rows(db_session)
    kukri = next(t for t in SNAPSHOT.item_types if t.slug == "kukri")
    moved = kukri.model_copy(update={"def_index": 9999, "slug": "kukri-2", "name": "Kukri II"})
    types = (*(t for t in SNAPSHOT.item_types if t.slug != "kukri"), moved)
    with pytest.raises(CatalogError) as error:
        await import_snapshot(
            db_session, SNAPSHOT.model_copy(update={"item_types": types}), ORDER_NO_KUKRI
        )
    message = str(error.value)
    assert "Kukri II (9999)" in message
    assert "Kukri Knife (526)" in message
    assert "weapon_knife_kukri" in message
    assert await all_rows(db_session) == before


async def test_every_entry_matches_its_row(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    types = {row.def_index: row for row in await db_session.scalars(select(models.ItemType))}
    finishes = {
        (row.item_type_id, row.paint_index): row
        for row in await db_session.scalars(select(models.Finish))
    }
    assert len(types) == len(SNAPSHOT.item_types)
    assert len(finishes) == sum(len(t.finishes) for t in SNAPSHOT.item_types)
    for item_type in SNAPSHOT.item_types:
        row = types[item_type.def_index]
        assert (row.kind, row.codename, row.slug, row.name, row.active) == (
            item_type.kind,
            item_type.codename,
            item_type.slug,
            item_type.name,
            not item_type.retired,
        )
        for finish in item_type.finishes:
            stored = finishes[(row.id, finish.paint_index)]
            assert (
                stored.paint_codename,
                stored.slug,
                stored.name,
                stored.phase,
                stored.rarity_code,
                stored.rarity_name,
                stored.rarity_color,
                stored.float_min,
                stored.float_max,
                stored.image_url,
                stored.active,
            ) == (
                finish.paint_codename,
                finish.slug,
                finish.name,
                finish.phase,
                finish.rarity.code,
                finish.rarity.name,
                finish.rarity.color,
                finish.float_min,
                finish.float_max,
                finish.image_url,
                not finish.retired,
            ), f"{item_type.name} | {finish.display_name}"


def with_agent(snapshot: Snapshot, def_index: int, **changes: object) -> Snapshot:
    agents = tuple(
        a.model_copy(update=changes) if a.def_index == def_index else a for a in snapshot.agents
    )
    return snapshot.model_copy(update={"agents": agents})


async def agent_rows(session: AsyncSession) -> dict[int, tuple[Any, ...]]:
    rows = await session.execute(
        select(models.Agent.def_index, models.Agent.id, models.Agent.active)
    )
    return {row[0]: tuple(row[1:]) for row in rows}


async def test_every_agent_matches_its_row(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    rows = {row.def_index: row for row in await db_session.scalars(select(models.Agent))}
    assert len(rows) == AGENTS
    for agent in SNAPSHOT.agents:
        row = rows[agent.def_index]
        assert (
            row.codename,
            row.name,
            row.team,
            row.rarity_code,
            row.rarity_name,
            row.rarity_color,
            row.image_url,
            row.active,
        ) == (
            agent.codename,
            agent.name,
            agent.team,
            agent.rarity.code,
            agent.rarity.name,
            agent.rarity.color,
            agent.image_url,
            not agent.retired,
        )


async def test_retired_agent_is_deactivated_in_place(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await agent_rows(db_session)
    counts = await import_snapshot(db_session, with_agent(SNAPSHOT, 5305, retired=True), ORDER)
    assert counts == Counts(deactivated=1, unchanged=ROWS - 1)
    after = await agent_rows(db_session)
    assert after[5305] == (before[5305][0], False)
    assert {k: v for k, v in after.items() if k != 5305} == {
        k: v for k, v in before.items() if k != 5305
    }
    counts = await import_snapshot(db_session, SNAPSHOT, ORDER)
    assert counts == Counts(updated=1, unchanged=ROWS - 1)
    assert await agent_rows(db_session) == before


async def test_agent_missing_from_snapshot_is_deactivated(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    fewer = SNAPSHOT.model_copy(
        update={"agents": tuple(a for a in SNAPSHOT.agents if a.def_index != 5305)}
    )
    counts = await import_snapshot(db_session, fewer, ORDER)
    assert counts.deactivated == 1
    assert (await agent_rows(db_session))[5305][1] is False


async def test_reused_agent_codename_is_refused(db_session: AsyncSession) -> None:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    before = await all_rows(db_session)
    ricksaw = next(a for a in SNAPSHOT.agents if a.def_index == 5404)
    moved = ricksaw.model_copy(update={"def_index": 9999, "name": "Ricksaw II"})
    agents = (*(a for a in SNAPSHOT.agents if a.def_index != 5404), moved)
    with pytest.raises(CatalogError) as error:
        await import_snapshot(db_session, SNAPSHOT.model_copy(update={"agents": agents}), ORDER)
    message = str(error.value)
    assert "Ricksaw II (9999)" in message
    assert "Lt. Commander Ricksaw | NSWC SEAL (5404)" in message
    assert await all_rows(db_session) == before
