"""Catalog tables. Rows are never deleted: combos reference `finishes.id` and `agents.id`."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    Text,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from combo_api.db import Base


class ItemType(Base):
    __tablename__ = "item_types"
    __table_args__ = (
        CheckConstraint("kind IN ('knife', 'glove')", name="kind"),
        UniqueConstraint("kind", "slug"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    def_index: Mapped[int] = mapped_column(unique=True)
    codename: Mapped[str] = mapped_column(Text, unique=True)
    slug: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    position: Mapped[int]
    active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Finish(Base):
    __tablename__ = "finishes"
    __table_args__ = (
        CheckConstraint(
            "(float_min IS NULL AND float_max IS NULL) OR "
            "(float_min >= 0 AND float_min < float_max AND float_max <= 1)",
            name="float_range",
        ),
        UniqueConstraint("item_type_id", "paint_index"),
        UniqueConstraint("item_type_id", "slug"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    item_type_id: Mapped[int] = mapped_column(ForeignKey("item_types.id", ondelete="RESTRICT"))
    paint_index: Mapped[int]
    paint_codename: Mapped[str | None] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    phase: Mapped[str | None] = mapped_column(Text)
    rarity_code: Mapped[str] = mapped_column(Text)
    rarity_name: Mapped[str] = mapped_column(Text)
    rarity_color: Mapped[str] = mapped_column(Text)
    float_min: Mapped[float | None] = mapped_column(Double)
    float_max: Mapped[float | None] = mapped_column(Double)
    image_url: Mapped[str] = mapped_column(Text)
    position: Mapped[int]
    active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @property
    def display_name(self) -> str:
        return f"{self.name} ({self.phase})" if self.phase else self.name


class Agent(Base):
    """A game agent, drawn holding the knife and gloves in combo screenshots."""

    __tablename__ = "agents"
    __table_args__ = (CheckConstraint("team IN ('ct', 't')", name="team"),)

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    def_index: Mapped[int] = mapped_column(unique=True)
    codename: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    team: Mapped[str] = mapped_column(Text)
    rarity_code: Mapped[str] = mapped_column(Text)
    rarity_name: Mapped[str] = mapped_column(Text)
    rarity_color: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
