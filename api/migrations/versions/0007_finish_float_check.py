"""A catalog finish's float range has both bounds or neither, as a combo's does.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BOTH_OR_NEITHER = (
    "(float_min IS NULL AND float_max IS NULL) OR "
    "(float_min IS NOT NULL AND float_max IS NOT NULL AND float_min >= 0 "
    "AND float_min < float_max AND float_max <= 1)"
)
# Before: a range with one bound passed, as a comparison with null is unknown.
FIRST = (
    "(float_min IS NULL AND float_max IS NULL) OR "
    "(float_min >= 0 AND float_min < float_max AND float_max <= 1)"
)


def upgrade() -> None:
    op.drop_constraint("float_range", "finishes", type_="check")
    op.create_check_constraint("float_range", "finishes", BOTH_OR_NEITHER)


def downgrade() -> None:
    op.drop_constraint("float_range", "finishes", type_="check")
    op.create_check_constraint("float_range", "finishes", FIRST)
