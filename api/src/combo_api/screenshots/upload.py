"""Storing a worker's screenshot: checks, the original and its versions, then the rows.

Objects are written first; one transaction then points the combo at them and closes the
claim; the old objects are deleted last. A failure before the commit leaves only
unreferenced objects, which `sweep` removes.
"""

import hashlib
import logging

import anyio
from fastapi import Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.deps import refuse
from combo_api.screenshots import queue
from combo_api.screenshots.images import (
    IMAGE_HEIGHT,
    IMAGE_WIDTH,
    MAX_BYTES,
    WATERMARK_REVISION,
    Refused,
    Version,
    check_png,
    decode,
    versions,
)
from combo_api.screenshots.keys import new_id, original_key, version_key
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob
from combo_api.screenshots.objects import Object, delete_objects, objects_of
from combo_api.screenshots.schemas import Stored
from combo_api.screenshots.shapes import screenshot_out
from combo_api.screenshots.storage import IMMUTABLE, Storage
from combo_api.screenshots.workers import CurrentWorker

logger = logging.getLogger("combo_api.screenshots")


async def read_body(request: Request, limit: int) -> bytes:
    """The body, refused with 413 as soon as it passes the limit, whatever Content-Length
    claims."""
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > limit:
        raise refuse(status.HTTP_413_CONTENT_TOO_LARGE, "too_large")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise refuse(status.HTTP_413_CONTENT_TOO_LARGE, "too_large")
        chunks.append(chunk)
    return b"".join(chunks)


def make_versions(data: bytes) -> list[Version]:
    return versions(decode(data))


async def check_inputs(
    db: AsyncSession, job: ScreenshotJob, combo_id: str, worker: CurrentWorker
) -> None:
    """409 `inputs_changed`, with the claim closed, when the combo's render inputs are no
    longer those it was claimed with; the combo is then due again."""
    if await queue.inputs_now(db, job.combo_id) == job.claimed_inputs:
        return
    queue.close(job)
    await db.commit()
    logger.info(
        "job released worker=%s combo=%s job=%s reason=inputs_changed",
        worker.name,
        combo_id,
        job.job_id,
    )
    raise refuse(status.HTTP_409_CONFLICT, "inputs_changed")


async def store(db: AsyncSession, worker: CurrentWorker, job_id: str, request: Request) -> Stored:
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type != "image/png":
        raise refuse(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "unsupported_media_type")
    job, combo_id = await queue.live_job(db, worker, job_id, clock.now())
    await check_inputs(db, job, combo_id, worker)
    claimed = job.claimed_inputs
    # No row stays locked while the body arrives.
    await db.commit()

    data = await read_body(request, MAX_BYTES)
    try:
        check_png(data, IMAGE_WIDTH, IMAGE_HEIGHT)
        made = await anyio.to_thread.run_sync(
            make_versions, data, limiter=request.app.state.image_limiter
        )
    except Refused as refused:
        raise refuse(status.HTTP_422_UNPROCESSABLE_CONTENT, refused.code) from None

    storage: Storage = request.app.state.storage
    upload_id, version_id = new_id(), new_id()
    written: list[Object] = []
    try:
        key = original_key(combo_id, upload_id)
        await storage.put("originals", key, data, "image/png")
        written.append(("originals", key))
        for version in made:
            key = version_key(combo_id, version_id, version.width)
            await storage.put("public", key, version.data, "image/webp", IMMUTABLE)
            written.append(("public", key))

        job, _ = await queue.live_job(db, worker, job_id, clock.now())
        if job.claimed_inputs != claimed:
            raise refuse(status.HTTP_409_CONFLICT, "claim_expired")
        await check_inputs(db, job, combo_id, worker)
    except BaseException:
        await db.rollback()
        await delete_objects(storage, written)
        raise

    shot = await db.get(ComboScreenshot, job.combo_id, with_for_update=True)
    old = objects_of(combo_id, shot) if shot else []
    if shot is None:
        shot = ComboScreenshot(combo_id=job.combo_id)
        db.add(shot)
    shot.original_key = original_key(combo_id, upload_id)
    shot.original_sha256 = hashlib.sha256(data).digest()
    shot.width, shot.height = IMAGE_WIDTH, IMAGE_HEIGHT
    shot.version_id = version_id
    shot.widths = [version.width for version in made]
    shot.watermark_revision = WATERMARK_REVISION
    shot.inputs = claimed or {}
    shot.worker_id = worker.id
    shot.created_at = clock.now()
    queue.close(job)
    job.attempts = 0
    job.attempt_inputs = job.last_reason = job.next_attempt_at = None
    await db.commit()
    logger.info(
        "screenshot stored worker=%s combo=%s job=%s bytes=%s",
        worker.name,
        combo_id,
        job_id,
        len(data),
    )
    await delete_objects(storage, old)
    screenshot = screenshot_out(combo_id, shot, request.app.state.settings.image_base_url)
    assert screenshot is not None  # noqa: S101  (a stored screenshot always has versions)
    return Stored(combo_id=combo_id, screenshot=screenshot)
