"""Login rate limits, counted in PostgreSQL, and the client IP they are keyed on."""

import hashlib
import math
import unicodedata
from dataclasses import dataclass
from datetime import timedelta
from ipaddress import IPv4Address, IPv6Address, ip_address
from typing import Any, Literal

from fastapi import Request
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.models import LoginFailure
from combo_api.settings import Settings

WINDOW = timedelta(minutes=15)
IP_LIMIT = 10
USERNAME_LIMIT = 20
RETENTION = timedelta(hours=24)

Limit = Literal["ip", "username"]


@dataclass(frozen=True)
class Attempt:
    """A login attempt, recorded as a failure until it succeeds."""

    row_id: int
    limit: Limit | None
    retry_after: int


def username_digest(username: str) -> bytes:
    """Submitted usernames are stored only as this digest: some are passwords typed by mistake."""
    key = unicodedata.normalize("NFKC", username).casefold()
    return hashlib.sha256(key.encode()).digest()


def parse_ip(value: str) -> IPv4Address | IPv6Address | None:
    try:
        return ip_address(value.strip())
    except ValueError:
        return None


def client_ip(request: Request, settings: Settings) -> str:
    """The connecting peer, or with a trusted proxy the right-most address it was not given by
    another trusted proxy."""
    peer = request.client.host if request.client else "0.0.0.0"  # noqa: S104
    trusted = settings.trusted_proxies

    def is_trusted(address: IPv4Address | IPv6Address | None) -> bool:
        return address is not None and any(address in network for network in trusted)

    if not is_trusted(parse_ip(peer)):
        return peer
    hops = [hop for hop in request.headers.get("x-forwarded-for", "").split(",") if hop.strip()]
    for hop in reversed(hops):
        address = parse_ip(hop)
        if address is None:
            return peer
        if not is_trusted(address):
            return str(address)
    return peer


async def begin(db: AsyncSession, username: str, ip: str) -> Attempt:
    """Record the attempt before the password is checked, so parallel attempts count each other.

    Over a limit, the attempt is removed again and the password must not be checked.
    """
    now = clock.now()
    key = username_digest(username)
    await db.execute(delete(LoginFailure).where(LoginFailure.created_at < now - RETENTION))
    inserted = await db.execute(
        insert(LoginFailure)
        .values(username_digest=key, client_ip=ip, created_at=now)
        .returning(LoginFailure.id)
    )
    row_id: int = inserted.scalar_one()
    await db.commit()

    since = now - WINDOW
    waits = []
    limited: Limit | None = None
    checks: tuple[tuple[Limit, Any, object, int], ...] = (
        ("ip", LoginFailure.client_ip, ip, IP_LIMIT),
        ("username", LoginFailure.username_digest, key, USERNAME_LIMIT),
    )
    for limit, column, value, allowed in checks:
        times = (
            await db.scalars(
                select(LoginFailure.created_at)
                .where(column == value, LoginFailure.created_at > since, LoginFailure.id != row_id)
                .order_by(LoginFailure.created_at)
            )
        ).all()
        if len(times) >= allowed:
            limited = limited or limit
            # The attempt is allowed again once enough of the counted failures leave the window.
            waits.append(times[len(times) - allowed] + WINDOW - now)
    if limited is None:
        return Attempt(row_id=row_id, limit=None, retry_after=0)
    await succeeded(db, Attempt(row_id=row_id, limit=limited, retry_after=0))
    seconds = max(1, math.ceil(max(waits).total_seconds()))
    return Attempt(row_id=row_id, limit=limited, retry_after=seconds)


async def succeeded(db: AsyncSession, attempt: Attempt) -> None:
    """A successful (or refused) attempt is not a failure."""
    await db.execute(delete(LoginFailure).where(LoginFailure.id == attempt.row_id))
    await db.commit()
