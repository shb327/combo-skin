"""Screenshot workers, each combo's current screenshot, and screenshot claims and failures.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workers",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("token_digest", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.Integer(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("char_length(name) BETWEEN 1 AND 64", name=op.f("ck_workers_name")),
        sa.CheckConstraint("octet_length(token_digest) = 32", name=op.f("ck_workers_token_digest")),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["admins.id"],
            name=op.f("fk_workers_created_by_admins"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by"],
            ["admins.id"],
            name=op.f("fk_workers_revoked_by_admins"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workers")),
        sa.UniqueConstraint("name", name=op.f("uq_workers_name")),
        sa.UniqueConstraint("token_digest", name=op.f("uq_workers_token_digest")),
    )
    op.create_table(
        "combo_screenshots",
        sa.Column("combo_id", sa.BigInteger(), nullable=False),
        sa.Column("original_key", sa.Text(), nullable=False),
        sa.Column("original_sha256", sa.LargeBinary(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("version_id", sa.Text(), nullable=False),
        sa.Column("widths", postgresql.ARRAY(sa.Integer()), nullable=False),
        sa.Column("watermark_revision", sa.Integer(), nullable=False),
        sa.Column("inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("worker_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "version_id ~ '^[0-9a-z]{12}$'", name=op.f("ck_combo_screenshots_version_id")
        ),
        sa.CheckConstraint(
            "octet_length(original_sha256) = 32", name=op.f("ck_combo_screenshots_original_sha256")
        ),
        sa.CheckConstraint("width > 0 AND height > 0", name=op.f("ck_combo_screenshots_size")),
        sa.ForeignKeyConstraint(
            ["combo_id"],
            ["combos.id"],
            name=op.f("fk_combo_screenshots_combo_id_combos"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["worker_id"],
            ["workers.id"],
            name=op.f("fk_combo_screenshots_worker_id_workers"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("combo_id", name=op.f("pk_combo_screenshots")),
    )
    op.create_table(
        "screenshot_jobs",
        sa.Column("combo_id", sa.BigInteger(), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("job_id", sa.Text(), nullable=True),
        sa.Column("worker_id", sa.Integer(), nullable=True),
        sa.Column("claimed_inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("attempt_inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_reason", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("attempts >= 0", name=op.f("ck_screenshot_jobs_attempts")),
        sa.ForeignKeyConstraint(
            ["combo_id"],
            ["combos.id"],
            name=op.f("fk_screenshot_jobs_combo_id_combos"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["worker_id"],
            ["workers.id"],
            name=op.f("fk_screenshot_jobs_worker_id_workers"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("combo_id", name=op.f("pk_screenshot_jobs")),
        sa.UniqueConstraint("job_id", name=op.f("uq_screenshot_jobs_job_id")),
    )


def downgrade() -> None:
    op.drop_table("screenshot_jobs")
    op.drop_table("combo_screenshots")
    op.drop_table("workers")
