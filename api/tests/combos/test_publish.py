from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.admins.support import OTHER_PASSWORD, OTHER_USERNAME, login, write_headers
from tests.combos.support import combo_count, create, logged_in

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

KNIVES = ["karambit", "butterfly", "bayonet", "flip"]


async def drafts(client: AsyncClient, headers: dict[str, str], count: int) -> list[str]:
    return [
        (await create(client, headers, knife=(knife, "doppler-ruby")))["id"]
        for knife in KNIVES[:count]
    ]


async def publish(client: AsyncClient, headers: dict[str, str], body: dict[str, Any]) -> Any:
    response = await client.post("/admin/combos/publish", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def unpublish(client: AsyncClient, headers: dict[str, str], ids: list[str]) -> Any:
    response = await client.post("/admin/combos/unpublish", json={"ids": ids}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def get(client: AsyncClient, combo_id: str) -> Any:
    return (await client.get(f"/admin/combos/{combo_id}")).json()


async def other_admin_headers(clients: Any) -> tuple[AsyncClient, dict[str, str]]:
    client = clients("127.0.0.2")
    response = await login(client, OTHER_USERNAME, OTHER_PASSWORD)
    return client, write_headers(response.json()["csrf_token"])


@pytest.mark.usefixtures("other_admin")
async def test_publish_and_unpublish_by_id(admin_client: AsyncClient, clients: Any) -> None:
    headers = await logged_in(admin_client)
    ids = await drafts(admin_client, headers, 2)
    other, other_headers = await other_admin_headers(clients)
    assert await publish(other, other_headers, {"ids": ids}) == {"changed": 2}
    for combo_id in ids:
        combo = await get(admin_client, combo_id)
        assert combo["status"] == "published"
        assert combo["published_at"] is not None
        assert combo["updated_by"] == OTHER_USERNAME
        assert combo["version"] == 1
    assert await publish(admin_client, headers, {"ids": ids}) == {"changed": 0}
    assert (await get(admin_client, ids[0]))["updated_by"] == OTHER_USERNAME
    assert await unpublish(admin_client, headers, ids[:1]) == {"changed": 1}
    assert (await get(admin_client, ids[0]))["status"] == "unpublished"
    assert (await get(admin_client, ids[1]))["status"] == "published"
    assert await unpublish(admin_client, headers, ids[:1]) == {"changed": 0}


async def test_publish_all_drafts(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    ids = await drafts(admin_client, headers, 4)
    await publish(admin_client, headers, {"ids": ids[:1]})
    await unpublish(admin_client, headers, ids[:1])
    assert await publish(admin_client, headers, {"all_drafts": True}) == {"changed": 3}
    statuses = [(await get(admin_client, combo_id))["status"] for combo_id in ids]
    assert statuses == ["unpublished", "published", "published", "published"]


async def test_publish_refuses_bad_requests(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    ids = await drafts(admin_client, headers, 2)
    response = await admin_client.post(
        "/admin/combos/publish", json={"ids": [ids[0], "zzzzzzzzzzzz", ids[1]]}, headers=headers
    )
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert [(e["loc"], e["type"]) for e in errors] == [(["body", "ids", 1], "combo_not_found")]
    assert {(await get(admin_client, combo_id))["status"] for combo_id in ids} == {"draft"}
    bodies: list[dict[str, Any]] = [
        {"ids": ids, "all_drafts": True},
        {},
        {"ids": []},
        {"ids": ["zzzzzzzzzzzz"] * 501},
        {"all_drafts": False},
    ]
    for body in bodies:
        refused = await admin_client.post("/admin/combos/publish", json=body, headers=headers)
        assert refused.status_code == 422, body
    for body in ({"ids": []}, {}, {"ids": [ids[0], "zzzzzzzzzzzz"]}):
        refused = await admin_client.post("/admin/combos/unpublish", json=body, headers=headers)
        assert refused.status_code == 422, body


@pytest.mark.usefixtures("other_admin")
async def test_publishing_does_not_break_an_open_edit(
    admin_client: AsyncClient, clients: Any
) -> None:
    headers = await logged_in(admin_client)
    [combo_id] = await drafts(admin_client, headers, 1)
    read = await get(admin_client, combo_id)
    other, other_headers = await other_admin_headers(clients)
    await publish(other, other_headers, {"ids": [combo_id]})
    change = {
        "version": read["version"],
        "rating": 9,
        "description": None,
        "glove": {},
        "knife": {},
    }
    response = await admin_client.put(f"/admin/combos/{combo_id}", json=change, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "published"


async def test_published_combo_cannot_be_removed(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    created = await create(admin_client, headers)
    published = await admin_client.post(
        "/admin/combos/publish", json={"ids": [created["id"]]}, headers=headers
    )
    assert published.status_code == 200
    path = f"/admin/combos/{created['id']}"
    response = await admin_client.delete(path, params={"version": 1}, headers=headers)
    assert (response.status_code, response.json()) == (409, {"detail": "combo_published"})
    assert await combo_count(db_session) == 1
