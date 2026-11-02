from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins.models import Admin

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 2, 12, tzinfo=UTC)


def admin(username: str) -> Admin:
    return Admin(
        username=username,
        password_hash="placeholder-hash",
        password_changed_at=NOW,
        created_at=NOW,
        updated_at=NOW,
    )


@pytest.mark.parametrize("username", ["AB", "a", "a" * 33, "a b", "ä", "ab", "Admin1"])
async def test_username_rule_is_enforced(db_session: AsyncSession, username: str) -> None:
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(admin(username))


@pytest.mark.parametrize("username", ["abc", "a" * 32, "first.admin", "x-y_z", "007"])
async def test_valid_usernames_are_stored(db_session: AsyncSession, username: str) -> None:
    async with db_session.begin_nested():
        db_session.add(admin(username))


async def test_usernames_are_unique(db_session: AsyncSession) -> None:
    async with db_session.begin_nested():
        db_session.add(admin("placeholder"))
    with pytest.raises(IntegrityError):
        async with db_session.begin_nested():
            db_session.add(admin("placeholder"))
