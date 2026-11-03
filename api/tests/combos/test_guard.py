import logging
from typing import Any

import pytest
from httpx import AsyncClient

from tests.admins.support import USERNAME
from tests.combos.support import combo_body, create, logged_in
from tests.support import ADMIN_ORIGIN

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

ID = "zzzzzzzzzzzz"
QUERY = {"glove_type": "specialist", "glove_finish": "mogul", "knife_finish": "fade"}
# Every admin combo, batch and knife order route: method, path, query, body.
ROUTES: list[tuple[str, str, dict[str, Any], Any]] = [
    ("GET", "/admin/combos", {}, None),
    ("POST", "/admin/combos", {}, combo_body()),
    ("GET", f"/admin/combos/{ID}", {}, None),
    ("PUT", f"/admin/combos/{ID}", {}, {"version": 1}),
    ("DELETE", f"/admin/combos/{ID}", {"version": 1}, None),
    ("POST", "/admin/combos/publish", {}, {"ids": [ID]}),
    ("POST", "/admin/combos/unpublish", {}, {"ids": [ID]}),
    ("GET", "/admin/batches/finishes", {}, None),
    ("GET", "/admin/batches/candidates", QUERY, None),
    ("POST", "/admin/batches", {}, {}),
    ("GET", "/admin/knife-order", {}, None),
    ("PUT", "/admin/knife-order", {}, {"slugs": []}),
]
WRITES = {"POST", "PUT", "PATCH", "DELETE"}


async def send(
    client: AsyncClient, route: tuple[str, str, dict[str, Any], Any], headers: dict[str, str]
) -> Any:
    method, path, params, body = route
    return await client.request(method, path, params=params, json=body, headers=headers)


async def test_admin_routes_refuse_without_a_session(clients: Any) -> None:
    anonymous = clients("127.0.0.9")
    for route in ROUTES:
        response = await send(anonymous, route, {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": "x"})
        assert response.status_code == 401, route
        assert response.json() == {"detail": "not_authenticated"}
        assert response.headers["cache-control"] == "no-store"


async def test_admin_writes_need_the_csrf_token(admin_client: AsyncClient) -> None:
    await logged_in(admin_client)
    for route in ROUTES:
        if route[0] in WRITES:
            response = await send(admin_client, route, {"Origin": ADMIN_ORIGIN})
            assert response.status_code == 403, route
            assert response.json() == {"detail": "csrf_failed"}
            assert response.headers["cache-control"] == "no-store"


async def test_admin_responses_are_not_cached(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    combo = await create(admin_client, headers)
    routes = [
        *ROUTES,
        ("GET", f"/admin/combos/{combo['id']}", {}, None),
        ("POST", "/admin/combos/publish", {}, {"ids": [combo["id"]]}),
    ]
    for route in routes:
        response = await send(admin_client, route, headers)
        assert response.status_code < 500, route
        assert response.headers["cache-control"] == "no-store", (route, response.status_code)


async def test_log_events(admin_client: AsyncClient, caplog: pytest.LogCaptureFixture) -> None:
    headers = await logged_in(admin_client)
    with caplog.at_level(logging.INFO, logger="combo_api.combos"):
        combo = await create(admin_client, headers)
        path = f"/admin/combos/{combo['id']}"
        change: dict[str, Any] = {
            "version": 1,
            "rating": 7,
            "description": None,
            "glove": {},
            "knife": {},
        }
        await admin_client.put(path, json=change, headers=headers)
        ids = {"ids": [combo["id"]]}
        await admin_client.post("/admin/combos/publish", json=ids, headers=headers)
        await admin_client.post("/admin/combos/unpublish", json=ids, headers=headers)
        await admin_client.delete(path, params={"version": 2}, headers=headers)
        batch = {
            "glove": {"type_slug": "specialist", "finish_slug": "mogul"},
            "knife_finish": "fade",
            "create": [{"knife_type": "flip", "rating": 8, "description": None}],
        }
        saved = await admin_client.post("/admin/batches", json=batch, headers=headers)
        order = (await admin_client.get("/admin/knife-order")).json()
        slugs = [k["slug"] for k in order["knife_types"]]
        await admin_client.put("/admin/knife-order", json={"slugs": slugs}, headers=headers)
    lines = [r.getMessage() for r in caplog.records if r.name == "combo_api.combos"]
    flip = saved.json()["created"][0]["id"]
    expected = [
        f"combo created admin={USERNAME} id={combo['id']} "
        "glove=specialist/crimson-kimono knife=karambit/doppler-ruby",
        f"combo updated admin={USERNAME} id={combo['id']} version=2",
        f"combos published admin={USERNAME} ids={combo['id']}",
        f"combos unpublished admin={USERNAME} ids={combo['id']}",
        f"combo removed admin={USERNAME} id={combo['id']} glove=specialist/crimson-kimono",
        f"batch saved admin={USERNAME} glove=specialist/mogul knife_finish=fade "
        f"created={flip} updated=",
        f"knife order replaced admin={USERNAME} slugs={','.join(slugs)}",
    ]
    assert len(lines) == len(expected)
    for line, start in zip(lines, expected, strict=True):
        assert line.startswith(start), (line, start)
