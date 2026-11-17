"""A combo item's pattern group: the group its seeds came from (spec 020)."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.patterns.importer import import_groups
from tests.combos.support import combo_count, create, logged_in
from tests.patterns.support import group, groups_file

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin", "groups")]

GLOVE = "specialist", "crimson-kimono"
BLUE_GEM = {"slug": "blue-gem", "name": "Blue Gem"}


@pytest.fixture
async def groups(catalog: AsyncSession) -> None:
    await import_groups(
        catalog,
        groups_file(
            group(),
            group("gold-gem", name="Gold Gem", seeds={"karambit": 896, "m9-bayonet": 739}),
        ),
    )


def body(knife: tuple[str, str], **conditions: Any) -> dict[str, Any]:
    return {"knife": knife, "knife_conditions": conditions}


async def test_create_with_a_group(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(
        admin_client,
        headers,
        **body(("karambit", "case-hardened"), seeds=[387], pattern_group="blue-gem"),
    )
    assert created["knife"]["seeds"] == [387]
    assert created["knife"]["pattern_group"] == BLUE_GEM
    assert created["glove"]["pattern_group"] is None
    read = await admin_client.get(f"/admin/combos/{created['id']}")
    assert read.json()["knife"]["pattern_group"] == BLUE_GEM


async def test_any_seed_of_the_group_is_accepted(admin_client: AsyncClient) -> None:
    """The owner's own example, Karambit 619, is not the group's example seed."""
    headers = await logged_in(admin_client)
    created = await create(
        admin_client,
        headers,
        **body(("karambit", "case-hardened"), seeds=[619], pattern_group="blue-gem"),
    )
    assert (created["knife"]["seeds"], created["knife"]["pattern_group"]) == ([619], BLUE_GEM)


@pytest.mark.parametrize(
    ("glove", "knife", "loc", "code"),
    [
        (
            {},
            {
                "finish_slug": "case-hardened",
                "type_slug": "karambit",
                "seeds": [1],
                "pattern_group": "x",
            },
            ["body", "knife", "pattern_group"],
            "pattern_group_not_found",
        ),
        (
            {"seeds": [1], "pattern_group": "blue-gem"},
            {"finish_slug": "case-hardened", "type_slug": "karambit"},
            ["body", "glove", "pattern_group"],
            "pattern_group_not_for_item",
        ),
        (
            {},
            {
                "finish_slug": "fade",
                "type_slug": "karambit",
                "seeds": [1],
                "pattern_group": "blue-gem",
            },
            ["body", "knife", "pattern_group"],
            "pattern_group_not_for_item",
        ),
        (
            {},
            {
                "finish_slug": "case-hardened",
                "type_slug": "kukri",
                "seeds": [1],
                "pattern_group": "gold-gem",
            },
            ["body", "knife", "pattern_group"],
            "pattern_group_not_for_item",
        ),
        (
            {},
            {"finish_slug": "case-hardened", "type_slug": "karambit", "pattern_group": "blue-gem"},
            ["body", "knife", "seeds"],
            "pattern_group_needs_seed",
        ),
    ],
)
async def test_create_refuses(
    admin_client: AsyncClient,
    db_session: AsyncSession,
    glove: dict[str, Any],
    knife: dict[str, Any],
    loc: list[str],
    code: str,
) -> None:
    headers = await logged_in(admin_client)
    request = {
        "glove": {"type_slug": GLOVE[0], "finish_slug": GLOVE[1], **glove},
        "knife": knife,
        "rating": 8.0,
    }
    response = await admin_client.post("/admin/combos", json=request, headers=headers)
    assert response.status_code == 422, response.text
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [(loc, code)]
    assert await combo_count(db_session) == 0


async def test_update_keeps_or_clears_the_group(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    created = await create(
        admin_client,
        headers,
        **body(("karambit", "case-hardened"), seeds=[387], pattern_group="blue-gem"),
    )

    async def update(version: int, knife: dict[str, Any]) -> dict[str, Any]:
        change = {
            "version": version,
            "rating": 8.0,
            "description": None,
            "glove": {},
            "knife": knife,
            "screenshot_agent": None,
        }
        response = await admin_client.put(
            f"/admin/combos/{created['id']}", json=change, headers=headers
        )
        assert response.status_code == 200, response.text
        updated: dict[str, Any] = response.json()
        return updated

    kept = await update(1, {"seeds": [387, 442], "pattern_group": "blue-gem"})
    assert (kept["knife"]["seeds"], kept["knife"]["pattern_group"]) == ([387, 442], BLUE_GEM)
    cleared = await update(2, {"seeds": [387], "pattern_group": None})
    assert (cleared["knife"]["seeds"], cleared["knife"]["pattern_group"]) == ([387], None)
    refused = await admin_client.put(
        f"/admin/combos/{created['id']}",
        json={
            "version": 3,
            "rating": 8.0,
            "description": None,
            "glove": {},
            "knife": {"seeds": [], "pattern_group": "blue-gem"},
            "screenshot_agent": None,
        },
        headers=headers,
    )
    assert refused.status_code == 422
    assert refused.json()["detail"][0]["type"] == "pattern_group_needs_seed"


def new(knife_type: str, **knife: Any) -> dict[str, Any]:
    return {"knife_type": knife_type, "rating": 8.0, "knife": knife}


async def test_batch_with_a_group(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await logged_in(admin_client)
    batch = {
        "glove": {"type_slug": GLOVE[0], "finish_slug": GLOVE[1]},
        "knife_finish": "case-hardened",
        "create": [
            new("karambit", seeds=[387], pattern_group="blue-gem"),
            new("m9-bayonet", seeds=[601], pattern_group="blue-gem"),
        ],
    }
    response = await admin_client.post("/admin/batches", json=batch, headers=headers)
    assert response.status_code == 200, response.text
    created = response.json()["created"]
    assert [(c["knife"]["seeds"], c["knife"]["pattern_group"]) for c in created] == [
        ([387], BLUE_GEM),
        ([601], BLUE_GEM),
    ]
    refused = {
        **batch,
        "create": [new("bayonet"), new("kukri", seeds=[1], pattern_group="gold-gem")],
    }
    response = await admin_client.post("/admin/batches", json=refused, headers=headers)
    assert response.status_code == 422
    assert [(e["loc"], e["type"]) for e in response.json()["detail"]] == [
        (["body", "create", 1, "knife", "pattern_group"], "pattern_group_not_for_item")
    ]
    assert await combo_count(db_session) == 2


async def test_candidates_have_no_group(admin_client: AsyncClient) -> None:
    await logged_in(admin_client)
    response = await admin_client.get(
        "/admin/batches/candidates",
        params={"glove_type": GLOVE[0], "glove_finish": GLOVE[1], "knife_finish": "case-hardened"},
    )
    assert response.status_code == 200
    candidates = response.json()
    assert candidates["glove"]["pattern_group"] is None
    assert {c["knife"]["pattern_group"] for c in candidates["candidates"]} == {None}


async def test_public_routes_name_the_group(admin_client: AsyncClient, clients: Any) -> None:
    headers = await logged_in(admin_client)
    created = await create(
        admin_client,
        headers,
        **body(("karambit", "case-hardened"), seeds=[387], pattern_group="blue-gem"),
    )
    await admin_client.post("/admin/combos/publish", json={"ids": [created["id"]]}, headers=headers)
    for path in (
        "/knives/karambit/case-hardened/combos",
        f"/gloves/{GLOVE[0]}/{GLOVE[1]}/combos",
    ):
        response = await clients("10.0.0.9").get(path)
        assert response.status_code == 200
        [combo] = response.json()
        assert combo["knife"]["pattern_group"] == BLUE_GEM
        assert "sources" not in response.text
        assert "group_id" not in response.text
