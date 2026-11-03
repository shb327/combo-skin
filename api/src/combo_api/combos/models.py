"""Combo tables. A combo pairs one glove finish and one knife finish from the catalog."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from combo_api.db import Base

PUBLIC_ID_PATTERN = "^[0-9a-z]{12}$"
STATUSES = ("draft", "published", "unpublished")
SEED_MAX = 1000
SEEDS_MAX = 100
DESCRIPTION_MAX = 1000


def float_range(side: str) -> str:
    low, high = f"{side}_float_from", f"{side}_float_to"
    return (
        f"({low} IS NULL AND {high} IS NULL) OR "
        f"({low} IS NOT NULL AND {high} IS NOT NULL AND {low} >= 0 AND {low} < {high} "
        f"AND {high} <= 1)"
    )


def seeds(column: str) -> str:
    return (
        f"array_position({column}, NULL) IS NULL AND cardinality({column}) <= {SEEDS_MAX} "
        f"AND 0 <= ALL({column}) AND {SEED_MAX} >= ALL({column})"
    )


class Combo(Base):
    __tablename__ = "combos"
    __table_args__ = (
        CheckConstraint(f"public_id ~ '{PUBLIC_ID_PATTERN}'", name="public_id"),
        CheckConstraint(float_range("glove"), name="glove_float"),
        CheckConstraint(float_range("knife"), name="knife_float"),
        CheckConstraint(seeds("glove_seeds"), name="glove_seeds"),
        CheckConstraint(seeds("knife_seeds"), name="knife_seeds"),
        CheckConstraint("rating >= 0 AND rating <= 10", name="rating"),
        CheckConstraint(f"char_length(description) <= {DESCRIPTION_MAX}", name="description"),
        CheckConstraint(f"status IN {STATUSES}", name="status"),
        CheckConstraint("version >= 1", name="version"),
        # One combo per pairing until combo variations exist.
        UniqueConstraint("glove_finish_id", "knife_finish_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    public_id: Mapped[str] = mapped_column(Text, unique=True)
    glove_finish_id: Mapped[int] = mapped_column(ForeignKey("finishes.id", ondelete="RESTRICT"))
    knife_finish_id: Mapped[int] = mapped_column(
        ForeignKey("finishes.id", ondelete="RESTRICT"), index=True
    )
    glove_float_from: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    glove_float_to: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    knife_float_from: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    knife_float_to: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    glove_seeds: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), server_default=text("'{}'"), default=list
    )
    knife_seeds: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), server_default=text("'{}'"), default=list
    )
    rating: Mapped[Decimal] = mapped_column(Numeric(4, 2))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    version: Mapped[int]
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="RESTRICT"))
    updated_by: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="RESTRICT"))


class KnifeOrder(Base):
    """The knife order batches follow. Slugs, not foreign keys: migrations run before the
    catalog import, and knife type slugs never change."""

    __tablename__ = "knife_order"

    position: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    type_slug: Mapped[str] = mapped_column(Text, unique=True)
