import logging
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.models import Agent
from combo_api.combos.models import Combo, ScreenshotSettings
from tests.admins.support import USERNAME
from tests.combos.support import combo_body, create, logged_in

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

RICKSAW = 5404
DARRYL = 4613
OPERATOR = 5305
AGENT_FIELDS = {"def_index", "name", "team", "image_url", "rarity", "active"}


async def retire_agent(db: AsyncSession, def_index: int) -> None:
    await db.execute(update(Agent).where(Agent.def_index == def_index).values(active=False))


def change(version: int = 1, **fields: Any) -> dict[str, Any]:
    return {
        "version": version,
        "rating": 8,
        "description": None,
        "glove": {},
        "knife": {},
        "screenshot_agent": None,
    } | fields


async def test_list_agents(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    assert (await admin_client.get("/admin/agents")).status_code == 401
    await logged_in(admin_client)
    await retire_agent(db_session, OPERATOR)
    response = await admin_client.get("/admin/agents")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    agents = response.json()
    assert len(agents) == 62
    assert OPERATOR not in {a["def_index"] for a in agents}
    assert all(set(a) == AGENT_FIELDS for a in agents)
    teams = [a["team"] for a in agents]
    assert teams == sorted(teams, key=lambda team: team != "ct")
    for team in ("ct", "t"):
        names = [a["name"] for a in agents if a["team"] == team]
        assert names == sorted(names, key=str.casefold)
    ricksaw = next(a for a in agents if a["def_index"] == RICKSAW)
    assert ricksaw["name"] == "Lt. Commander Ricksaw | NSWC SEAL"
    assert (ricksaw["team"], ricksaw["active"]) == ("ct", True)
    assert ricksaw["rarity"]["name"] == "Master"
    assert ricksaw["image_url"].startswith("https://")


async def test_create_with_and_without_an_agent(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    plain = await create(admin_client, headers)
    assert plain["screenshot_agent"] is None
    stored = await db_session.scalar(
        select(Combo.screenshot_agent_id).where(Combo.public_id == plain["id"])
    )
    assert stored is None
    body = combo_body(knife=("bayonet", "fade")) | {"screenshot_agent": RICKSAW}
    response = await admin_client.post("/admin/combos", json=body, headers=headers)
    assert response.status_code == 201, response.text
    agent = response.json()["screenshot_agent"]
    assert set(agent) == AGENT_FIELDS
    assert (agent["def_index"], agent["team"]) == (RICKSAW, "ct")
    read = await admin_client.get(f"/admin/combos/{response.json()['id']}")
    assert read.json()["screenshot_agent"] == agent


async def test_update_sets_the_agent(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers)
    path = f"/admin/combos/{created['id']}"
    response = await admin_client.put(path, json=change(screenshot_agent=DARRYL), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["version"] == 2
    assert response.json()["screenshot_agent"]["def_index"] == DARRYL
    response = await admin_client.put(path, json=change(2), headers=headers)
    assert response.json()["screenshot_agent"] is None
    assert response.json()["version"] == 3


async def test_update_needs_the_agent_field(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers)
    body = change()
    del body["screenshot_agent"]
    response = await admin_client.put(f"/admin/combos/{created['id']}", json=body, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "screenshot_agent"]


async def test_unknown_and_retired_agents(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    unknown = combo_body() | {"screenshot_agent": 1}
    response = await admin_client.post("/admin/combos", json=unknown, headers=headers)
    assert response.status_code == 422
    [problem] = response.json()["detail"]
    assert (problem["loc"], problem["type"]) == (["body", "screenshot_agent"], "agent_not_found")

    kept = await create(admin_client, headers, knife=("bayonet", "fade"))
    path = f"/admin/combos/{kept['id']}"
    assert (
        await admin_client.put(path, json=change(screenshot_agent=OPERATOR), headers=headers)
    ).status_code == 200
    await retire_agent(db_session, OPERATOR)
    retired = combo_body() | {"screenshot_agent": OPERATOR}
    response = await admin_client.post("/admin/combos", json=retired, headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "agent_retired"
    other = await create(admin_client, headers, knife=("flip", "fade"))
    response = await admin_client.put(
        f"/admin/combos/{other['id']}", json=change(screenshot_agent=OPERATOR), headers=headers
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "agent_retired"
    response = await admin_client.put(
        path, json=change(2, screenshot_agent=OPERATOR, rating=9), headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["screenshot_agent"]["active"] is False
    unknown_update = await admin_client.put(
        path, json=change(3, screenshot_agent=1), headers=headers
    )
    assert unknown_update.json()["detail"][0]["type"] == "agent_not_found"


async def test_batch_rows_carry_their_agents(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    existing = await create(admin_client, headers)
    path = f"/admin/combos/{existing['id']}"
    await admin_client.put(path, json=change(screenshot_agent=DARRYL), headers=headers)
    body = {
        "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
        "knife_finish": "doppler-ruby",
        "create": [
            {"knife_type": "butterfly", "rating": 9.5, "screenshot_agent": RICKSAW},
            {"knife_type": "talon", "rating": 9.45, "screenshot_agent": OPERATOR},
            {"knife_type": "bayonet", "rating": 9.4},
        ],
        "update": [{"id": existing["id"], "version": 2, "rating": 9.35, "description": None}],
    }
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 200, response.text
    saved = response.json()
    agents = [
        c["screenshot_agent"] and c["screenshot_agent"]["def_index"] for c in saved["created"]
    ]
    assert agents == [RICKSAW, OPERATOR, None]
    assert saved["updated"][0]["screenshot_agent"]["def_index"] == DARRYL


async def test_batch_refuses_a_retired_agent(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    await retire_agent(db_session, OPERATOR)
    body = {
        "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
        "knife_finish": "doppler-ruby",
        "create": [{"knife_type": "butterfly", "rating": 9.5, "screenshot_agent": OPERATOR}],
    }
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 422
    [problem] = response.json()["detail"]
    assert (problem["loc"], problem["type"]) == (
        ["body", "create", 0, "screenshot_agent"],
        "agent_retired",
    )


async def test_batch_refuses_an_unknown_agent(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    body = {
        "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
        "knife_finish": "doppler-ruby",
        "create": [
            {"knife_type": "butterfly", "rating": 9.5},
            {"knife_type": "talon", "rating": 9.45, "screenshot_agent": 1},
        ],
    }
    response = await admin_client.post("/admin/batches", json=body, headers=headers)
    assert response.status_code == 422
    [problem] = response.json()["detail"]
    assert problem["loc"] == ["body", "create", 1, "screenshot_agent"]
    assert problem["type"] == "agent_not_found"


async def test_default_agent_setting(
    admin_client: AsyncClient, db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    assert (await admin_client.get("/admin/screenshot-settings")).status_code == 401
    headers = await logged_in(admin_client)
    published = await create(admin_client, headers)
    unpublished = await create(admin_client, headers, knife=("bayonet", "fade"))
    await create(admin_client, headers, knife=("gut", "fade"))
    own = await create(admin_client, headers, knife=("flip", "fade"))
    # Every status counts: one published, one unpublished, one draft use the default.
    ids = {"ids": [published["id"], unpublished["id"]]}
    await admin_client.post("/admin/combos/publish", json=ids, headers=headers)
    await admin_client.post(
        "/admin/combos/unpublish", json={"ids": [unpublished["id"]]}, headers=headers
    )
    path = f"/admin/combos/{own['id']}"
    await admin_client.put(path, json=change(screenshot_agent=DARRYL), headers=headers)
    before = (await db_session.execute(select(Combo.id, Combo.version, Combo.updated_at))).all()

    response = await admin_client.get("/admin/screenshot-settings")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    settings = response.json()
    assert settings["default_agent"]["def_index"] == RICKSAW
    assert settings["using_default"] == 3

    with caplog.at_level(logging.INFO, logger="combo_api.combos"):
        response = await admin_client.put(
            "/admin/screenshot-settings", json={"default_agent": DARRYL}, headers=headers
        )
    assert response.status_code == 200, response.text
    assert response.json()["default_agent"]["def_index"] == DARRYL
    assert response.json()["using_default"] == 3
    assert (await admin_client.get("/admin/screenshot-settings")).json() == response.json()
    after = (await db_session.execute(select(Combo.id, Combo.version, Combo.updated_at))).all()
    assert sorted(after) == sorted(before)
    row = await db_session.get_one(ScreenshotSettings, 1)
    assert row.default_agent_def_index == DARRYL
    assert row.updated_by is not None
    assert (
        f"default agent changed admin={USERNAME} def_index={DARRYL} using_default=3" in caplog.text
    )


async def test_default_agent_refusals(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    await retire_agent(db_session, OPERATOR)
    for def_index, code in ((1, "agent_not_found"), (OPERATOR, "agent_retired")):
        response = await admin_client.put(
            "/admin/screenshot-settings", json={"default_agent": def_index}, headers=headers
        )
        assert response.status_code == 422
        [problem] = response.json()["detail"]
        assert (problem["loc"], problem["type"]) == (["body", "default_agent"], code)
    settings = (await admin_client.get("/admin/screenshot-settings")).json()
    assert settings["default_agent"]["def_index"] == RICKSAW
    no_csrf = {"Origin": headers["Origin"]}
    response = await admin_client.put(
        "/admin/screenshot-settings", json={"default_agent": DARRYL}, headers=no_csrf
    )
    assert response.status_code == 403


async def test_public_responses_have_no_agent(clients: Any, admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    combo = await create(admin_client, headers)
    path = f"/admin/combos/{combo['id']}"
    await admin_client.put(path, json=change(screenshot_agent=DARRYL), headers=headers)
    await admin_client.post("/admin/combos/publish", json={"ids": [combo["id"]]}, headers=headers)
    public = clients("127.0.0.9")
    for route in (
        "/gloves/specialist/crimson-kimono/combos",
        "/knives/karambit/doppler-ruby/combos",
        "/combo-counts",
    ):
        response = await public.get(route)
        assert response.status_code == 200
        assert response.text != "[]"
        assert "agent" not in response.text, route


async def test_default_agent_missing_from_the_catalog(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    await db_session.execute(update(ScreenshotSettings).values(default_agent_def_index=1))
    response = await admin_client.get("/admin/screenshot-settings")
    assert response.status_code == 503
    assert response.json() == {"detail": "default_agent_missing"}
    assert response.headers["cache-control"] == "no-store"
    # Choosing an agent that is in the catalog repairs it.
    response = await admin_client.put(
        "/admin/screenshot-settings", json={"default_agent": RICKSAW}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["default_agent"]["def_index"] == RICKSAW


async def test_retired_default_agent_is_still_shown(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    await logged_in(admin_client)
    await retire_agent(db_session, RICKSAW)
    response = await admin_client.get("/admin/screenshot-settings")
    assert response.status_code == 200
    agent = response.json()["default_agent"]
    assert (agent["def_index"], agent["active"]) == (RICKSAW, False)
