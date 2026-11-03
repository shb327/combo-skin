from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.admins.support import USERNAME
from tests.combos.support import create, logged_in, retire_finish

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

CRIMSON = "specialist", "crimson-kimono"
RUBY = "karambit", "doppler-ruby"
PUBLIC_KEYS = {"id", "rating", "description", "glove", "knife"}
ITEM_KEYS = {
    "type_slug",
    "type_name",
    "finish_slug",
    "display_name",
    "image_url",
    "rarity",
    "active",
    "float_min",
    "float_max",
    "float_from",
    "float_to",
    "seeds",
}


async def make(
    client: AsyncClient,
    headers: dict[str, str],
    glove: tuple[str, str],
    knife: tuple[str, str],
    rating: float,
    status: str,
) -> str:
    combo = await create(client, headers, glove=glove, knife=knife, rating=rating)
    if status != "draft":
        await client.post("/admin/combos/publish", json={"ids": [combo["id"]]}, headers=headers)
    if status == "unpublished":
        await client.post("/admin/combos/unpublish", json={"ids": [combo["id"]]}, headers=headers)
    return str(combo["id"])


@pytest.fixture
async def made(admin_client: AsyncClient, catalog: AsyncSession, admin: int) -> dict[str, str]:
    headers = await logged_in(admin_client)
    plan = {
        "karambit": (CRIMSON, RUBY, 9.0, "published"),
        "butterfly": (CRIMSON, ("butterfly", "doppler-ruby"), 9.0, "published"),
        "bayonet": (CRIMSON, ("bayonet", "fade"), 8.0, "published"),
        "flip": (CRIMSON, ("flip", "fade"), 9.5, "draft"),
        "nomad": (CRIMSON, ("nomad", "fade"), 7.0, "unpublished"),
        "sport": (("sport", "pandoras-box"), RUBY, 9.0, "published"),
        "mogul": (("specialist", "mogul"), RUBY, 4.0, "published"),
    }
    return {name: await make(admin_client, headers, *combo) for name, combo in plan.items()}


async def public(client: AsyncClient, path: str) -> Any:
    response = await client.get(path)
    assert response.status_code == 200, response.text
    return response.json()


async def test_glove_finish_combos(clients: Any, made: dict[str, str]) -> None:
    anonymous = clients("127.0.0.9")
    response = await anonymous.get("/gloves/specialist/crimson-kimono/combos")
    combos = response.json()
    assert [c["id"] for c in combos] == [made["butterfly"], made["karambit"], made["bayonet"]]
    assert [c["rating"] for c in combos] == [9.0, 9.0, 8.0]
    for combo in combos:
        assert set(combo) == PUBLIC_KEYS
        assert set(combo["glove"]) == set(combo["knife"]) == ITEM_KEYS
    for hidden in (USERNAME, "status", "version", "created", "updated", "published_at"):
        assert hidden not in response.text
    assert '"item_type_id"' not in response.text


async def test_knife_finish_combos(
    clients: Any, made: dict[str, str], db_session: AsyncSession
) -> None:
    anonymous = clients("127.0.0.9")
    combos = await public(anonymous, "/knives/karambit/doppler-ruby/combos")
    assert [c["id"] for c in combos] == [made["karambit"], made["sport"], made["mogul"]]
    assert await public(anonymous, "/knives/karambit/fade/combos") == []
    for path in (
        "/knives/nope/doppler-ruby/combos",
        "/knives/karambit/nope/combos",
        "/knives/specialist/crimson-kimono/combos",
        "/gloves/karambit/doppler-ruby/combos",
    ):
        response = await anonymous.get(path)
        assert (response.status_code, response.json()) == (404, {"detail": "Not Found"}), path
    await retire_finish(db_session, "knife", *RUBY)
    combos = await public(anonymous, "/gloves/specialist/crimson-kimono/combos")
    karambit = next(c for c in combos if c["id"] == made["karambit"])
    assert karambit["knife"]["active"] is False
    assert len(await public(anonymous, "/knives/karambit/doppler-ruby/combos")) == 3


@pytest.mark.usefixtures("made")
async def test_public_routes_need_no_session(clients: Any, admin_client: AsyncClient) -> None:
    anonymous = clients("127.0.0.9")
    for path in (
        "/gloves/specialist/crimson-kimono/combos",
        "/knives/karambit/doppler-ruby/combos",
    ):
        without = await anonymous.get(path)
        assert without.status_code == 200
        assert "set-cookie" not in without.headers
        with_session = await admin_client.get(path)
        assert with_session.json() == without.json()
        assert "set-cookie" not in with_session.headers


async def test_public_slugs_are_bounded(clients: Any) -> None:
    anonymous = clients("127.0.0.9")
    long = "x" * 65
    for path, loc in (
        (f"/gloves/{long}/crimson-kimono/combos", ["path", "type_slug"]),
        (f"/gloves/specialist/{long}/combos", ["path", "finish_slug"]),
        (f"/knives/{long}/doppler-ruby/combos", ["path", "type_slug"]),
        (f"/knives/karambit/{long}/combos", ["path", "finish_slug"]),
    ):
        response = await anonymous.get(path)
        assert response.status_code == 422, path
        assert [e["loc"] for e in response.json()["detail"]] == [loc]
    ok = await anonymous.get(f"/knives/karambit/{'x' * 64}/combos")
    assert ok.status_code == 404
