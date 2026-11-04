from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.combos.support import logged_in, retire_finish, retire_type
from tests.combos.test_public import CRIMSON, RUBY, make, public

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

EMPTY: dict[str, dict[str, int]] = {"gloves": {}, "knives": {}}


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
        "draft-only": (("hydra", "emerald"), ("talon", "fade"), 6.0, "draft"),
        "unpublished-only": (("moto", "eclipse"), ("ursus", "fade"), 6.0, "unpublished"),
    }
    return {name: await make(admin_client, headers, *combo) for name, combo in plan.items()}


async def counts(client: AsyncClient) -> Any:
    return await public(client, "/combo-counts")


async def test_no_combos(clients: Any) -> None:
    response = await clients("127.0.0.9").get("/combo-counts")
    assert response.status_code == 200
    assert response.json() == EMPTY
    assert "cache-control" not in response.headers


@pytest.mark.usefixtures("made")
async def test_counts_published_combos_only(clients: Any) -> None:
    assert await counts(clients("127.0.0.9")) == {
        "gloves": {"specialist": {"crimson-kimono": 3, "mogul": 1}, "sport": {"pandoras-box": 1}},
        "knives": {
            "karambit": {"doppler-ruby": 3},
            "butterfly": {"doppler-ruby": 1},
            "bayonet": {"fade": 1},
        },
    }


FINISHES = [
    ("gloves", "specialist", "crimson-kimono"),
    ("gloves", "specialist", "mogul"),
    ("gloves", "sport", "pandoras-box"),
    ("gloves", "hydra", "emerald"),
    ("gloves", "moto", "eclipse"),
    ("knives", "karambit", "doppler-ruby"),
    ("knives", "butterfly", "doppler-ruby"),
    ("knives", "bayonet", "fade"),
    ("knives", "flip", "fade"),
    ("knives", "nomad", "fade"),
    ("knives", "talon", "fade"),
    ("knives", "ursus", "fade"),
]


async def assert_counts_match_lists(client: AsyncClient) -> None:
    found = await counts(client)
    for kind, type_slug, finish_slug in FINISHES:
        listed = await public(client, f"/{kind}/{type_slug}/{finish_slug}/combos")
        counted = found[kind].get(type_slug, {}).get(finish_slug, 0)
        assert counted == len(listed), (kind, type_slug, finish_slug)


@pytest.mark.usefixtures("made")
async def test_counts_match_the_lists(clients: Any, db_session: AsyncSession) -> None:
    anonymous = clients("127.0.0.9")
    await assert_counts_match_lists(anonymous)
    # A retired finish, a combo whose other item is retired, and a retired type.
    await retire_finish(db_session, "knife", *RUBY)
    await retire_type(db_session, "glove", "sport")
    await assert_counts_match_lists(anonymous)
    found = await counts(anonymous)
    assert found["knives"]["karambit"] == {"doppler-ruby": 3}
    assert found["gloves"]["sport"] == {"pandoras-box": 1}
    assert found["gloves"]["specialist"]["crimson-kimono"] == 3


async def test_publishing_and_unpublishing(
    clients: Any, admin_client: AsyncClient, admin: int
) -> None:
    anonymous = clients("127.0.0.9")
    headers = await logged_in(admin_client)
    combo = await make(admin_client, headers, CRIMSON, RUBY, 9.0, "draft")
    assert await counts(anonymous) == EMPTY

    await admin_client.post("/admin/combos/publish", json={"ids": [combo]}, headers=headers)
    assert await counts(anonymous) == {
        "gloves": {"specialist": {"crimson-kimono": 1}},
        "knives": {"karambit": {"doppler-ruby": 1}},
    }

    other = await make(admin_client, headers, ("specialist", "mogul"), RUBY, 8.0, "published")
    assert (await counts(anonymous))["knives"] == {"karambit": {"doppler-ruby": 2}}

    await admin_client.post("/admin/combos/unpublish", json={"ids": [combo]}, headers=headers)
    assert await counts(anonymous) == {
        "gloves": {"specialist": {"mogul": 1}},
        "knives": {"karambit": {"doppler-ruby": 1}},
    }

    await admin_client.post("/admin/combos/unpublish", json={"ids": [other]}, headers=headers)
    assert await counts(anonymous) == EMPTY


@pytest.mark.usefixtures("made")
async def test_counts_need_no_session(clients: Any, admin_client: AsyncClient) -> None:
    without = await clients("127.0.0.9").get("/combo-counts")
    assert "set-cookie" not in without.headers
    with_session = await admin_client.get("/combo-counts")
    assert with_session.json() == without.json()
    assert "set-cookie" not in with_session.headers
    for hidden in ("status", "id", "created", "updated", "published"):
        assert hidden not in without.text
