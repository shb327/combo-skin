import statistics
import time
from datetime import datetime

import pytest
from argon2 import PasswordHasher, profiles
from httpx import AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import passwords
from combo_api.admins.models import Admin, AdminSession
from tests.admins.support import (
    OTHER_PASSWORD,
    OTHER_USERNAME,
    PASSWORD,
    USERNAME,
    ClientFactory,
    counting_hasher,
    login,
    write_headers,
)
from tests.support import ADMIN_ORIGIN

pytestmark = pytest.mark.anyio


def session_cookie(response: Response) -> tuple[str, str]:
    cookies = response.headers.get_list("set-cookie")
    assert len(cookies) == 1
    name, value = cookies[0].split(";", 1)[0].split("=", 1)
    return name, value


async def disable(db_session: AsyncSession, username: str) -> None:
    await db_session.execute(update(Admin).where(Admin.username == username).values(active=False))


async def test_login_starts_a_session(
    admin_client: AsyncClient, admin: int, db_session: AsyncSession
) -> None:
    response = await login(admin_client)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"admin", "csrf_token", "expires_at"}
    assert body["admin"] == {"username": USERNAME}
    assert len(body["csrf_token"]) >= 43
    datetime.fromisoformat(body["expires_at"])
    session_cookie(response)

    me = await admin_client.get("/admin/me")
    assert me.status_code == 200
    assert me.json() == body
    row = await db_session.get(Admin, admin)
    assert row is not None and row.last_login_at is not None


async def test_failures_look_the_same(
    clients: ClientFactory,
    admin: int,
    other_admin: int,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await disable(db_session, OTHER_USERNAME)
    responses = []
    with counting_hasher(monkeypatch) as spy:
        for ip, username, password in [
            ("10.0.0.1", "nobody-here", PASSWORD),
            ("10.0.0.2", USERNAME, PASSWORD + " but wrong"),
            ("10.0.0.3", OTHER_USERNAME, OTHER_PASSWORD),
        ]:
            before = spy.verifications
            response = await login(clients(ip), username, password)
            assert spy.verifications - before == 1
            responses.append(response)
    first = responses[0]
    assert first.status_code == 401
    assert first.json() == {"detail": "invalid_credentials"}
    for response in responses[1:]:
        assert response.status_code == first.status_code
        assert response.content == first.content
        assert response.headers.multi_items() == first.headers.multi_items()


async def test_failures_take_similar_time(
    clients: ClientFactory, admin: int, other_admin: int, db_session: AsyncSession
) -> None:
    await disable(db_session, OTHER_USERNAME)
    cases = {
        "unknown": ("nobody-here", PASSWORD),
        "wrong": (USERNAME, PASSWORD + " but wrong"),
        "disabled": (OTHER_USERNAME, OTHER_PASSWORD),
    }
    medians = {}
    for index, (case, (username, password)) in enumerate(cases.items()):
        timings = []
        for attempt in range(5):
            client = clients(f"10.1.{index}.{attempt}")
            start = time.perf_counter()
            response = await login(client, username, password)
            timings.append(time.perf_counter() - start)
            assert response.status_code == 401
        medians[case] = statistics.median(timings)
    assert max(medians.values()) < 1.5 * min(medians.values()), medians


async def test_username_is_case_insensitive_and_sessions_are_new(
    admin_client: AsyncClient, clients: ClientFactory, admin: int
) -> None:
    first = await login(admin_client, USERNAME.upper())
    assert first.status_code == 200
    _, first_token = session_cookie(first)

    second = await login(clients("127.0.0.2"))
    _, second_token = session_cookie(second)
    assert first_token != second_token

    # A login that already carries a live session cookie still gets a new one.
    again = await login(admin_client)
    _, again_token = session_cookie(again)
    assert again_token != first_token
    assert again.json()["csrf_token"] != first.json()["csrf_token"]


@pytest.mark.parametrize(
    "headers",
    [{"Origin": "https://evil.example.test"}, {"Origin": "null"}, {}],
    ids=["other", "null", "missing"],
)
async def test_login_needs_an_allowed_origin(
    admin_client: AsyncClient, admin: int, db_session: AsyncSession, headers: dict[str, str]
) -> None:
    response = await admin_client.post(
        "/admin/login", json={"username": USERNAME, "password": PASSWORD}, headers=headers
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "origin_not_allowed"}
    assert "set-cookie" not in response.headers
    assert (await db_session.scalars(select(AdminSession))).all() == []


@pytest.mark.parametrize("content_type", ["text/plain", None])
async def test_login_needs_json(
    admin_client: AsyncClient, admin: int, db_session: AsyncSession, content_type: str | None
) -> None:
    request = admin_client.build_request(
        "POST",
        "/admin/login",
        content=f'{{"username": "{USERNAME}", "password": "{PASSWORD}"}}',
        headers={"Origin": ADMIN_ORIGIN},
    )
    request.headers.pop("content-type", None)
    if content_type:
        request.headers["content-type"] = content_type
    response = await admin_client.send(request)
    assert response.status_code == 415
    assert response.json() == {"detail": "unsupported_media_type"}
    assert (await db_session.scalars(select(AdminSession))).all() == []


async def test_validation_errors_do_not_echo_input(admin_client: AsyncClient) -> None:
    long_password = "secret-looking-" + "p" * 2000
    too_long = await login(admin_client, USERNAME, long_password)
    missing = await admin_client.post(
        "/admin/login", json={"username": USERNAME}, headers={"Origin": ADMIN_ORIGIN}
    )
    for response in (too_long, missing):
        assert response.status_code == 422
        assert long_password not in response.text
        for error in response.json()["detail"]:
            assert set(error) == {"loc", "msg", "type"}


async def test_logout_ends_the_session(admin_client: AsyncClient, admin: int) -> None:
    csrf_token = (await login(admin_client)).json()["csrf_token"]

    wrong = await admin_client.post("/admin/logout", headers=write_headers("wrong"))
    assert wrong.status_code == 403
    assert wrong.json() == {"detail": "csrf_failed"}
    assert (await admin_client.get("/admin/me")).status_code == 200

    response = await admin_client.post("/admin/logout", headers=write_headers(csrf_token))
    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert (await admin_client.get("/admin/me")).status_code == 401


async def test_logout_without_a_session(admin_client: AsyncClient) -> None:
    response = await admin_client.post("/admin/logout", headers={"Origin": ADMIN_ORIGIN})
    assert response.status_code == 204
    disallowed = await admin_client.post(
        "/admin/logout", headers={"Origin": "https://evil.example.test"}
    )
    assert disallowed.status_code == 403
    assert disallowed.json() == {"detail": "origin_not_allowed"}


async def test_weak_hash_is_replaced_at_login(
    admin_client: AsyncClient, admin: int, db_session: AsyncSession
) -> None:
    weak = PasswordHasher.from_parameters(profiles.CHEAPEST).hash(passwords.normalise(PASSWORD))
    await db_session.execute(update(Admin).where(Admin.id == admin).values(password_hash=weak))
    assert (await login(admin_client)).status_code == 200
    row = await db_session.get(Admin, admin)
    assert row is not None
    await db_session.refresh(row)
    assert row.password_hash != weak
    assert not passwords.needs_rehash(row.password_hash)
    assert passwords.verify(row.password_hash, PASSWORD)


async def test_me_without_a_session(admin_client: AsyncClient) -> None:
    response = await admin_client.get("/admin/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "not_authenticated"}


async def test_disabled_admin_cannot_log_in(
    admin_client: AsyncClient, admin: int, db_session: AsyncSession
) -> None:
    await disable(db_session, USERNAME)
    response = await login(admin_client)
    assert response.status_code == 401
    assert response.json() == {"detail": "invalid_credentials"}
