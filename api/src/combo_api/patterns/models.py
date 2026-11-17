"""Pattern group tables. Finish and item types by slug, as `knife_order` has them: migrations run
before the catalog import, which the groups import checks them against."""

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Identity, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from combo_api.combos.models import SEED_MAX
from combo_api.db import Base

NAME_MAX = 40


class PatternGroup(Base):
    __tablename__ = "pattern_groups"
    __table_args__ = (
        CheckConstraint(f"char_length(name) BETWEEN 1 AND {NAME_MAX}", name="name"),
        CheckConstraint("kind IN ('knife', 'glove')", name="kind"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    finish_slug: Mapped[str] = mapped_column(Text)
    # The file's order: the order the dashboard lists groups in.
    position: Mapped[int]
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PatternGroupSeed(Base):
    """A group's example seed for one item type."""

    __tablename__ = "pattern_group_seeds"
    __table_args__ = (CheckConstraint(f"seed >= 0 AND seed <= {SEED_MAX}", name="seed"),)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("pattern_groups.id", ondelete="CASCADE"), primary_key=True
    )
    type_slug: Mapped[str] = mapped_column(Text, primary_key=True)
    seed: Mapped[int]
