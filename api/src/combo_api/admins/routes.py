"""Admin login, logout and "who am I"."""

import logging
from datetime import datetime
from typing import Annotated

import anyio.to_thread
from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field

from combo_api.admins import accounts, clock, limits, passwords, sessions
from combo_api.admins.deps import (
    NO_STORE,
    Session,
    check_csrf,
    check_origin,
    current_session,
    error_response,
    find_session,
    refuse,
)
from combo_api.admins.sessions import LiveSession

logger = logging.getLogger("combo_api.admins")
router = APIRouter(prefix="/admin", tags=["admin"])


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


class AdminOut(BaseModel):
    username: str


class AdminSession(BaseModel):
    admin: AdminOut
    csrf_token: str
    expires_at: datetime


def session_out(live: LiveSession) -> AdminSession:
    return AdminSession(
        admin=AdminOut(username=live.admin.username),
        csrf_token=live.row.csrf_token,
        expires_at=live.row.expires_at,
    )


def json_only(request: Request) -> None:
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise refuse(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "unsupported_media_type")


def known(username: str | None) -> str:
    return f" username={username}" if username else ""


@router.post(
    "/login",
    dependencies=[Depends(check_origin), Depends(json_only)],
    responses={
        status.HTTP_401_UNAUTHORIZED: error_response("`invalid_credentials`"),
        status.HTTP_403_FORBIDDEN: error_response("`origin_not_allowed`"),
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: error_response("`unsupported_media_type`"),
        status.HTTP_429_TOO_MANY_REQUESTS: error_response(
            "`too_many_attempts`; `Retry-After` gives the seconds to wait"
        ),
    },
)
async def admin_login(
    credentials: Credentials, request: Request, response: Response, db: Session
) -> AdminSession:
    """Log in with a username and password. Sets the session cookie."""
    settings = request.app.state.settings
    ip = limits.client_ip(request, settings)
    admin = await accounts.find(db, credentials.username)
    name = admin.username if admin else None
    stored_hash = admin.password_hash if admin else None

    attempt = await limits.begin(db, credentials.username, ip)
    if attempt.limit is not None:
        logger.warning("admin login rate limited limit=%s ip=%s%s", attempt.limit, ip, known(name))
        raise refuse(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "too_many_attempts",
            {"Retry-After": str(attempt.retry_after)},
        )

    limiter = request.app.state.hash_limiter
    matches = await anyio.to_thread.run_sync(
        passwords.verify, stored_hash, credentials.password, limiter=limiter
    )
    if admin is None or not matches or not admin.active:
        reason = (
            "unknown_username" if admin is None else "disabled" if matches else "wrong_password"
        )
        logger.warning("admin login failed reason=%s ip=%s%s", reason, ip, known(name))
        raise refuse(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")

    await limits.succeeded(db, attempt)
    if passwords.needs_rehash(admin.password_hash):
        admin.password_hash = await anyio.to_thread.run_sync(
            passwords.hash_password, credentials.password, limiter=limiter
        )
    await sessions.prune(db, settings)
    token, row = await sessions.start(db, admin, settings)
    admin.last_login_at = clock.now()
    await db.commit()
    logger.info("admin login succeeded username=%s ip=%s", admin.username, ip)

    response.headers.update(NO_STORE)
    response.set_cookie(
        sessions.cookie_name(settings),
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    return session_out(LiveSession(row=row, admin=admin))


@router.get(
    "/me",
    responses={status.HTTP_401_UNAUTHORIZED: error_response("`not_authenticated`")},
)
async def admin_me(live: Annotated[LiveSession, Depends(current_session)]) -> AdminSession:
    """The logged-in admin and the session's CSRF token."""
    return session_out(live)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(check_origin)],
    responses={status.HTTP_403_FORBIDDEN: error_response("`origin_not_allowed` or `csrf_failed`")},
)
async def admin_logout(request: Request, response: Response, db: Session) -> None:
    """End the current session, if there is one, and clear the cookie."""
    settings = request.app.state.settings
    response.headers.update(NO_STORE)
    live = await find_session(request, db, touch=False)
    if live is not None:
        check_csrf(request, live)
        await db.delete(live.row)
        await db.commit()
        logger.info(
            "admin logout username=%s ip=%s",
            live.admin.username,
            limits.client_ip(request, settings),
        )
    response.delete_cookie(
        sessions.cookie_name(settings),
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="strict",
    )
