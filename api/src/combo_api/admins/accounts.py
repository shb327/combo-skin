"""Admin account changes, used by the command line tool. No HTTP route reaches these."""

import logging
import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock, passwords, sessions
from combo_api.admins.models import USERNAME_PATTERN, Admin
from combo_api.settings import Settings

logger = logging.getLogger("combo_api.admins")


class AccountError(Exception):
    """A refused account change. The message never contains a password."""


@dataclass(frozen=True)
class Summary:
    username: str
    active: bool
    created_at: datetime
    last_login_at: datetime | None
    live_sessions: int


def check_username(username: str) -> str:
    if not re.fullmatch(USERNAME_PATTERN, username):
        raise AccountError(
            "A username is 3 to 32 characters: lowercase letters, digits, '.', '-' and '_'."
        )
    return username


async def find(db: AsyncSession, username: str) -> Admin | None:
    admin: Admin | None = await db.scalar(
        select(Admin).where(Admin.username == username.casefold())
    )
    return admin


async def get(db: AsyncSession, username: str) -> Admin:
    admin = await find(db, username)
    if admin is None:
        raise AccountError(f"No admin is called {username!r}.")
    return admin


async def create(db: AsyncSession, username: str, password: str) -> Admin:
    username = check_username(username.lower())
    if await find(db, username) is not None:
        raise AccountError(f"An admin called {username!r} already exists.")
    now = clock.now()
    admin = Admin(
        username=username,
        password_hash=passwords.hash_password(password),
        password_changed_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(admin)
    await db.commit()
    logger.info("admin created username=%s", username)
    return admin


async def set_password(db: AsyncSession, admin: Admin, password: str, settings: Settings) -> int:
    ended = await sessions.end_all(db, admin, settings)
    now = clock.now()
    admin.password_hash = passwords.hash_password(password)
    admin.password_changed_at = now
    admin.updated_at = now
    await db.commit()
    logger.info("admin password changed username=%s sessions_ended=%d", admin.username, ended)
    return ended


async def disable(db: AsyncSession, admin: Admin, settings: Settings) -> int:
    ended = await sessions.end_all(db, admin, settings)
    admin.active = False
    admin.updated_at = clock.now()
    await db.commit()
    logger.info("admin disabled username=%s sessions_ended=%d", admin.username, ended)
    return ended


async def enable(db: AsyncSession, admin: Admin) -> None:
    admin.active = True
    admin.updated_at = clock.now()
    await db.commit()
    logger.info("admin enabled username=%s", admin.username)


async def summaries(db: AsyncSession, settings: Settings) -> list[Summary]:
    counts = await sessions.live_counts(db, settings)
    admins = await db.scalars(select(Admin).order_by(Admin.username))
    return [
        Summary(
            username=admin.username,
            active=admin.active,
            created_at=admin.created_at,
            last_login_at=admin.last_login_at,
            live_sessions=counts.get(admin.id, 0),
        )
        for admin in admins
    ]
