"""Screenshot tables: workers, each combo's current screenshot, and its claims and failures."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    LargeBinary,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from combo_api.db import Base

NAME_MAX = 64
VERSION_ID_PATTERN = "^[0-9a-z]{12}$"


class Worker(Base):
    """A screenshot worker. Never deleted: revoked workers keep their row."""

    __tablename__ = "workers"
    __table_args__ = (
        CheckConstraint(f"char_length(name) BETWEEN 1 AND {NAME_MAX}", name="name"),
        CheckConstraint("octet_length(token_digest) = 32", name="token_digest"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    # SHA-256 of the token; the token itself is never stored.
    token_digest: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="RESTRICT"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[int | None] = mapped_column(ForeignKey("admins.id", ondelete="RESTRICT"))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ComboScreenshot(Base):
    """A combo's current screenshot: its original and the public versions made from it."""

    __tablename__ = "combo_screenshots"
    __table_args__ = (
        CheckConstraint(f"version_id ~ '{VERSION_ID_PATTERN}'", name="version_id"),
        CheckConstraint("width > 0 AND height > 0", name="size"),
        CheckConstraint("octet_length(original_sha256) = 32", name="original_sha256"),
    )

    combo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("combos.id", ondelete="CASCADE"), primary_key=True
    )
    original_key: Mapped[str] = mapped_column(Text)
    original_sha256: Mapped[bytes] = mapped_column(LargeBinary)
    width: Mapped[int]
    height: Mapped[int]
    version_id: Mapped[str] = mapped_column(Text)
    widths: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    watermark_revision: Mapped[int]
    # The render inputs the screenshot was drawn from.
    inputs: Mapped[dict[str, Any]] = mapped_column(JSONB)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScreenshotJob(Base):
    """A combo's claim, failed attempts and requests for a new screenshot.

    A claim is live while `lease_expires_at` is in the future. A closed claim keeps its
    `job_id` and worker, with no lease, until the next claim, so a late answer is told the
    claim has expired rather than that the job is unknown.
    """

    __tablename__ = "screenshot_jobs"
    __table_args__ = (CheckConstraint("attempts >= 0", name="attempts"),)

    combo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("combos.id", ondelete="CASCADE"), primary_key=True
    )
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    job_id: Mapped[str | None] = mapped_column(Text, unique=True)
    worker_id: Mapped[int | None] = mapped_column(ForeignKey("workers.id", ondelete="RESTRICT"))
    claimed_inputs: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(server_default=text("0"), default=0)
    # The render inputs the attempts count for.
    attempt_inputs: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    last_reason: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
