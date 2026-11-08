"""Admin endpoints for screenshot workers and screenshot requests. Every route depends on
`require_admin`."""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Path, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.deps import ADMIN_RESPONSES, AdminDep, Session, error_response, refuse
from combo_api.admins.models import Admin
from combo_api.combos.admin_routes import locked_ids
from combo_api.combos.schemas import Changed
from combo_api.screenshots import queue
from combo_api.screenshots.models import Worker
from combo_api.screenshots.schemas import ScreenshotRequest, WorkerCreated, WorkerIn, WorkerOut
from combo_api.screenshots.workers import digest, new_token

logger = logging.getLogger("combo_api.screenshots")
router = APIRouter(prefix="/admin", tags=["admin"], responses=ADMIN_RESPONSES)

WorkerId = Annotated[int, Path(ge=1, le=2_147_483_647)]


async def worker_out(db: AsyncSession, worker: Worker) -> WorkerOut:
    creator = await db.scalar(select(Admin.username).where(Admin.id == worker.created_by))
    return WorkerOut(
        id=worker.id,
        name=worker.name,
        created_at=worker.created_at,
        created_by=creator or "",
        last_seen_at=worker.last_seen_at,
        revoked_at=worker.revoked_at,
    )


@router.get("/workers")
async def list_workers(current: AdminDep, db: Session) -> list[WorkerOut]:
    """Every screenshot worker, revoked ones included, oldest first."""
    rows = await db.execute(
        select(Worker, Admin.username)
        .join(Admin, Worker.created_by == Admin.id)
        .order_by(Worker.created_at, Worker.id)
    )
    return [
        WorkerOut(
            id=worker.id,
            name=worker.name,
            created_at=worker.created_at,
            created_by=username,
            last_seen_at=worker.last_seen_at,
            revoked_at=worker.revoked_at,
        )
        for worker, username in rows
    ]


@router.post(
    "/workers",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: error_response("`worker_exists`")},
)
async def create_worker(new: WorkerIn, current: AdminDep, db: Session) -> WorkerCreated:
    """Create a screenshot worker. Its token is in this response only."""
    if await db.scalar(select(Worker.id).where(Worker.name == new.name)) is not None:
        raise refuse(status.HTTP_409_CONFLICT, "worker_exists")
    token = new_token()
    worker = Worker(
        name=new.name, token_digest=digest(token), created_at=clock.now(), created_by=current.id
    )
    db.add(worker)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise refuse(status.HTTP_409_CONFLICT, "worker_exists") from None
    logger.info("worker created admin=%s worker=%s", current.username, worker.name)
    return WorkerCreated(worker=await worker_out(db, worker), token=token)


NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: error_response("`worker_not_found`")
}


@router.post("/workers/{worker_id}/revoke", responses=NOT_FOUND)
async def revoke_worker(worker_id: WorkerId, current: AdminDep, db: Session) -> WorkerOut:
    """Revoke a worker: its token stops working at once and its claims are released."""
    worker = await db.get(Worker, worker_id, with_for_update=True)
    if worker is None:
        raise refuse(status.HTTP_404_NOT_FOUND, "worker_not_found")
    if worker.revoked_at is None:
        worker.revoked_at = clock.now()
        worker.revoked_by = current.id
        await queue.release_all(db, worker.id)
        await db.commit()
        logger.info("worker revoked admin=%s worker=%s", current.username, worker.name)
    return await worker_out(db, worker)


@router.post("/screenshots/request")
async def request_screenshots(asked: ScreenshotRequest, current: AdminDep, db: Session) -> Changed:
    """Ask for a new screenshot of each combo: due at once, with its failed attempts cleared.
    The current screenshot stays shown until the new one is stored."""
    rows = await locked_ids(db, asked.ids)
    await queue.request(db, [row.id for row in rows], clock.now())
    await db.commit()
    ids = sorted(row.public_id for row in rows)
    logger.info("screenshots requested admin=%s ids=%s", current.username, ",".join(ids))
    return Changed(changed=len(ids))
