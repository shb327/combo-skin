"""Liveness and readiness endpoints."""

import asyncio
import logging
from typing import Literal

from alembic.runtime.migration import MigrationContext
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import Connection, text

READY_TIMEOUT_SECONDS = 2

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health"])


class Live(BaseModel):
    status: Literal["ok"]


class Checks(BaseModel):
    database: Literal["ok", "unavailable"]
    migrations: Literal["ok", "pending", "unknown"]


class Ready(BaseModel):
    status: Literal["ok", "unavailable"]
    checks: Checks


def current_revision(connection: Connection) -> str | None:
    return MigrationContext.configure(connection).get_current_revision()


@router.get("/live")
async def health_live() -> Live:
    """The process is up and serving requests."""
    return Live(status="ok")


@router.get("/ready", responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": Ready}})
async def health_ready(request: Request, response: Response) -> Ready:
    """The database answers and is at the latest migration."""
    try:
        async with asyncio.timeout(READY_TIMEOUT_SECONDS):
            async with request.app.state.engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
                revision = await connection.run_sync(current_revision)
    except Exception as error:
        logger.warning("Readiness check failed: %s", type(error).__name__)
        checks = Checks(database="unavailable", migrations="unknown")
    else:
        migrated = revision == request.app.state.head_revision
        checks = Checks(database="ok", migrations="ok" if migrated else "pending")

    if checks.database == "ok" and checks.migrations == "ok":
        return Ready(status="ok", checks=checks)
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return Ready(status="unavailable", checks=checks)
