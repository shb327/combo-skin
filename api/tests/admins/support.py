"""Helpers for admin tests. Every username and password here is a placeholder."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response

from combo_api.admins import passwords
from tests.support import ADMIN_ORIGIN

USERNAME = "placeholder-admin"
PASSWORD = "placeholder password for tests"
OTHER_USERNAME = "second-admin"
OTHER_PASSWORD = "another placeholder password"


class Clock:
    """A clock the tests move by hand."""

    def __init__(self) -> None:
        self.time = datetime.now(UTC) + timedelta(seconds=1)

    def __call__(self) -> datetime:
        return self.time

    def advance(self, **delta: float) -> None:
        self.time += timedelta(**delta)


class CountingHasher:
    """Wraps the real hasher and counts Argon2 verifications."""

    def __init__(self, hasher: Any) -> None:
        self.hasher = hasher
        self.verifications = 0

    def verify(self, stored_hash: str, password: str) -> bool:
        self.verifications += 1
        result: bool = self.hasher.verify(stored_hash, password)
        return result

    def __getattr__(self, name: str) -> Any:
        return getattr(self.hasher, name)


@contextmanager
def counting_hasher(monkeypatch: pytest.MonkeyPatch) -> Iterator[CountingHasher]:
    spy = CountingHasher(passwords.HASHER)
    monkeypatch.setattr(passwords, "HASHER", spy)
    yield spy


async def login(
    client: AsyncClient,
    username: str = USERNAME,
    password: str = PASSWORD,
    **headers: str,
) -> Response:
    return await client.post(
        "/admin/login",
        json={"username": username, "password": password},
        headers={"Origin": ADMIN_ORIGIN, **headers},
    )


def write_headers(csrf_token: str) -> dict[str, str]:
    return {"Origin": ADMIN_ORIGIN, "X-CSRF-Token": csrf_token}


ClientFactory = Callable[[str], AsyncClient]
