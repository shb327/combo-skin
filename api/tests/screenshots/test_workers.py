import hashlib
import logging
import re
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.screenshots.models import Worker
from tests.admins.support import USERNAME, ClientFactory, Clock
from tests.combos.support import logged_in
from tests.screenshots.workers import bearer, make_worker
from tests.support import ADMIN_ORIGIN

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

TOKEN = re.compile(r"^csw_[A-Za-z0-9_-]{43}$")
JOB = "zzzzzzzzzzzz"
# Every worker route: method, path, JSON body.
WORKER_ROUTES: list[tuple[str, str, Any]] = [
    ("GET", "/worker/me", None),
    ("POST", "/worker/jobs/claim", None),
    ("PUT", f"/worker/jobs/{JOB}/screenshot", None),
    ("POST", f"/worker/jobs/{JOB}/fail", {"reason": "render_failed"}),
    ("POST", f"/worker/jobs/{JOB}/release", {"reason": "shutting_down"}),
]


async def send(client: AsyncClient, route: tuple[str, str, Any], headers: dict[str, str]) -> Any:
    method, path, body = route
    if method == "PUT":
        headers = {**headers, "Content-Type": "image/png"}
        return await client.request(method, path, content=b"", headers=headers)
    return await client.request(method, path, json=body, headers=headers)


async def test_token_is_shown_once_and_stored_as_a_digest(
    admin_client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await logged_in(admin_client)
    worker, token = await make_worker(admin_client, headers)
    assert TOKEN.fullmatch(token)
    assert worker["name"] == "render-box-1"
    assert worker["created_by"] == USERNAME
    assert worker["revoked_at"] is None
    assert worker["last_seen_at"] is None
    assert set(worker) == {"id", "name", "created_at", "created_by", "last_seen_at", "revoked_at"}

    listed = await admin_client.get("/admin/workers")
    assert listed.status_code == 200
    assert listed.json() == [worker]
    assert token not in listed.text
    assert token[4:] not in listed.text

    row = await db_session.scalar(select(Worker).where(Worker.id == worker["id"]))
    assert row is not None
    assert row.token_digest == hashlib.sha256(token.encode()).digest()
    assert len(row.token_digest) == 32
    dumped = repr({c: getattr(row, c) for c in Worker.__table__.columns.keys()})  # noqa: SIM118
    assert token not in dumped and token[4:] not in dumped

    again = await admin_client.post(
        "/admin/workers", json={"name": "render-box-1"}, headers=headers
    )
    assert again.status_code == 409
    assert again.json() == {"detail": "worker_exists"}


@pytest.mark.parametrize("name", ["", " ", "x" * 65, "tab\there"])
async def test_worker_names_are_checked(admin_client: AsyncClient, name: str) -> None:
    headers = await logged_in(admin_client)
    response = await admin_client.post("/admin/workers", json={"name": name}, headers=headers)
    assert response.status_code == 422


async def test_names_are_trimmed(admin_client: AsyncClient) -> None:
    headers = await logged_in(admin_client)
    worker, _ = await make_worker(admin_client, headers, "  render box  ")
    assert worker["name"] == "render box"


async def test_worker_reads_its_name_until_revoked(
    admin_client: AsyncClient, clients: ClientFactory, fake_clock: Clock
) -> None:
    headers = await logged_in(admin_client)
    worker, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.5")
    me = await box.get("/worker/me", headers=bearer(token))
    assert me.status_code == 200
    assert me.json() == {"name": "render-box-1"}
    seen = (await admin_client.get("/admin/workers")).json()[0]["last_seen_at"]
    assert seen is not None

    fake_clock.advance(seconds=30)
    await box.get("/worker/me", headers=bearer(token))
    assert (await admin_client.get("/admin/workers")).json()[0]["last_seen_at"] == seen
    fake_clock.advance(seconds=31)
    await box.get("/worker/me", headers=bearer(token))
    assert (await admin_client.get("/admin/workers")).json()[0]["last_seen_at"] != seen

    revoked = await admin_client.post(f"/admin/workers/{worker['id']}/revoke", headers=headers)
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None
    for route in WORKER_ROUTES:
        response = await send(box, route, bearer(token))
        assert response.status_code == 401, route
        assert response.json() == {"detail": "not_authenticated"}

    missing = await admin_client.post("/admin/workers/999999/revoke", headers=headers)
    assert missing.status_code == 404
    assert missing.json() == {"detail": "worker_not_found"}


async def test_bad_tokens_are_refused_and_logged_without_the_token(
    admin_client: AsyncClient, clients: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.7")
    unknown = "csw_" + "A" * 43
    for sent in (
        {},
        {"Authorization": "Bearer"},
        {"Authorization": f"Basic {token}"},
        bearer("csw_short"),
        bearer(token + "x"),
        bearer(unknown),
    ):
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="combo_api.screenshots"):
            response = await box.get("/worker/me", headers=sent)
        assert response.status_code == 401, sent
        assert response.json() == {"detail": "not_authenticated"}
        assert response.headers["www-authenticate"] == "Bearer"
        lines = [r.getMessage() for r in caplog.records]
        assert lines == ["screenshot token refused ip=10.0.0.7"], sent
        assert token not in caplog.text and unknown not in caplog.text


async def test_tokens_and_sessions_stay_on_their_own_routes(
    admin_client: AsyncClient, clients: ClientFactory, app: Any
) -> None:
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.8")

    from tests.combos.test_guard import ROUTES
    from tests.combos.test_guard import send as send_admin

    admin_routes: list[tuple[str, str, dict[str, Any], Any]] = [
        *ROUTES,
        ("GET", "/admin/me", {}, None),
        ("GET", "/admin/workers", {}, None),
        ("POST", "/admin/workers", {}, {"name": "x"}),
        ("POST", "/admin/workers/1/revoke", {}, None),
        ("POST", "/admin/screenshots/request", {}, {"ids": [JOB]}),
    ]
    for admin_route in admin_routes:
        response = await send_admin(box, admin_route, bearer(token))
        assert response.status_code == 401, admin_route
        assert response.json() == {"detail": "not_authenticated"}

    # The admin's session cookie, CSRF token and origin open no worker route.
    for route in WORKER_ROUTES:
        response = await send(admin_client, route, {"X-CSRF-Token": headers["X-CSRF-Token"]})
        assert response.status_code == 401, route
        assert response.json() == {"detail": "not_authenticated"}

    for origin in (ADMIN_ORIGIN, "https://evil.example.test", "null"):
        for route in WORKER_ROUTES:
            response = await send(box, route, {**bearer(token), "Origin": origin})
            assert response.status_code == 403, (route, origin)
            assert response.json() == {"detail": "origin_not_allowed"}
            assert "access-control-allow-origin" not in response.headers
            assert response.headers["cache-control"] == "no-store"

    preflight = await box.options(
        "/worker/me",
        headers={"Origin": ADMIN_ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in preflight.headers

    responses = [await send(box, route, bearer(token)) for route in WORKER_ROUTES]
    responses.append(await box.get("/worker/me"))
    for response in responses:
        assert response.headers["cache-control"] == "no-store", response.request.url
        assert "access-control-allow-origin" not in response.headers


async def test_a_malformed_body_does_not_skip_the_worker_checks(
    admin_client: AsyncClient, clients: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """FastAPI decodes the body before the dependencies run: the Origin and token checks run
    for a body it refuses too."""
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.9")
    for path in (f"/worker/jobs/{JOB}/fail", f"/worker/jobs/{JOB}/release"):
        for sent, status, code in (
            ({**bearer(token), "Origin": ADMIN_ORIGIN}, 403, "origin_not_allowed"),
            ({}, 401, "not_authenticated"),
            (bearer("csw_short"), 401, "not_authenticated"),
        ):
            caplog.clear()
            with caplog.at_level(logging.INFO, logger="combo_api.screenshots"):
                response = await box.post(
                    path, content=b"{not json", headers={**sent, "Content-Type": "application/json"}
                )
            assert response.status_code == status, (path, sent)
            assert response.json() == {"detail": code}
            assert response.headers["cache-control"] == "no-store"
            assert "access-control-allow-origin" not in response.headers
            if status == 401:
                assert [r.getMessage() for r in caplog.records] == [
                    "screenshot token refused ip=10.0.0.9"
                ]
        # A valid token with a bad body gets the validation error.
        response = await box.post(path, json={"reason": "nope"}, headers=bearer(token))
        assert response.status_code == 422
