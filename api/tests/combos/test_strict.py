"""Numbers must be JSON numbers, and versions stay inside the column's range."""

from typing import Any

import pytest
from httpx import AsyncClient

from tests.combos.support import combo_body, create, logged_in

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

GLOVE = {"type_slug": "specialist", "finish_slug": "crimson-kimono"}
TOO_BIG = 2_147_483_648


def update(version: Any = 1, rating: Any = 8, float_from: Any = None) -> dict[str, Any]:
    # Doppler (Ruby) ranges from 0 to 0.08.
    knife = {"float_from": float_from, "float_to": 0.05} if float_from is not None else {}
    return {
        "version": version,
        "rating": rating,
        "description": None,
        "glove": {},
        "knife": knife,
        "screenshot_agent": None,
    }


def batch(rating: Any = 8, version: Any = 1, combo_id: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"glove": GLOVE, "knife_finish": "doppler-ruby"}
    if combo_id is None:
        body |= {"create": [{"knife_type": "karambit", "rating": rating, "description": None}]}
        body |= {"update": []}
    else:
        body |= {"create": []}
        body |= {
            "update": [{"id": combo_id, "version": version, "rating": rating, "description": None}]
        }
    return body


def refused_at(response: Any, *loc: str | int) -> None:
    assert response.status_code == 422, response.text
    assert tuple(loc) in {tuple(e["loc"]) for e in response.json()["detail"]}, response.text


async def test_numbers_sent_as_text_are_refused(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    post = admin_client.post
    refused_at(
        await post("/admin/combos", json=combo_body(rating="8.88"), headers=headers),
        "body",
        "rating",
    )
    body = combo_body(glove_conditions={"float_from": "0.1", "float_to": 0.5})
    refused_at(
        await post("/admin/combos", json=body, headers=headers), "body", "glove", "float_from"
    )
    refused_at(
        await post("/admin/batches", json=batch(rating="8"), headers=headers),
        "body",
        "create",
        0,
        "rating",
    )
    combo = await create(admin_client, headers)
    put = admin_client.put
    path = f"/admin/combos/{combo['id']}"
    refused_at(await put(path, json=update(rating="8.5"), headers=headers), "body", "rating")
    refused_at(
        await put(path, json=update(float_from="0.01"), headers=headers),
        "body",
        "knife",
        "float_from",
    )
    refused_at(
        await post("/admin/batches", json=batch("7", combo_id=combo["id"]), headers=headers),
        "body",
        "update",
        0,
        "rating",
    )


async def test_whole_and_decimal_numbers_are_accepted(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    combo = await create(admin_client, headers, rating=8)
    assert combo["rating"] == 8
    path = f"/admin/combos/{combo['id']}"
    response = await admin_client.put(path, json=update(rating=8.5, float_from=0), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["rating"] == 8.5


async def test_versions_beyond_the_column_are_refused(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    combo = await create(admin_client, headers)
    path = f"/admin/combos/{combo['id']}"
    refused_at(
        await admin_client.put(path, json=update(version=TOO_BIG), headers=headers),
        "body",
        "version",
    )
    response = await admin_client.post(
        "/admin/batches", json=batch(version=TOO_BIG, combo_id=combo["id"]), headers=headers
    )
    refused_at(response, "body", "update", 0, "version")
    response = await admin_client.delete(path, params={"version": TOO_BIG}, headers=headers)
    refused_at(response, "query", "version")
    response = await admin_client.put(path, json=update(version=TOO_BIG - 1), headers=headers)
    assert response.status_code == 409
