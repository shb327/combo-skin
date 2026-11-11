from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.combos.models import Combo
from tests.combos.support import combo_count, create, logged_in, retire_finish
from tests.combos.test_models import OWNER_ORDER

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

GLOVE = {"type_slug": "specialist", "finish_slug": "crimson-kimono"}
RUBY_KNIVES = [slug for slug in OWNER_ORDER if slug not in ("classic", "kukri")]


async def candidates(client: AsyncClient, **params: str) -> Any:
    query = {"glove_type": "specialist", "glove_finish": "crimson-kimono"} | params
    return await client.get("/admin/batches/candidates", params=query)


def batch(**fields: Any) -> dict[str, Any]:
    return {"glove": GLOVE, "knife_finish": "doppler-ruby", "create": [], "update": []} | fields


def new(knife_type: str, rating: float = 8, **fields: Any) -> dict[str, Any]:
    return {"knife_type": knife_type, "rating": rating, "description": None} | fields


async def test_batch_finishes(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    await logged_in(admin_client)
    await retire_finish(db_session, "knife", "karambit", "fade")
    response = await admin_client.get("/admin/batches/finishes")
    assert response.status_code == 200
    finishes = response.json()
    names = [f["display_name"] for f in finishes]
    assert names == sorted(names)
    by_slug = {f["slug"]: f for f in finishes}
    assert by_slug["doppler-ruby"] == {
        "slug": "doppler-ruby",
        "display_name": "Doppler (Ruby)",
        "knife_types": 18,
    }
    assert by_slug["blue-steel"]["knife_types"] == 20
    assert by_slug["fade"]["knife_types"] == 19
    assert "crimson-kimono" not in by_slug


async def test_candidates(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    response = await candidates(admin_client, knife_finish="doppler-ruby")
    assert response.status_code == 200
    body = response.json()
    assert body["glove"]["finish_slug"] == "crimson-kimono"
    assert body["knife_finish"] == {"slug": "doppler-ruby", "display_name": "Doppler (Ruby)"}
    assert [c["knife"]["type_slug"] for c in body["candidates"]] == RUBY_KNIVES
    first = body["candidates"][0]["knife"]
    assert (first["float_from"], first["float_to"], first["seeds"]) == (None, None, [])
    assert (first["float_min"], first["float_max"]) == (0.0, 0.08)
    assert (body["glove"]["float_min"], body["glove"]["float_max"]) == (0.06, 0.8)
    assert first["fallback_image_url"].startswith("https://")
    assert {c["existing"] for c in body["candidates"]} == {None}

    combo = await create(admin_client, headers, rating=9.1, description="Red on red.")
    await retire_finish(db_session, "knife", "bayonet", "doppler-ruby")
    body = (await candidates(admin_client, knife_finish="doppler-ruby")).json()
    listed = {c["knife"]["type_slug"]: c["existing"] for c in body["candidates"]}
    assert "bayonet" not in listed
    assert listed["karambit"] == {
        "id": combo["id"],
        "status": "draft",
        "version": 1,
        "rating": 9.1,
        "description": "Red on red.",
    }
    assert [k for k, existing in listed.items() if existing] == ["karambit"]


async def test_candidates_refusals(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    await logged_in(admin_client)
    unknown = await candidates(admin_client, glove_finish="nope", knife_finish="doppler-ruby")
    assert unknown.status_code == 422
    assert unknown.json()["detail"][0]["type"] == "finish_not_found"
    await retire_finish(db_session, "glove", "specialist", "crimson-kimono")
    retired = await candidates(admin_client, knife_finish="doppler-ruby")
    assert retired.status_code == 422
    assert retired.json()["detail"][0]["type"] == "finish_retired"


async def test_no_knife_has_the_finish(admin_client: AsyncClient) -> None:
    await logged_in(admin_client)
    response = await candidates(admin_client, knife_finish="crimson-kimono")
    assert response.status_code == 200
    assert response.json()["candidates"] == []


async def test_save_a_batch(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    existing = await create(admin_client, headers, rating=9.1)
    creates = [
        new(knife, 9.5, description="Ruby.", knife={"float_from": 0, "float_to": 0.02})
        for knife in RUBY_KNIVES
        if knife != "karambit"
    ]
    body = batch(
        create=creates,
        update=[{"id": existing["id"], "version": 1, "rating": 9.45, "description": "Updated."}],
    )
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert len(saved["created"]) == 17
    assert [c["knife"]["type_slug"] for c in saved["created"]] == [c["knife_type"] for c in creates]
    assert {c["status"] for c in saved["created"]} == {"draft"}
    assert saved["created"][0]["knife"]["float_to"] == 0.02
    [updated] = saved["updated"]
    assert (updated["rating"], updated["description"], updated["version"]) == (9.45, "Updated.", 2)
    assert updated["knife"]["float_from"] is None


async def test_ratings_step_exactly(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    ratings = [round(9.5 - 0.05 * i, 2) for i in range(len(RUBY_KNIVES))]
    body = batch(create=[new(k, r) for k, r in zip(RUBY_KNIVES, ratings, strict=True)])
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 200, response.text
    stored = (await db_session.scalars(select(Combo.rating).order_by(Combo.rating.desc()))).all()
    assert stored == [Decimal(f"{r:.2f}") for r in ratings]
    assert stored[:3] == [Decimal("9.5"), Decimal("9.45"), Decimal("9.4")]


async def test_batch_refusals(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    karambit = await create(admin_client, headers)
    other_glove = await create(admin_client, headers, glove=("specialist", "mogul"))
    other_knife = await create(admin_client, headers, knife=("butterfly", "fade"))
    before = await combo_count(db_session)
    snapshot = (await admin_client.get("/admin/combos")).json()

    def upd(combo: dict[str, Any], version: int = 1) -> dict[str, Any]:
        return {"id": combo["id"], "version": version, "rating": 5, "description": None}

    cases: list[tuple[dict[str, Any], int, Any, str | None]] = [
        (
            batch(
                create=[new("butterfly"), new("talon", knife={"float_from": 0, "float_to": 0.5})]
            ),
            422,
            ["body", "create", 1, "knife", "float_to"],
            "float_outside_finish",
        ),
        (
            batch(create=[new("butterfly"), new("butterfly")]),
            422,
            ["body", "create", 1, "knife_type"],
            "duplicate_knife_type",
        ),
        (
            batch(create=[new("talon"), new("classic")]),
            422,
            ["body", "create", 1, "knife_type"],
            "finish_not_found",
        ),
        (
            batch(update=[{**upd(karambit), "id": "zzzzzzzzzzzz"}]),
            422,
            ["body", "update", 0, "id"],
            "combo_not_found",
        ),
        (batch(update=[upd(other_glove)]), 422, ["body", "update", 0, "id"], "combo_not_in_batch"),
        (batch(update=[upd(other_knife)]), 422, ["body", "update", 0, "id"], "combo_not_in_batch"),
        (
            batch(create=[new("karambit")], update=[upd(karambit)]),
            422,
            ["body", "update", 0, "id"],
            "duplicate_knife_type",
        ),
        (batch(create=[new("talon")], update=[upd(karambit, 2)]), 409, "version_conflict", None),
        (batch(create=[new("talon"), new("karambit")]), 409, "combo_exists", None),
        (batch(), 422, ["body"], None),
        (batch(create=[new(f"k{i}") for i in range(51)]), 422, ["body", "create"], None),
        (
            batch(create=[new(f"k{i}") for i in range(25)], update=[upd(karambit)] * 26),
            422,
            ["body"],
            None,
        ),
    ]
    for body, status, where, code in cases:
        response = await admin_client.post("/admin/batches", json=body, headers=headers)
        assert response.status_code == status, (body, response.text)
        if status == 409:
            assert response.json() == {"detail": where}
        else:
            errors = response.json()["detail"]
            assert [e["loc"] for e in errors] == [where], errors
            if code:
                assert errors[0]["type"] == code
        assert await combo_count(db_session) == before
        assert (await admin_client.get("/admin/combos")).json() == snapshot


async def test_update_only_batch_on_a_retired_glove_finish(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    """Existing combos on a retired finish can still be updated (spec 009 R18), in a batch as
    by a single update; a batch that would create one is still refused."""
    headers = await logged_in(admin_client)
    combo = await create(admin_client, headers)
    await retire_finish(db_session, "glove", "specialist", "crimson-kimono")
    change = {"id": combo["id"], "version": 1, "rating": 7.5, "description": None}
    response = await admin_client.post(
        "/admin/batches", json=batch(update=[change]), headers=headers
    )
    assert response.status_code == 200, response.text
    assert [c["rating"] for c in response.json()["updated"]] == [7.5]
    change["version"] = 2
    response = await admin_client.post(
        "/admin/batches", json=batch(create=[new("butterfly")], update=[change]), headers=headers
    )
    assert response.status_code == 422
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [
        (["body", "glove"], "finish_retired")
    ]
