"""Worker tokens and `require_worker`, the dependency every worker route uses and only worker
routes use."""

import hashlib
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated, Any

from fastapi import Depends, Request, Response, status
from sqlalchemy import select

from combo_api.admins import clock, limits
from combo_api.admins.deps import NO_STORE, Session, error_response, refuse
from combo_api.screenshots.models import Worker

logger = logging.getLogger("combo_api.screenshots")

PREFIX = "csw_"
TOKEN = re.compile(r"csw_[A-Za-z0-9_-]{43}")
# `last_seen_at` is written at most this often.
SEEN_EVERY = timedelta(minutes=1)

# Responses to declare on every route that depends on `require_worker`.
WORKER_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_401_UNAUTHORIZED: error_response("`not_authenticated`"),
    status.HTTP_403_FORBIDDEN: error_response("`origin_not_allowed`"),
}


@dataclass(frozen=True)
class CurrentWorker:
    id: int
    name: str


def new_token() -> str:
    """`csw_` and 43 base64url characters: 256 bits from the operating system's secure random
    generator."""
    return PREFIX + secrets.token_urlsafe(32)


def digest(token: str) -> bytes:
    """SHA-256 of the token. The token is random, so a slow hash adds nothing."""
    return hashlib.sha256(token.encode()).digest()


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not TOKEN.fullmatch(token):
        return None
    return token


async def require_worker(request: Request, response: Response, db: Session) -> CurrentWorker:
    """The worker whose valid, unrevoked token the request carries, or a refusal: 403 for any
    request with an Origin header, so no browser page can use worker routes; 401 otherwise."""
    response.headers.update(NO_STORE)
    if "origin" in request.headers:
        raise refuse(status.HTTP_403_FORBIDDEN, "origin_not_allowed")
    token = bearer_token(request)
    worker = None
    if token is not None:
        worker = await db.scalar(
            select(Worker).where(Worker.token_digest == digest(token), Worker.revoked_at.is_(None))
        )
    if worker is None:
        logger.warning(
            "screenshot token refused ip=%s",
            limits.client_ip(request, request.app.state.settings),
        )
        raise refuse(
            status.HTTP_401_UNAUTHORIZED, "not_authenticated", {"WWW-Authenticate": "Bearer"}
        )
    now = clock.now()
    if worker.last_seen_at is None or now - worker.last_seen_at >= SEEN_EVERY:
        worker.last_seen_at = now
        await db.commit()
    return CurrentWorker(id=worker.id, name=worker.name)


WorkerDep = Annotated[CurrentWorker, Depends(require_worker)]
