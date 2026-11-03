"""Combos and the knife order.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The owner's knife order, which batches follow until an admin changes it.
KNIFE_ORDER = [
    "butterfly",
    "karambit",
    "m9-bayonet",
    "talon",
    "skeleton",
    "stiletto",
    "bayonet",
    "flip",
    "nomad",
    "huntsman",
    "falchion",
    "bowie",
    "classic",
    "ursus",
    "kukri",
    "paracord",
    "survival",
    "gut",
    "shadow-daggers",
    "navaja",
]


def float_range(side: str) -> str:
    low, high = f"{side}_float_from", f"{side}_float_to"
    return (
        f"({low} IS NULL AND {high} IS NULL) OR "
        f"({low} IS NOT NULL AND {high} IS NOT NULL AND {low} >= 0 AND {low} < {high} "
        f"AND {high} <= 1)"
    )


def seeds(column: str) -> str:
    return (
        f"array_position({column}, NULL) IS NULL AND cardinality({column}) <= 100 "
        f"AND 0 <= ALL({column}) AND 1000 >= ALL({column})"
    )


def upgrade() -> None:
    op.create_table(
        "combos",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("public_id", sa.Text(), nullable=False),
        sa.Column("glove_finish_id", sa.Integer(), nullable=False),
        sa.Column("knife_finish_id", sa.Integer(), nullable=False),
        sa.Column("glove_float_from", sa.Numeric(5, 4), nullable=True),
        sa.Column("glove_float_to", sa.Numeric(5, 4), nullable=True),
        sa.Column("knife_float_from", sa.Numeric(5, 4), nullable=True),
        sa.Column("knife_float_to", sa.Numeric(5, 4), nullable=True),
        sa.Column(
            "glove_seeds",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "knife_seeds",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("rating", sa.Numeric(4, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.Integer(), nullable=False),
        sa.CheckConstraint("public_id ~ '^[0-9a-z]{12}$'", name=op.f("ck_combos_public_id")),
        sa.CheckConstraint(float_range("glove"), name=op.f("ck_combos_glove_float")),
        sa.CheckConstraint(float_range("knife"), name=op.f("ck_combos_knife_float")),
        sa.CheckConstraint(seeds("glove_seeds"), name=op.f("ck_combos_glove_seeds")),
        sa.CheckConstraint(seeds("knife_seeds"), name=op.f("ck_combos_knife_seeds")),
        sa.CheckConstraint("rating >= 0 AND rating <= 10", name=op.f("ck_combos_rating")),
        sa.CheckConstraint("char_length(description) <= 1000", name=op.f("ck_combos_description")),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'unpublished')", name=op.f("ck_combos_status")
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_combos_version")),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["admins.id"],
            name=op.f("fk_combos_created_by_admins"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["glove_finish_id"],
            ["finishes.id"],
            name=op.f("fk_combos_glove_finish_id_finishes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["knife_finish_id"],
            ["finishes.id"],
            name=op.f("fk_combos_knife_finish_id_finishes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["admins.id"],
            name=op.f("fk_combos_updated_by_admins"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_combos")),
        sa.UniqueConstraint(
            "glove_finish_id",
            "knife_finish_id",
            name=op.f("uq_combos_glove_finish_id_knife_finish_id"),
        ),
        sa.UniqueConstraint("public_id", name=op.f("uq_combos_public_id")),
    )
    op.create_index(op.f("ix_combos_knife_finish_id"), "combos", ["knife_finish_id"], unique=False)
    knife_order = op.create_table(
        "knife_order",
        sa.Column("position", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("type_slug", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("position", name=op.f("pk_knife_order")),
        sa.UniqueConstraint("type_slug", name=op.f("uq_knife_order_type_slug")),
    )
    op.bulk_insert(
        knife_order,
        [{"position": i, "type_slug": slug} for i, slug in enumerate(KNIFE_ORDER, start=1)],
    )


def downgrade() -> None:
    op.drop_table("knife_order")
    op.drop_index(op.f("ix_combos_knife_finish_id"), table_name="combos")
    op.drop_table("combos")
