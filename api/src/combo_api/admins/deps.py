"""`require_admin`: the dependency every admin route uses."""

import secrets
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import sessions
from combo_api.admins.sessions import LiveSession
from combo_api.db import get_session
from combo_api.errors import ErrorCode

Session = Annotated[AsyncSession, Depends(get_session)]

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
CSRF_HEADER = "X-CSRF-Token"
NO_STORE = {"Cache-Control": "no-store"}


class Error(BaseModel):
    detail: ErrorCode


def error_response(description: str) -> dict[str, Any]:
    return {"model": Error, "description": description}


# Responses to declare on every route that depends on `require_admin`.
ADMIN_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_401_UNAUTHORIZED: error_response("`not_authenticated`"),
    status.HTTP_403_FORBIDDEN: error_response("`origin_not_allowed` or `csrf_failed`"),
}


@dataclass(frozen=True)
class CurrentAdmin:
    id: int
    username: str


def refuse(status_code: int, code: str, headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(status_code, detail=code, headers={**NO_STORE, **(headers or {})})


def check_origin(request: Request) -> None:
    """Refuse a request whose Origin is missing, `null` or not an admin origin."""
    origin = request.headers.get("origin")
    if origin is None or origin not in request.app.state.settings.admin_origins:
        raise refuse(status.HTTP_403_FORBIDDEN, "origin_not_allowed")


def check_csrf(request: Request, live: LiveSession) -> None:
    sent = request.headers.get(CSRF_HEADER, "")
    if not secrets.compare_digest(sent.encode(), live.row.csrf_token.encode()):
        raise refuse(status.HTTP_403_FORBIDDEN, "csrf_failed")


async def find_session(
    request: Request, db: AsyncSession, *, touch: bool = True
) -> LiveSession | None:
    settings = request.app.state.settings
    token = request.cookies.get(sessions.cookie_name(settings))
    return await sessions.find(db, token, settings, touch=touch)


async def current_session(request: Request, response: Response, db: Session) -> LiveSession:
    """The caller's live session, or 401."""
    response.headers.update(NO_STORE)
    live = await find_session(request, db)
    if live is None:
        raise refuse(status.HTTP_401_UNAUTHORIZED, "not_authenticated")
    return live


async def require_admin(
    request: Request, live: Annotated[LiveSession, Depends(current_session)]
) -> CurrentAdmin:
    """The logged-in admin, or a refusal: 401 without a live session; for writes, 403 without
    an allowed Origin and the session's CSRF token."""
    if request.method in WRITE_METHODS:
        check_origin(request)
        check_csrf(request, live)
    return CurrentAdmin(id=live.admin.id, username=live.admin.username)


AdminDep = Annotated[CurrentAdmin, Depends(require_admin)]
