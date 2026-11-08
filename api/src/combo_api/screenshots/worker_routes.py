"""Worker endpoints. Every route depends on `require_worker`, and no other route does."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Request, Response, status

from combo_api.admins import clock
from combo_api.admins.deps import Session, error_response
from combo_api.screenshots import queue, upload
from combo_api.screenshots.schemas import FailReport, Job, Release, Stored, WorkerMe
from combo_api.screenshots.workers import WORKER_RESPONSES, WorkerDep

router = APIRouter(prefix="/worker", tags=["worker"], responses=WORKER_RESPONSES)

JobId = Annotated[str, Path(min_length=1, max_length=64)]
JOB_ERRORS: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: error_response("`job_not_found`"),
    status.HTTP_409_CONFLICT: error_response("`claim_expired`"),
}


@router.get("/me")
async def worker_me(worker: WorkerDep) -> WorkerMe:
    """The worker this token belongs to."""
    return WorkerMe(name=worker.name)


@router.post(
    "/jobs/claim",
    responses={status.HTTP_204_NO_CONTENT: {"description": "Nothing is due"}},
)
async def claim_job(worker: WorkerDep, db: Session, response: Response) -> Job | None:
    """Claim the combo that has waited longest for a screenshot, with a 5-minute lease."""
    job = await queue.claim(db, worker, clock.now())
    if job is None:
        response.status_code = status.HTTP_204_NO_CONTENT
    return job


@router.put(
    "/jobs/{job_id}/screenshot",
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_404_NOT_FOUND: error_response("`job_not_found`"),
        status.HTTP_409_CONFLICT: error_response("`claim_expired` or `inputs_changed`"),
        status.HTTP_413_CONTENT_TOO_LARGE: error_response("`too_large`"),
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: error_response("`unsupported_media_type`"),
        status.HTTP_422_UNPROCESSABLE_CONTENT: error_response(
            "`not_png`, `wrong_size` or `bad_pixel_format`"
        ),
    },
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"image/png": {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def put_screenshot(job_id: JobId, worker: WorkerDep, db: Session, request: Request) -> Stored:
    """Send the screenshot for a live claim: a PNG of the job's size, at most 16 MiB. It is
    stored, with its watermarked versions, before this answers."""
    return await upload.store(db, worker, job_id, request)


@router.post("/jobs/{job_id}/fail", status_code=status.HTTP_204_NO_CONTENT, responses=JOB_ERRORS)
async def fail_job(job_id: JobId, report: FailReport, worker: WorkerDep, db: Session) -> None:
    """Report a failed render. It counts as an attempt; the combo waits before the next."""
    await queue.fail(db, worker, job_id, report.reason, report.detail, clock.now())


@router.post("/jobs/{job_id}/release", status_code=status.HTTP_204_NO_CONTENT, responses=JOB_ERRORS)
async def release_job(job_id: JobId, release: Release, worker: WorkerDep, db: Session) -> None:
    """Give a claim back without counting an attempt."""
    await queue.release(db, worker, job_id, release.reason, clock.now())
