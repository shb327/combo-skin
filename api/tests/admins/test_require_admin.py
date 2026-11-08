from collections.abc import AsyncIterator, Callable
from typing import Any

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.routing import RouteContext, iter_route_contexts
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins.deps import ADMIN_RESPONSES, AdminDep, require_admin
from combo_api.admins.models import Admin
from combo_api.main import create_app
from combo_api.screenshots.workers import (
    WORKER_RESPONSES,
    WorkerDep,
    is_worker_path,
    require_worker,
)
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
# Admin routes that work without a session, or that check it themselves.
OPEN_ADMIN_ROUTES = {"admin_login", "admin_logout", "admin_me"}

probe = APIRouter(prefix="/probe")


@probe.get("", responses=ADMIN_RESPONSES)
async def probe_read(current: AdminDep) -> dict[str, Any]:
    return {"id": current.id, "username": current.username}


@probe.post("", responses=ADMIN_RESPONSES)
async def probe_write(current: AdminDep) -> dict[str, Any]:
    return {"id": current.id, "username": current.username}


def api_routes(app: FastAPI) -> list[RouteContext]:
    """Every route as the app serves it: included routers expanded, with their prefixes,
    dependencies and responses."""
    return [route for route in iter_route_contexts(app.routes) if route.path is not None]


def depends_on(route: RouteContext, call: Any) -> bool:
    pending = list(route.dependant.dependencies)
    while pending:
        dependant = pending.pop()
        if dependant.call is call:
            return True
        pending.extend(dependant.dependencies)
    return False


def depends_on_require_admin(route: RouteContext) -> bool:
    return depends_on(route, require_admin)


def unguarded_writes(app: FastAPI) -> list[str]:
    """Write routes that depend on neither `require_admin` nor `require_worker`."""
    return [
        str(route.name)
        for route in api_routes(app)
        if set(route.methods or ()) & WRITES
        and route.name not in UNGUARDED
        and not depends_on_require_admin(route)
        and not depends_on(route, require_worker)
    ]


def misguarded_worker_routes(app: FastAPI) -> list[str]:
    """Routes under /worker/ without `require_worker` or with `require_admin`, and routes
    elsewhere that depend on `require_worker`."""
    found = []
    for route in api_routes(app):
        worker = depends_on(route, require_worker)
        if is_worker_path(route.path or ""):
            if not worker or depends_on_require_admin(route):
                found.append(str(route.name))
        elif worker:
            found.append(str(route.name))
    return found


def unguarded_admin_routes(app: FastAPI) -> list[str]:
    """Routes under /admin/, whatever their method, that do not depend on `require_admin`."""
    return [
        str(route.name)
        for route in api_routes(app)
        if (route.path or "").startswith("/admin/")
        and route.name not in OPEN_ADMIN_ROUTES
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

    logout = await probe_client.post("/admin/logout", headers=write_headers(csrf_token))
    assert logout.status_code == 204
    probe_client.cookies.clear()
    logged_out = await probe_client.get("/probe", headers={"Cookie": f"{name}={token}"})
    assert logged_out.status_code == 401
    assert logged_out.json() == {"detail": "not_authenticated"}


async def test_writes_need_origin_and_csrf_token(
    probe_client: AsyncClient, clients: ClientFactory, admin: int
) -> None:
    for headers in (
        write_headers("x"),
        {"Origin": "https://evil.example.test", "X-CSRF-Token": "x"},
        {},
    ):
        response = await probe_client.post("/probe", headers=headers)
        assert response.status_code == 401, headers
        assert response.json() == {"detail": "not_authenticated"}
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
        str(route.name)
        for route in api_routes(app)
        if depends_on_require_admin(route) and not {401, 403} <= set(route.responses)
    ]


def test_every_write_route_requires_an_admin() -> None:
    app = create_app()
    assert unguarded_writes(app) == []
    assert unguarded_admin_routes(app) == []
    assert undocumented(app) == []
    assert misguarded_worker_routes(app) == []
    # The checks see every route, not only those added to the app directly.
    names = {route.name for route in api_routes(app)}
    assert {"create_combo", "create_worker", "claim_job", "put_screenshot", "admin_login"} <= names
    worker_paths = {r.path for r in api_routes(app) if depends_on(r, require_worker)}
    assert worker_paths == {
        "/worker/me",
        "/worker/jobs/claim",
        "/worker/jobs/{job_id}/screenshot",
        "/worker/jobs/{job_id}/fail",
        "/worker/jobs/{job_id}/release",
    }


def test_the_guard_finds_an_unprotected_write() -> None:
    app = create_app()
    app.include_router(probe)

    @app.post("/unprotected")
    async def unprotected_write() -> None:
        return None

    @app.get("/undocumented")
    async def undocumented_read(current: AdminDep) -> None:
        return None

    @app.get("/admin/probe")
    async def unprotected_admin_read() -> None:
        return None

    assert unguarded_writes(app) == ["unprotected_write"]
    assert unguarded_admin_routes(app) == ["unprotected_admin_read"]
    assert undocumented(app) == ["undocumented_read"]


def test_the_guard_finds_misused_worker_routes() -> None:
    app = create_app()

    @app.get("/worker/open")
    async def open_worker_read() -> None:
        return None

    @app.get("/worker")
    async def bare_worker_path() -> None:
        return None

    @app.post("/worker/admin", responses={**ADMIN_RESPONSES, **WORKER_RESPONSES})
    async def worker_route_for_admins(current: AdminDep, worker: WorkerDep) -> None:
        return None

    @app.get("/elsewhere", responses=WORKER_RESPONSES)
    async def worker_token_elsewhere(worker: WorkerDep) -> None:
        return None

    @app.put("/unguarded")
    async def write_without_either() -> None:
        return None

    assert misguarded_worker_routes(app) == [
        "open_worker_read",
        "bare_worker_path",
        "worker_route_for_admins",
        "worker_token_elsewhere",
    ]
    assert unguarded_writes(app) == ["write_without_either"]


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
        await probe_client.post("/admin/logout", headers={"Origin": ADMIN_ORIGIN}),
    ]
    again = await login(probe_client)
    logout = await probe_client.post(
        "/admin/logout", headers=write_headers(again.json()["csrf_token"])
    )
    assert logout.status_code == 204
    responses += [again, logout]
    for response in responses:
        assert response.headers.get("cache-control") == "no-store", response.request.url
