import logging

import pytest
from fastapi import APIRouter, FastAPI
from httpx import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import limits, sessions
from combo_api.admins.deps import AdminDep
from combo_api.admins.models import Admin
from combo_api.settings import Settings
from tests.admins.support import PASSWORD, USERNAME, ClientFactory, login, write_headers
from tests.admins.test_cli import NEW_PASSWORD, run
from tests.support import ADMIN_ORIGIN

pytestmark = pytest.mark.anyio

probe = APIRouter()


@probe.post("/probe-write")
async def probe_write(current: AdminDep) -> dict[str, str]:
    return {"username": current.username}


def later_csrf(responses: list[Response]) -> list[str]:
    """CSRF tokens handed out by the logins of the flow."""
    return [
        r.json()["csrf_token"]
        for r in responses
        if r.request.url.path == "/admin/login" and r.status_code == 200
    ]


def messages(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [record.getMessage() for record in caplog.records]


async def test_no_secret_leaves_the_api(
    app: FastAPI,
    clients: ClientFactory,
    db_session: AsyncSession,
    test_settings: Settings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.DEBUG, logger="combo_api")
    app.include_router(probe)
    client = clients("10.6.0.1")
    responses: list[Response] = []

    await run(db_session, test_settings, "create", USERNAME, entries=[PASSWORD] * 2)
    row = await db_session.scalar(select(Admin).where(Admin.username == USERNAME))
    assert row is not None
    hashes = [row.password_hash]
    responses.append(await login(client, USERNAME, "a wrong placeholder password"))
    logged_in = await login(client)
    responses.append(logged_in)
    session_token = client.cookies[sessions.cookie_name(test_settings)]
    csrf_token = logged_in.json()["csrf_token"]
    responses.append(await client.get("/admin/me"))
    responses.append(await client.post("/probe-write", headers=write_headers(csrf_token)))
    responses.append(await client.post("/probe-write", headers={"Origin": ADMIN_ORIGIN}))
    responses.append(await client.post("/admin/logout", headers=write_headers(csrf_token)))
    await run(db_session, test_settings, "disable", USERNAME)
    await run(db_session, test_settings, "enable", USERNAME)
    await run(db_session, test_settings, "set-password", USERNAME, entries=[NEW_PASSWORD] * 2)
    hashes.append(row.password_hash)
    assert hashes[0] != hashes[1]
    responses.append(await login(client, password=NEW_PASSWORD))
    await run(db_session, test_settings, "list")

    output = capsys.readouterr()
    logs = "\n".join(messages(caplog))
    secrets = [PASSWORD, NEW_PASSWORD, *hashes, session_token, csrf_token]
    for secret in secrets:
        assert secret not in logs
        assert secret not in output.out + output.err

    for response in responses:
        body = response.text
        headers = "\n".join(
            f"{name}: {value}"
            for name, value in response.headers.multi_items()
            if not (response is logged_in and name == "set-cookie")
        )
        for secret in [PASSWORD, NEW_PASSWORD, *hashes, session_token]:
            assert secret not in body
            assert secret not in headers
        if response.request.url.path not in ("/admin/login", "/admin/me"):
            assert csrf_token not in body
            assert not any(token in body for token in later_csrf(responses))
        assert csrf_token not in headers
    assert session_token in logged_in.headers["set-cookie"]


async def test_unknown_usernames_are_not_logged(
    clients: ClientFactory, admin: int, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="combo_api")
    typed = "My Password Typed Here 2026"
    await login(clients("10.7.0.1"), typed, PASSWORD)
    assert all(typed not in message for message in messages(caplog))
    failed = [r for r in caplog.records if "reason=unknown_username" in r.getMessage()]
    assert [(r.levelname, r.getMessage()) for r in failed] == [
        ("WARNING", "admin login failed reason=unknown_username ip=10.7.0.1")
    ]
    for attempt in range(limits.USERNAME_LIMIT):
        await login(clients(f"10.7.1.{attempt}"), typed, PASSWORD)
    await login(clients("10.7.2.1"), typed, PASSWORD)
    assert all(typed not in message for message in messages(caplog))
    assert "admin login rate limited limit=username ip=10.7.2.1" in messages(caplog)


async def test_log_events(
    app: FastAPI,
    clients: ClientFactory,
    db_session: AsyncSession,
    test_settings: Settings,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="combo_api.admins")
    await run(db_session, test_settings, "create", USERNAME, entries=[PASSWORD] * 2)
    client = clients("10.8.0.1")
    await login(client, USERNAME, "a wrong placeholder password")
    csrf_token = (await login(client)).json()["csrf_token"]
    await client.post("/admin/logout", headers=write_headers(csrf_token))
    await login(client)
    await run(db_session, test_settings, "disable", USERNAME)
    await login(client)
    await run(db_session, test_settings, "enable", USERNAME)
    await run(db_session, test_settings, "set-password", USERNAME, entries=[NEW_PASSWORD] * 2)
    for _ in range(limits.IP_LIMIT):
        await login(clients("10.8.0.2"), USERNAME, "a wrong placeholder password")
    await login(clients("10.8.0.2"), USERNAME, "a wrong placeholder password")
    for attempt in range(limits.USERNAME_LIMIT):
        await login(clients(f"10.8.1.{attempt}"), USERNAME, "a wrong placeholder password")
    await login(clients("10.8.2.1"), USERNAME, NEW_PASSWORD)

    records = [r for r in caplog.records if r.name == "combo_api.admins"]
    found = {(r.levelname, r.getMessage()) for r in records}
    expected = {
        ("INFO", f"admin created username={USERNAME}"),
        ("WARNING", f"admin login failed reason=wrong_password ip=10.8.0.1 username={USERNAME}"),
        ("INFO", f"admin login succeeded username={USERNAME} ip=10.8.0.1"),
        ("INFO", f"admin logout username={USERNAME} ip=10.8.0.1"),
        ("INFO", f"admin disabled username={USERNAME} sessions_ended=1"),
        ("WARNING", f"admin login failed reason=disabled ip=10.8.0.1 username={USERNAME}"),
        ("INFO", f"admin enabled username={USERNAME}"),
        ("INFO", f"admin password changed username={USERNAME} sessions_ended=0"),
        ("WARNING", f"admin login rate limited limit=ip ip=10.8.0.2 username={USERNAME}"),
        ("WARNING", f"admin login rate limited limit=username ip=10.8.2.1 username={USERNAME}"),
    }
    assert expected <= found, sorted(expected - found)
