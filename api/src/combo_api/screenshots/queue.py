"""The screenshot queue: claims with a lease, failed attempts, releases and requests.

A combo is due when `inputs.due` holds. A claim gives one worker one due combo for
`LEASE`; a failure report or an expired lease counts an attempt and makes the combo wait;
after `MAX_ATTEMPTS` for the same render inputs it is failed until they change or an admin
asks for a new screenshot.
"""

import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import case, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins.deps import refuse
from combo_api.catalog.models import Agent
from combo_api.combos import queries
from combo_api.combos.models import Combo
from combo_api.screenshots import inputs
from combo_api.screenshots.images import IMAGE_HEIGHT, IMAGE_WIDTH
from combo_api.screenshots.keys import new_id
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob, Worker
from combo_api.screenshots.schemas import Job, JobAgent, JobImage, JobItem
from combo_api.screenshots.workers import CurrentWorker

logger = logging.getLogger("combo_api.screenshots")

LEASE = timedelta(minutes=5)
# The wait after the first and the second failed attempt.
WAITS = (timedelta(minutes=1), timedelta(minutes=10))
# Combos tried per claim when another claim takes the one picked first.
CLAIM_TRIES = 5


async def still_active(db: AsyncSession, worker: CurrentWorker) -> None:
    """401 if the worker was revoked since its token was checked. The row stays share-locked
    until the transaction ends, so a revoke waits for this claim or answer and then releases
    it, or wins and this one is refused."""
    found = await db.scalar(
        select(Worker.id)
        .where(Worker.id == worker.id, Worker.revoked_at.is_(None))
        .with_for_update(read=True)
    )
    if found is None:
        raise refuse(
            status.HTTP_401_UNAUTHORIZED, "not_authenticated", {"WWW-Authenticate": "Bearer"}
        )


def with_state(query: Any) -> Any:
    """Join a query on `Combo` with its screenshot, job and current render inputs."""
    return query.outerjoin(ComboScreenshot, ComboScreenshot.combo_id == Combo.id).outerjoin(
        ScreenshotJob, ScreenshotJob.combo_id == Combo.id
    )


def count_attempt(job: ScreenshotJob, reason: str, at: datetime) -> None:
    """Count a failed attempt for the claimed inputs and close the claim."""
    same = job.attempt_inputs is not None and job.attempt_inputs == job.claimed_inputs
    job.attempts = job.attempts + 1 if same else 1
    job.attempt_inputs = job.claimed_inputs
    job.last_reason = reason
    job.next_attempt_at = at + WAITS[min(job.attempts, len(WAITS)) - 1]
    close(job)


def close(job: ScreenshotJob) -> None:
    """End the claim. The job id and worker stay, so a late answer gets `claim_expired`."""
    job.lease_expires_at = None
    job.claimed_inputs = None


async def expire(db: AsyncSession, now: datetime) -> None:
    """Count every lease that ran out as a failed attempt (`lease_expired`). Rows another
    transaction holds are left for the next call."""
    rows = (
        await db.execute(
            select(ScreenshotJob, Combo.public_id, Worker.name)
            .join(Combo, Combo.id == ScreenshotJob.combo_id)
            .outerjoin(Worker, Worker.id == ScreenshotJob.worker_id)
            .where(ScreenshotJob.lease_expires_at <= now)
            .with_for_update(of=ScreenshotJob, skip_locked=True)
        )
    ).all()
    for job, combo_id, worker in rows:
        count_attempt(job, "lease_expired", job.lease_expires_at or now)
        logger.info("lease expired worker=%s combo=%s job=%s", worker, combo_id, job.job_id)
    await db.commit()


async def abandon(db: AsyncSession, worker: CurrentWorker, now: datetime) -> None:
    """Close the worker's live claims as failed attempts (`abandoned`) before it claims again,
    so a worker holds at most one claim. Counted, as an expired lease is: a worker that
    restarts because a combo crashed it must not get that combo back for ever."""
    rows = (
        await db.execute(
            select(ScreenshotJob, Combo.public_id)
            .join(Combo, Combo.id == ScreenshotJob.combo_id)
            .where(
                ScreenshotJob.worker_id == worker.id, ScreenshotJob.lease_expires_at.is_not(None)
            )
            .with_for_update(of=ScreenshotJob)
        )
    ).all()
    for job, combo_id in rows:
        count_attempt(job, "abandoned", now)
        logger.info("job abandoned worker=%s combo=%s job=%s", worker.name, combo_id, job.job_id)


async def claim(db: AsyncSession, worker: CurrentWorker, now: datetime) -> Job | None:
    """Give the worker the due combo that has waited longest, published combos first, with a
    lease; None when nothing is due. Its earlier claims, if any, are abandoned first."""
    await expire(db, now)
    await still_active(db, worker)
    await abandon(db, worker, now)
    current = inputs.current_inputs()
    effective = Agent.__table__.alias("effective_agent")
    tried: list[int] = []
    for _ in range(CLAIM_TRIES):
        query = (
            with_state(select(Combo.id, Combo.public_id, current.c.value))
            .join(current, true())
            # A combo whose agent is not in the catalog cannot be drawn.
            .join(effective, effective.c.def_index == current.c.agent)
            .where(inputs.claimable(current.c.value, now), Combo.id.not_in(tried))
            .order_by(
                case((Combo.status == "published", 0), else_=1),
                inputs.waiting_since(current.c.value),
                Combo.id,
            )
            .limit(1)
            .with_for_update(of=Combo, skip_locked=True)
        )
        row = (await db.execute(query)).first()
        if row is None:
            await db.rollback()
            return None
        combo_id, public_id, claimed = row
        job_id = new_id()
        lease = now + LEASE
        values = {
            "job_id": job_id,
            "worker_id": worker.id,
            "claimed_inputs": claimed,
            "lease_expires_at": lease,
        }
        statement = (
            insert(ScreenshotJob)
            .values(combo_id=combo_id, attempts=0, **values)
            .on_conflict_do_update(
                index_elements=[ScreenshotJob.combo_id],
                set_=values,
                # Another claim may have taken it since this transaction's snapshot.
                where=ScreenshotJob.lease_expires_at.is_(None),
            )
            .returning(ScreenshotJob.combo_id)
        )
        if (await db.execute(statement)).first() is None:
            tried.append(combo_id)
            continue
        await db.commit()
        logger.info("job claimed worker=%s combo=%s job=%s", worker.name, public_id, job_id)
        return await job_out(db, combo_id, job_id, lease, claimed)
    await db.rollback()
    return None


def job_item(row: Any, side: str, drawn: dict[str, Any]) -> JobItem:
    combo = row[0]
    finish, item_type = (row[1], row[2]) if side == "glove" else (row[3], row[4])
    float_from, float_to, seeds = queries.conditions(combo, side)
    return JobItem(
        def_index=item_type.def_index,
        codename=item_type.codename,
        paint_index=finish.paint_index,
        paint_codename=finish.paint_codename,
        name=f"{item_type.name} | {finish.display_name}",
        float=drawn["float"],
        seed=drawn["seed"],
        float_from=float_from,
        float_to=float_to,
        seeds=seeds,
    )


async def job_out(
    db: AsyncSession, combo_id: int, job_id: str, lease: datetime, claimed: dict[str, Any]
) -> Job:
    """The job of a claim: what the viewer needs to draw the combo, and nothing else."""
    row = (await db.execute(queries.combos().where(Combo.id == combo_id))).one()
    combo = row[0]
    agent = (
        await db.execute(select(Agent).where(Agent.def_index == claimed["agent"]))
    ).scalar_one()
    return Job(
        job_id=job_id,
        lease_expires_at=lease,
        combo_id=combo.public_id,
        image=JobImage(width=IMAGE_WIDTH, height=IMAGE_HEIGHT, type="image/png"),
        glove=job_item(row, "glove", claimed["glove"]),
        knife=job_item(row, "knife", claimed["knife"]),
        agent=JobAgent(
            def_index=agent.def_index,
            codename=agent.codename,
            name=agent.name,
            team="ct" if agent.team == "ct" else "t",
            default=combo.screenshot_agent_id is None,
        ),
        render_revision=claimed["render_revision"],
    )


async def live_job(
    db: AsyncSession, worker: CurrentWorker, job_id: str, now: datetime
) -> tuple[ScreenshotJob, str]:
    """The worker's job with this id, locked, and its combo's public id; 404 for an unknown
    job or another worker's, 409 when the claim has expired or was closed."""
    await still_active(db, worker)
    found = (
        await db.execute(
            select(ScreenshotJob, Combo.public_id)
            .join(Combo, Combo.id == ScreenshotJob.combo_id)
            .where(ScreenshotJob.job_id == job_id)
            .with_for_update(of=ScreenshotJob)
        )
    ).first()
    if found is None or found[0].worker_id != worker.id:
        raise refuse(status.HTTP_404_NOT_FOUND, "job_not_found")
    job, public_id = found
    if job.lease_expires_at is None or job.lease_expires_at <= now:
        raise refuse(status.HTTP_409_CONFLICT, "claim_expired")
    return job, public_id


async def fail(
    db: AsyncSession,
    worker: CurrentWorker,
    job_id: str,
    reason: str,
    detail: str | None,
    now: datetime,
) -> None:
    job, public_id = await live_job(db, worker, job_id, now)
    count_attempt(job, reason, now)
    await db.commit()
    logger.info(
        "job failed worker=%s combo=%s job=%s reason=%s detail=%r",
        worker.name,
        public_id,
        job_id,
        reason,
        detail,
    )


async def release(
    db: AsyncSession, worker: CurrentWorker, job_id: str, reason: str, now: datetime
) -> None:
    """Free the combo at once, without counting an attempt."""
    job, public_id = await live_job(db, worker, job_id, now)
    close(job)
    await db.commit()
    logger.info(
        "job released worker=%s combo=%s job=%s reason=%s", worker.name, public_id, job_id, reason
    )


async def release_all(db: AsyncSession, worker_id: int) -> None:
    """Close a revoked worker's claims without counting attempts. The caller commits."""
    rows = await db.scalars(
        select(ScreenshotJob)
        .where(ScreenshotJob.worker_id == worker_id, ScreenshotJob.lease_expires_at.is_not(None))
        .with_for_update()
    )
    for job in rows:
        close(job)


async def request(db: AsyncSession, combo_ids: list[int], now: datetime) -> None:
    """Ask for new screenshots: the combos are due at once, with no failed attempts. The
    caller commits."""
    reset = {
        "requested_at": now,
        "attempts": 0,
        "attempt_inputs": None,
        "last_reason": None,
        "next_attempt_at": None,
    }
    for combo_id in combo_ids:
        await db.execute(
            insert(ScreenshotJob)
            .values(combo_id=combo_id, **reset)
            .on_conflict_do_update(index_elements=[ScreenshotJob.combo_id], set_=reset)
        )


async def done_using_default(db: AsyncSession) -> set[int]:
    """The combos without their own agent whose screenshot is done."""
    current = inputs.current_inputs()
    rows = await db.scalars(
        with_state(select(Combo.id))
        .join(current, true())
        .where(Combo.screenshot_agent_id.is_(None), ~inputs.due(current.c.value))
    )
    return set(rows)


async def inputs_now(db: AsyncSession, combo_id: int) -> dict[str, Any] | None:
    """A combo's render inputs now, or None when it no longer exists."""
    current = inputs.current_inputs()
    value: dict[str, Any] | None = await db.scalar(
        select(current.c.value).select_from(Combo).join(current, true()).where(Combo.id == combo_id)
    )
    return value
