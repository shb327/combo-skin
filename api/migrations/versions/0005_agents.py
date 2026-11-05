"""Agents, the screenshot agent of combos, and the default screenshot agent.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Lt. Commander Ricksaw | NSWC SEAL.
DEFAULT_AGENT_DEF_INDEX = 5404


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column("def_index", sa.Integer(), nullable=False),
        sa.Column("codename", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("team", sa.Text(), nullable=False),
        sa.Column("rarity_code", sa.Text(), nullable=False),
        sa.Column("rarity_name", sa.Text(), nullable=False),
        sa.Column("rarity_color", sa.Text(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("team IN ('ct', 't')", name=op.f("ck_agents_team")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agents")),
        sa.UniqueConstraint("codename", name=op.f("uq_agents_codename")),
        sa.UniqueConstraint("def_index", name=op.f("uq_agents_def_index")),
    )
    op.add_column("combos", sa.Column("screenshot_agent_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_combos_screenshot_agent_id_agents"),
        "combos",
        "agents",
        ["screenshot_agent_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    settings = op.create_table(
        "screenshot_settings",
        sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("default_agent_def_index", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.CheckConstraint("id = 1", name=op.f("ck_screenshot_settings_single_row")),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["admins.id"],
            name=op.f("fk_screenshot_settings_updated_by_admins"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_screenshot_settings")),
    )
    op.execute(
        settings.insert().values(
            id=1, default_agent_def_index=DEFAULT_AGENT_DEF_INDEX, updated_at=sa.func.now()
        )
    )


def downgrade() -> None:
    op.drop_table("screenshot_settings")
    op.drop_constraint(op.f("fk_combos_screenshot_agent_id_agents"), "combos", type_="foreignkey")
    op.drop_column("combos", "screenshot_agent_id")
    op.drop_table("agents")
