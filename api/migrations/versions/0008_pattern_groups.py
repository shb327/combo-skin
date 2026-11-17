"""Pattern groups, and the group each combo item's seeds came from.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pattern_groups",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("finish_slug", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("sources", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 40", name=op.f("ck_pattern_groups_name")
        ),
        sa.CheckConstraint("kind IN ('knife', 'glove')", name=op.f("ck_pattern_groups_kind")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pattern_groups")),
        sa.UniqueConstraint("slug", name=op.f("uq_pattern_groups_slug")),
    )
    op.create_table(
        "pattern_group_seeds",
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("type_slug", sa.Text(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.CheckConstraint("seed >= 0 AND seed <= 1000", name=op.f("ck_pattern_group_seeds_seed")),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["pattern_groups.id"],
            name=op.f("fk_pattern_group_seeds_group_id_pattern_groups"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("group_id", "type_slug", name=op.f("pk_pattern_group_seeds")),
    )
    for side in ("glove", "knife"):
        op.add_column("combos", sa.Column(f"{side}_pattern_group_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            op.f(f"fk_combos_{side}_pattern_group_id_pattern_groups"),
            "combos",
            "pattern_groups",
            [f"{side}_pattern_group_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def downgrade() -> None:
    for side in ("knife", "glove"):
        op.drop_constraint(
            op.f(f"fk_combos_{side}_pattern_group_id_pattern_groups"), "combos", type_="foreignkey"
        )
        op.drop_column("combos", f"{side}_pattern_group_id")
    op.drop_table("pattern_group_seeds")
    op.drop_table("pattern_groups")
