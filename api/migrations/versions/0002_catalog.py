"""Catalog: knife and glove types and their finishes.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item_types",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("def_index", sa.Integer(), nullable=False),
        sa.Column("codename", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("kind IN ('knife', 'glove')", name=op.f("ck_item_types_kind")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_item_types")),
        sa.UniqueConstraint("codename", name=op.f("uq_item_types_codename")),
        sa.UniqueConstraint("def_index", name=op.f("uq_item_types_def_index")),
        sa.UniqueConstraint("kind", "slug", name=op.f("uq_item_types_kind_slug")),
    )
    op.create_table(
        "finishes",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("item_type_id", sa.Integer(), nullable=False),
        sa.Column("paint_index", sa.Integer(), nullable=False),
        sa.Column("paint_codename", sa.Text(), nullable=True),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("phase", sa.Text(), nullable=True),
        sa.Column("rarity_code", sa.Text(), nullable=False),
        sa.Column("rarity_name", sa.Text(), nullable=False),
        sa.Column("rarity_color", sa.Text(), nullable=False),
        sa.Column("float_min", sa.Double(), nullable=True),
        sa.Column("float_max", sa.Double(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(float_min IS NULL AND float_max IS NULL) OR "
            "(float_min >= 0 AND float_min < float_max AND float_max <= 1)",
            name=op.f("ck_finishes_float_range"),
        ),
        sa.ForeignKeyConstraint(
            ["item_type_id"],
            ["item_types.id"],
            name=op.f("fk_finishes_item_type_id_item_types"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finishes")),
        sa.UniqueConstraint(
            "item_type_id", "paint_index", name=op.f("uq_finishes_item_type_id_paint_index")
        ),
        sa.UniqueConstraint("item_type_id", "slug", name=op.f("uq_finishes_item_type_id_slug")),
    )


def downgrade() -> None:
    op.drop_table("finishes")
    op.drop_table("item_types")
