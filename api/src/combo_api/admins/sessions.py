"""Server-side login sessions: an opaque token in a cookie, a digest of it in the database."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.models import Admin, AdminSession
from combo_api.settings import Settings

# The __Host- prefix makes browsers insist on Secure, Path=/ and no Domain.
SECURE_COOKIE = "__Host-combo_admin"
PLAIN_COOKIE = "combo_admin"
TOKEN_BYTES = 32
# last_seen_at is written at most this often per session.
TOUCH_INTERVAL = timedelta(minutes=1)


@dataclass(frozen=True)
class LiveSession:
    row: AdminSession
    admin: Admin


def cookie_name(settings: Settings) -> str:
    return SECURE_COOKIE if settings.session_cookie_secure else PLAIN_COOKIE


def digest(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def idle_limit(settings: Settings) -> timedelta:
    return timedelta(minutes=settings.session_idle_minutes)


def is_live(row: AdminSession, admin: Admin, settings: Settings, now: datetime) -> bool:
    return (
        admin.active
        and now < row.expires_at
        and now - row.last_seen_at < idle_limit(settings)
        and row.created_at >= admin.password_changed_at
    )


async def start(db: AsyncSession, admin: Admin, settings: Settings) -> tuple[str, AdminSession]:
    """Create a new session and return its token, which is never stored."""
    now = clock.now()
    token = secrets.token_urlsafe(TOKEN_BYTES)
    row = AdminSession(
        admin_id=admin.id,
        token_digest=digest(token),
        csrf_token=secrets.token_urlsafe(TOKEN_BYTES),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_max_hours),
    )
    db.add(row)
    await db.flush()
    return token, row


async def find(
    db: AsyncSession, token: str | None, settings: Settings, *, touch: bool = True
) -> LiveSession | None:
    """The live session for a cookie value, or None. Refreshes its idle time."""
    if not token:
        return None
    found = (
        await db.execute(
            select(AdminSession, Admin)
            .join(Admin, Admin.id == AdminSession.admin_id)
            .where(AdminSession.token_digest == digest(token))
        )
    ).one_or_none()
    if found is None:
        return None
    row, admin = found
    now = clock.now()
    if not is_live(row, admin, settings, now):
        return None
    if touch and now - row.last_seen_at >= TOUCH_INTERVAL:
        row.last_seen_at = now
        await db.commit()
    return LiveSession(row=row, admin=admin)


async def end_all(db: AsyncSession, admin: Admin, settings: Settings) -> int:
    """End every session of an admin; returns how many of them were still usable."""
    rows = (await db.scalars(select(AdminSession).where(AdminSession.admin_id == admin.id))).all()
    now = clock.now()
    live = sum(1 for row in rows if is_live(row, admin, settings, now))
    await db.execute(delete(AdminSession).where(AdminSession.admin_id == admin.id))
    return live


async def prune(db: AsyncSession, settings: Settings) -> None:
    """Delete sessions that can no longer be used."""
    now = clock.now()
    await db.execute(
        delete(AdminSession).where(
            or_(
                AdminSession.expires_at <= now,
                AdminSession.last_seen_at <= now - idle_limit(settings),
            )
        )
    )


async def live_counts(db: AsyncSession, settings: Settings) -> dict[int, int]:
    now = clock.now()
    rows = await db.execute(
        select(AdminSession.admin_id, func.count())
        .join(Admin, Admin.id == AdminSession.admin_id)
        .where(
            Admin.active,
            AdminSession.expires_at > now,
            AdminSession.last_seen_at > now - idle_limit(settings),
            AdminSession.created_at >= Admin.password_changed_at,
        )
        .group_by(AdminSession.admin_id)
    )
    return {admin_id: count for admin_id, count in rows}
