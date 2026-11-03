from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from tests.admins.support import Clock
from tests.combos.support import create, logged_in

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]


@dataclass
class Made:
    id: str
    glove: tuple[str, str]
    knife: tuple[str, str]
    rating: float
    status: str


PLAN = [
    (("specialist", "crimson-kimono"), ("karambit", "doppler-ruby"), 9.0, "published"),
    (("specialist", "crimson-kimono"), ("butterfly", "doppler-ruby"), 8.0, "draft"),
    (("specialist", "mogul"), ("karambit", "doppler-ruby"), 7.0, "unpublished"),
    (("sport", "pandoras-box"), ("karambit", "fade"), 9.0, "draft"),
    (("specialist", "mogul"), ("bayonet", "blue-steel"), 6.0, "published"),
    (("sport", "pandoras-box"), ("bayonet", "fade"), 9.0, "published"),
]


@pytest.fixture
async def made(admin_client: AsyncClient, fake_clock: Clock) -> list[Made]:
    headers = await logged_in(admin_client)
    result = []
    for glove, knife, rating, status in PLAN:
        fake_clock.advance(minutes=1)
        combo = await create(admin_client, headers, glove=glove, knife=knife, rating=rating)
        if status != "draft":
            await admin_client.post(
                "/admin/combos/publish", json={"ids": [combo["id"]]}, headers=headers
            )
        if status == "unpublished":
            await admin_client.post(
                "/admin/combos/unpublish", json={"ids": [combo["id"]]}, headers=headers
            )
        result.append(Made(combo["id"], glove, knife, rating, status))
    return result


async def listed(client: AsyncClient, **params: Any) -> dict[str, Any]:
    response = await client.get("/admin/combos", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_filters(admin_client: AsyncClient, made: list[Made]) -> None:
    cases: list[tuple[dict[str, str], Any]] = [
        ({}, lambda m: True),
        ({"glove_type": "specialist"}, lambda m: m.glove[0] == "specialist"),
        ({"glove_type": "specialist", "glove_finish": "mogul"}, lambda m: m.glove[1] == "mogul"),
        ({"knife_type": "karambit"}, lambda m: m.knife[0] == "karambit"),
        (
            {"knife_type": "bayonet", "knife_finish": "fade"},
            lambda m: m.knife == ("bayonet", "fade"),
        ),
        ({"status": "draft"}, lambda m: m.status == "draft"),
        ({"status": "unpublished"}, lambda m: m.status == "unpublished"),
        (
            {"glove_type": "specialist", "knife_type": "karambit", "status": "published"},
            lambda m: (
                m.glove[0] == "specialist" and m.knife[0] == "karambit" and m.status == "published"
            ),
        ),
    ]
    for params, keep in cases:
        body = await listed(admin_client, **params)
        expected = {m.id for m in made if keep(m)}
        assert {c["id"] for c in body["items"]} == expected, params
        assert body["total"] == len(expected), params
        assert all(set(c) >= {"status", "version", "created_by"} for c in body["items"])


async def test_bad_filters(admin_client: AsyncClient, made: list[Made]) -> None:
    bad: list[tuple[dict[str, Any], list[str]]] = [
        ({"glove_finish": "mogul"}, ["query", "glove_finish"]),
        ({"knife_finish": "fade"}, ["query", "knife_finish"]),
        ({"glove_type": "karambit"}, ["query", "glove_type"]),
        ({"glove_type": "specialist", "glove_finish": "nope"}, ["query", "glove_finish"]),
        ({"knife_type": "nope"}, ["query", "knife_type"]),
        ({"status": "hidden"}, ["query", "status"]),
        ({"sort": "name"}, ["query", "sort"]),
        ({"limit": 0}, ["query", "limit"]),
        ({"limit": 501}, ["query", "limit"]),
        ({"offset": -1}, ["query", "offset"]),
    ]
    for params, loc in bad:
        response = await admin_client.get("/admin/combos", params=params)
        assert response.status_code == 422, params
        assert [e["loc"] for e in response.json()["detail"]] == [loc], params


async def test_sorting_and_paging(admin_client: AsyncClient, made: list[Made]) -> None:
    by_rating = [c["id"] for c in (await listed(admin_client))["items"]]
    ratings = {m.id: m.rating for m in made}
    assert [ratings[i] for i in by_rating] == sorted(ratings.values(), reverse=True)
    assert by_rating == [c["id"] for c in (await listed(admin_client, sort="rating"))["items"]]
    for _ in range(3):
        assert [c["id"] for c in (await listed(admin_client))["items"]] == by_rating

    by_update = [c["id"] for c in (await listed(admin_client, sort="updated"))["items"]]
    assert by_update == [m.id for m in reversed(made)]

    for sort, full in (("rating", by_rating), ("updated", by_update)):
        pages = []
        for offset in range(0, 6, 4):
            page = await listed(admin_client, sort=sort, limit=4, offset=offset)
            assert page["total"] == 6
            pages += [c["id"] for c in page["items"]]
        assert pages == full
    assert (await listed(admin_client, offset=10))["items"] == []
