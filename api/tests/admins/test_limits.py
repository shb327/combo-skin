from datetime import timedelta

import anyio
import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from combo_api.admins import limits
from combo_api.admins.models import LoginFailure
from combo_api.main import create_app
from combo_api.settings import Settings
from tests.admins.conftest import API_URL
from tests.admins.support import (
    PASSWORD,
    USERNAME,
    ClientFactory,
    Clock,
    counting_hasher,
    login,
)

pytestmark = pytest.mark.anyio

WRONG = "a wrong placeholder password"


def assert_limited(response: Response) -> None:
    assert response.status_code == 429
    assert response.json() == {"detail": "too_many_attempts"}
    assert 1 <= int(response.headers["retry-after"]) <= 15 * 60


async def test_limit_per_ip(
    clients: ClientFactory, admin: int, fake_clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = clients("10.2.0.1")
    for _ in range(limits.IP_LIMIT):
        assert (await login(client, USERNAME, WRONG)).status_code == 401
    with counting_hasher(monkeypatch) as spy:
        assert_limited(await login(client))
        assert spy.verifications == 0
    assert (await login(clients("10.2.0.2"))).status_code == 200

    fake_clock.advance(minutes=15, seconds=1)
    assert (await login(client)).status_code == 200


async def test_limit_per_username(
    clients: ClientFactory, admin: int, fake_clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    first_of_each = []
    for username in (USERNAME, "nobody-here"):
        for attempt in range(limits.USERNAME_LIMIT):
            client = clients(f"10.3.{len(username)}.{attempt}")
            assert (await login(client, username, WRONG)).status_code == 401
        with counting_hasher(monkeypatch) as spy:
            limited = [
                await login(clients("10.3.255.1"), username, PASSWORD),
                await login(clients("10.3.255.2"), username.upper(), PASSWORD),
            ]
            assert spy.verifications == 0
        for response in limited:
            assert_limited(response)
        assert limited[0].content == limited[1].content
        first_of_each.append(limited[0])
    existing, unknown = first_of_each
    assert existing.content == unknown.content
    assert [k for k, _ in existing.headers.multi_items()] == [
        k for k, _ in unknown.headers.multi_items()
    ]
    fake_clock.advance(minutes=16)
    assert (await login(clients("10.3.255.3"))).status_code == 200


async def test_limit_holds_under_concurrent_requests(
    test_settings: Settings, engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    username = "concurrent-probe"
    digest = limits.username_digest(username)
    app = create_app(settings=test_settings)
    statuses: list[int] = []
    try:
        async with (
            app.router.lifespan_context(app),
            AsyncClient(
                transport=ASGITransport(app=app, client=("10.4.0.1", 40000)), base_url=API_URL
            ) as client,
        ):
            with counting_hasher(monkeypatch) as spy:

                async def attempt() -> None:
                    statuses.append((await login(client, username, WRONG)).status_code)

                async with anyio.create_task_group() as group:
                    for _ in range(30):
                        group.start_soon(attempt)
            assert spy.verifications <= limits.IP_LIMIT
            assert statuses.count(401) == spy.verifications
            assert statuses.count(429) == 30 - spy.verifications
    finally:
        async with engine.begin() as connection:
            await connection.execute(
                delete(LoginFailure).where(LoginFailure.username_digest == digest)
            )


async def test_failures_store_no_username_and_expire(
    clients: ClientFactory, admin: int, db_session: AsyncSession, fake_clock: Clock
) -> None:
    await login(clients("10.5.0.1"), "typed-into-the-wrong-field", WRONG)
    rows = (await db_session.scalars(select(LoginFailure))).all()
    assert len(rows) == 1
    assert b"typed-into-the-wrong-field" not in rows[0].username_digest
    assert rows[0].username_digest == limits.username_digest("typed-into-the-wrong-field")

    fake_clock.advance(hours=24, seconds=1)
    await login(clients("10.5.0.2"), USERNAME, WRONG)
    remaining = await db_session.scalar(select(func.count()).select_from(LoginFailure))
    assert remaining == 1
    created = await db_session.scalar(select(LoginFailure.created_at))
    assert created is not None
    assert fake_clock() - created < timedelta(minutes=1)
