from collections.abc import AsyncIterator, Callable
from typing import Any

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins.deps import ADMIN_RESPONSES, AdminDep, require_admin
from combo_api.admins.models import Admin
from combo_api.main import create_app
from tests.admins.conftest import API_URL
from tests.admins.support import (
    USERNAME,
    ClientFactory,
    Clock,
    login,
    write_headers,
)
from tests.support import ADMIN_ORIGIN

pytestmark = pytest.mark.anyio

WRITES = {"POST", "PUT", "PATCH", "DELETE"}
UNGUARDED = {"admin_login", "admin_logout"}

probe = APIRouter(prefix="/probe")


@probe.get("", responses=ADMIN_RESPONSES)
async def probe_read(current: AdminDep) -> dict[str, Any]:
    return {"id": current.id, "username": current.username}


@probe.post("", responses=ADMIN_RESPONSES)
async def probe_write(current: AdminDep) -> dict[str, Any]:
    return {"id": current.id, "username": current.username}


def depends_on_require_admin(route: APIRoute) -> bool:
    pending = list(route.dependant.dependencies)
    while pending:
        dependant = pending.pop()
        if dependant.call is require_admin:
            return True
        pending.extend(dependant.dependencies)
    return False


def unguarded_writes(app: FastAPI) -> list[str]:
    return [
        route.name
        for route in app.routes
        if isinstance(route, APIRoute)
        and set(route.methods or ()) & WRITES
        and route.name not in UNGUARDED
        and not depends_on_require_admin(route)
    ]


@pytest.fixture
async def probe_client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    app.include_router(probe)
    async with AsyncClient(
        transport=ASGITransport(app=app, client=("127.0.0.1", 40000)), base_url=API_URL
    ) as client:
        yield client


async def logged_in(client: AsyncClient) -> str:
    response = await login(client)
    assert response.status_code == 200
    token: str = response.json()["csrf_token"]
    return token


async def test_reads_need_a_live_session(probe_client: AsyncClient, admin: int) -> None:
    name = "__Host-combo_admin"
    for headers in ({}, {"Cookie": f"{name}=unknown-token"}):
        response = await probe_client.get("/probe", headers=headers)
        assert response.status_code == 401
        assert response.json() == {"detail": "not_authenticated"}

    csrf_token = await logged_in(probe_client)
    token = probe_client.cookies[name]
    response = await probe_client.get("/probe")
    assert response.status_code == 200
    assert response.json() == {"id": admin, "username": USERNAME}

    await probe_client.post("/admin/logout", headers=write_headers(csrf_token))
    probe_client.cookies.clear()
    logged_out = await probe_client.get("/probe", headers={"Cookie": f"{name}={token}"})
    assert logged_out.status_code == 401


async def test_writes_need_origin_and_csrf_token(
    probe_client: AsyncClient, clients: ClientFactory, admin: int
) -> None:
    assert (await probe_client.post("/probe", headers=write_headers("x"))).status_code == 401
    csrf_token = await logged_in(probe_client)
    other_token = await logged_in(clients("127.0.0.2"))

    ok = await probe_client.post("/probe", headers=write_headers(csrf_token))
    assert ok.status_code == 200
    assert ok.json() == {"id": admin, "username": USERNAME}

    for headers, code in [
        ({"Origin": ADMIN_ORIGIN}, "csrf_failed"),
        (write_headers("wrong"), "csrf_failed"),
        (write_headers(other_token), "csrf_failed"),
        ({"X-CSRF-Token": csrf_token}, "origin_not_allowed"),
        ({"Origin": "https://evil.example.test", "X-CSRF-Token": csrf_token}, "origin_not_allowed"),
    ]:
        response = await probe_client.post("/probe", headers=headers)
        assert response.status_code == 403
        assert response.json() == {"detail": code}


async def test_idle_and_absolute_lifetimes(
    probe_client: AsyncClient, admin: int, fake_clock: Clock
) -> None:
    await logged_in(probe_client)
    fake_clock.advance(minutes=59)
    assert (await probe_client.get("/probe")).status_code == 200
    fake_clock.advance(minutes=59)
    assert (await probe_client.get("/probe")).status_code == 200
    fake_clock.advance(minutes=61)
    assert (await probe_client.get("/probe")).status_code == 401

    await logged_in(probe_client)
    for _ in range(12 * 60 // 30 - 1):
        fake_clock.advance(minutes=30)
        assert (await probe_client.get("/probe")).status_code == 200
    fake_clock.advance(minutes=30)
    assert (await probe_client.get("/probe")).status_code == 401


async def test_disabled_admin_session_stops_at_once(
    probe_client: AsyncClient, admin: int, db_session: AsyncSession
) -> None:
    await logged_in(probe_client)
    await db_session.execute(update(Admin).where(Admin.id == admin).values(active=False))
    assert (await probe_client.get("/probe")).status_code == 401
    assert (await probe_client.get("/admin/me")).status_code == 401


def undocumented(app: FastAPI) -> list[str]:
    """Routes behind `require_admin` that do not declare its 401 and 403 responses."""
    return [
        route.name
        for route in app.routes
        if isinstance(route, APIRoute)
        and depends_on_require_admin(route)
        and not {401, 403} <= set(route.responses)
    ]


def test_every_write_route_requires_an_admin() -> None:
    app = create_app()
    assert unguarded_writes(app) == []
    assert undocumented(app) == []


def test_the_guard_finds_an_unprotected_write() -> None:
    app = create_app()
    app.include_router(probe)

    @app.post("/unprotected")
    async def unprotected_write() -> None:
        return None

    @app.get("/undocumented")
    async def undocumented_read(current: AdminDep) -> None:
        return None

    assert unguarded_writes(app) == ["unprotected_write"]
    assert undocumented(app) == ["undocumented_read"]


async def test_admin_responses_are_not_cached(
    probe_client: AsyncClient, admin: int, clients: Callable[[str], AsyncClient]
) -> None:
    anonymous = clients("127.0.0.3")
    responses = [
        await anonymous.get("/probe"),
        await anonymous.get("/admin/me"),
        await login(anonymous, password="wrong"),
    ]
    csrf_token = await logged_in(probe_client)
    responses += [
        await probe_client.get("/probe"),
        await probe_client.post("/probe", headers=write_headers(csrf_token)),
        await probe_client.post("/probe", headers={"Origin": ADMIN_ORIGIN}),
        await probe_client.get("/admin/me"),
        await login(probe_client),
        await probe_client.post("/admin/logout", headers={"Origin": ADMIN_ORIGIN}),
    ]
    for response in responses:
        assert response.headers.get("cache-control") == "no-store", response.request.url
