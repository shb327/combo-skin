import logging
import re
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.admins.support import USERNAME, Clock
from tests.combos.support import (
    combo_body,
    combo_count,
    create,
    logged_in,
    retire_finish,
    retire_type,
)

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

GLOVE = "specialist", "crimson-kimono"
KNIFE = "karambit", "doppler-ruby"


async def test_create_returns_a_draft(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    response = await admin_client.post(
        "/admin/combos",
        json=combo_body(
            description="Blue and red.",
            glove_conditions={"seeds": [2, 1]},
            knife_conditions={"float_from": 0, "float_to": 0.01},
        ),
        headers=headers,
    )
    assert response.status_code == 201
    assert '"rating":8.88' in response.text
    body = response.json()
    assert re.fullmatch("[0-9a-z]{12}", body["id"])
    created_at = body.pop("created_at")
    assert body.pop("updated_at") == created_at
    rarity = body["glove"].pop("rarity")
    assert set(rarity) == {"code", "name", "color"}
    assert body["knife"].pop("rarity")["name"] == "Covert"
    for side in ("glove", "knife"):
        assert body[side].pop("image_url").startswith("https://")
    assert body == {
        "id": body["id"],
        "status": "draft",
        "version": 1,
        "rating": 8.88,
        "description": "Blue and red.",
        "glove": {
            "type_slug": "specialist",
            "type_name": "Specialist Gloves",
            "finish_slug": "crimson-kimono",
            "display_name": "Crimson Kimono",
            "active": True,
            "float_min": 0.06,
            "float_max": 0.8,
            "float_from": None,
            "float_to": None,
            "seeds": [1, 2],
        },
        "knife": {
            "type_slug": "karambit",
            "type_name": "Karambit",
            "finish_slug": "doppler-ruby",
            "display_name": "Doppler (Ruby)",
            "active": True,
            "float_min": 0.0,
            "float_max": 0.08,
            "float_from": 0.0,
            "float_to": 0.01,
            "seeds": [],
        },
        "screenshot_agent": None,
        "screenshot": None,
        "screenshot_state": {
            "state": "none",
            "rendering": False,
            "reason": None,
            "attempts": 0,
            "made_at": None,
        },
        "created_by": USERNAME,
        "updated_by": USERNAME,
        "published_at": None,
    }


async def test_same_pairing_is_refused(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    await create(admin_client, headers)
    response = await admin_client.post("/admin/combos", json=combo_body(), headers=headers)
    assert response.status_code == 409
    assert response.json() == {"detail": "combo_exists"}
    assert await combo_count(db_session) == 1


VANILLA = "karambit", "vanilla"
INVALID: list[tuple[dict[str, Any], list[Any], str | None]] = [
    ({"glove": ("nope", "crimson-kimono")}, ["glove", "type_slug"], "finish_not_found"),
    ({"glove": ("specialist", "nope")}, ["glove", "finish_slug"], "finish_not_found"),
    ({"glove": KNIFE}, ["glove", "type_slug"], "finish_not_found"),
    ({"knife": GLOVE}, ["knife", "type_slug"], "finish_not_found"),
    ({"knife": ("karambit", "fade")}, ["knife"], "finish_retired"),
    ({"knife": ("talon", "doppler-ruby")}, ["knife"], "finish_retired"),
    ({"rating": 8.885}, ["rating"], None),
    ({"rating": -1}, ["rating"], None),
    ({"rating": 10.5}, ["rating"], None),
    (
        {"knife_conditions": {"float_from": 0.00001, "float_to": 0.01}},
        ["knife", "float_from"],
        None,
    ),
    ({"knife_conditions": {"float_from": 0.01}}, ["knife"], None),
    ({"knife_conditions": {"float_from": 0.02, "float_to": 0.02}}, ["knife"], None),
    (
        {"glove_conditions": {"float_from": 0.05, "float_to": 0.5}},
        ["glove", "float_from"],
        "float_outside_finish",
    ),
    (
        {"knife_conditions": {"float_from": 0, "float_to": 0.09}},
        ["knife", "float_to"],
        "float_outside_finish",
    ),
    (
        {"knife": VANILLA, "knife_conditions": {"float_from": 0, "float_to": 0.5}},
        ["knife", "float_from"],
        "finish_has_no_float",
    ),
    (
        {"knife": VANILLA, "knife_conditions": {"seeds": [1]}},
        ["knife", "seeds"],
        "finish_has_no_pattern",
    ),
    ({"glove_conditions": {"seeds": [1001]}}, ["glove", "seeds", 0], None),
    ({"glove_conditions": {"seeds": [5, 5]}}, ["glove", "seeds"], "duplicate_seed"),
    ({"glove_conditions": {"seeds": list(range(101))}}, ["glove", "seeds"], None),
    ({"description": "x" * 1001}, ["description"], None),
    ({"description": "tab\there"}, ["description"], None),
]


@pytest.mark.parametrize(("changes", "loc", "code"), INVALID)
async def test_create_refuses_invalid_input(
    admin_client: AsyncClient,
    db_session: AsyncSession,
    changes: dict[str, Any],
    loc: list[Any],
    code: str | None,
) -> None:
    await retire_finish(db_session, "knife", "karambit", "fade")
    await retire_type(db_session, "knife", "talon")
    headers = await logged_in(admin_client)
    response = await admin_client.post("/admin/combos", json=combo_body(**changes), headers=headers)
    assert response.status_code == 422, response.text
    errors = response.json()["detail"]
    assert [e["loc"] for e in errors] == [["body", *loc]]
    if code is not None:
        assert errors[0]["type"] == code
    assert await combo_count(db_session) == 0


async def test_finish_bounds_are_inclusive(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(
        admin_client,
        headers,
        glove_conditions={"float_from": 0.06, "float_to": 0.8},
        knife_conditions={"float_from": 0, "float_to": 0.08},
    )
    assert (created["glove"]["float_from"], created["glove"]["float_to"]) == (0.06, 0.8)


async def test_read_one(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers, description="   ")
    assert created["description"] is None
    response = await admin_client.get(f"/admin/combos/{created['id']}")
    assert response.status_code == 200
    assert response.json() == created
    missing = await admin_client.get("/admin/combos/zzzzzzzzzzzz")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "combo_not_found"}


async def test_update(
    admin_client: AsyncClient, clients: Any, other_admin: int, fake_clock: Clock
) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers)
    other = clients("127.0.0.2")
    other_response = await other.post(
        "/admin/login",
        json={"username": "second-admin", "password": "another placeholder password"},
        headers={"Origin": headers["Origin"]},
    )
    other_headers = {**headers, "X-CSRF-Token": other_response.json()["csrf_token"]}
    fake_clock.advance(minutes=5)
    change = {
        "version": 1,
        "rating": 9.15,
        "description": "Updated.",
        "glove": {"float_from": 0.06, "float_to": 0.15, "seeds": [7]},
        "knife": {"float_from": 0, "float_to": 0.03},
        "screenshot_agent": None,
        "status": "published",
        "type_slug": "bayonet",
        "finish_slug": "fade",
    }
    response = await other.put(f"/admin/combos/{created['id']}", json=change, headers=other_headers)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["version"] == 2
    assert (updated["rating"], updated["description"]) == (9.15, "Updated.")
    assert updated["glove"]["seeds"] == [7]
    assert (updated["knife"]["float_from"], updated["knife"]["float_to"]) == (0.0, 0.03)
    assert updated["updated_by"] == "second-admin"
    assert updated["updated_at"] > created["updated_at"]
    for kept in ("created_by", "created_at", "status"):
        assert updated[kept] == created[kept]
    assert updated["knife"]["finish_slug"] == "doppler-ruby"

    stale = await admin_client.put(
        f"/admin/combos/{created['id']}", json={**change, "rating": 1}, headers=headers
    )
    assert stale.status_code == 409
    assert stale.json() == {"detail": "version_conflict"}
    assert (await admin_client.get(f"/admin/combos/{created['id']}")).json() == updated


async def test_update_checks_conditions(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers)
    change = {
        "version": 1,
        "rating": 9,
        "description": None,
        "glove": {},
        "knife": {"float_from": 0, "float_to": 0.5},
        "screenshot_agent": None,
    }
    response = await admin_client.put(
        f"/admin/combos/{created['id']}", json=change, headers=headers
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "knife", "float_to"]
    missing = await admin_client.put("/admin/combos/zzzzzzzzzzzz", json=change, headers=headers)
    assert missing.status_code == 404


async def test_update_after_the_finish_retired(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers)
    await retire_finish(db_session, "knife", *KNIFE)
    change: dict[str, Any] = {
        "version": 1,
        "rating": 7,
        "description": None,
        "glove": {},
        "screenshot_agent": None,
    }
    for knife, status in (({"float_from": 0, "float_to": 0.09}, 422), ({}, 200)):
        response = await admin_client.put(
            f"/admin/combos/{created['id']}", json={**change, "knife": knife}, headers=headers
        )
        assert response.status_code == status, response.text
    assert response.json()["knife"]["active"] is False


async def test_remove(
    admin_client: AsyncClient, db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    headers = await logged_in(admin_client)
    created = await create(
        admin_client,
        headers,
        rating=6.5,
        description="Gone soon.",
        knife_conditions={"seeds": [412]},
    )
    path = f"/admin/combos/{created['id']}"
    stale = await admin_client.delete(path, params={"version": 2}, headers=headers)
    assert (stale.status_code, stale.json()) == (409, {"detail": "version_conflict"})
    no_version = await admin_client.delete(path, headers=headers)
    assert no_version.status_code == 422
    with caplog.at_level(logging.INFO, logger="combo_api.combos"):
        removed = await admin_client.delete(path, params={"version": 1}, headers=headers)
    assert removed.status_code == 204
    assert await combo_count(db_session) == 0
    line = next(r.getMessage() for r in caplog.records if "combo removed" in r.getMessage())
    for text in (created["id"], "rating=6.5", "Gone soon.", "412", f"admin={USERNAME}"):
        assert text in line
    missing = await admin_client.delete(path, params={"version": 1}, headers=headers)
    assert (missing.status_code, missing.json()) == (404, {"detail": "combo_not_found"})
