"""Loading combos with their finishes, types and admins, and building responses from them."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Row, Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from combo_api.admins.models import Admin
from combo_api.catalog.models import Finish, ItemType
from combo_api.catalog.routes import Rarity
from combo_api.combos.ids import new_public_id
from combo_api.combos.models import Combo
from combo_api.combos.schemas import AdminCombo, Conditions, Item, PublicCombo, decimal, number

GloveFinish = aliased(Finish, name="glove_finish")
GloveType = aliased(ItemType, name="glove_type")
KnifeFinish = aliased(Finish, name="knife_finish")
KnifeType = aliased(ItemType, name="knife_type")
Creator = aliased(Admin, name="creator")
Updater = aliased(Admin, name="updater")

# What the public sees: the combo lists and their counts use this one condition.
PUBLISHED = Combo.status == "published"

ComboColumns = tuple[Combo, Finish, ItemType, Finish, ItemType, str, str]
ComboRow = Row[*ComboColumns]


def combos() -> Select[*ComboColumns]:
    return (
        select(
            Combo,
            GloveFinish,
            GloveType,
            KnifeFinish,
            KnifeType,
            Creator.username,
            Updater.username,
        )
        .join(GloveFinish, Combo.glove_finish_id == GloveFinish.id)
        .join(GloveType, GloveFinish.item_type_id == GloveType.id)
        .join(KnifeFinish, Combo.knife_finish_id == KnifeFinish.id)
        .join(KnifeType, KnifeFinish.item_type_id == KnifeType.id)
        .join(Creator, Combo.created_by == Creator.id)
        .join(Updater, Combo.updated_by == Updater.id)
    )


def new_combo(
    glove: Finish,
    knife: Finish,
    glove_conditions: Conditions,
    knife_conditions: Conditions,
    rating: float,
    description: str | None,
    admin_id: int,
    now: datetime,
) -> Combo:
    """A new draft combo."""
    return Combo(
        public_id=new_public_id(),
        glove_finish_id=glove.id,
        knife_finish_id=knife.id,
        **stored("glove", glove_conditions),
        **stored("knife", knife_conditions),
        rating=decimal(rating),
        description=description,
        status="draft",
        version=1,
        created_at=now,
        updated_at=now,
        created_by=admin_id,
        updated_by=admin_id,
    )


async def pairing_exists(db: AsyncSession, glove: Finish, knife: Finish) -> bool:
    found = await db.scalar(
        select(Combo.id).where(Combo.glove_finish_id == glove.id, Combo.knife_finish_id == knife.id)
    )
    return found is not None


def stored(side: str, conditions: Conditions) -> dict[str, Any]:
    """A side's conditions as column values."""
    return {
        f"{side}_float_from": stored_float(conditions.float_from),
        f"{side}_float_to": stored_float(conditions.float_to),
        f"{side}_seeds": conditions.seeds,
    }


def stored_float(value: float | None) -> Decimal | None:
    return None if value is None else decimal(value)


def item(
    finish: Finish,
    item_type: ItemType,
    float_from: float | None = None,
    float_to: float | None = None,
    seeds: list[int] | None = None,
) -> Item:
    """A finish as an item of a combo; without conditions, as a candidate."""
    return Item(
        type_slug=item_type.slug,
        type_name=item_type.name,
        finish_slug=finish.slug,
        display_name=finish.display_name,
        image_url=finish.image_url,
        rarity=Rarity(code=finish.rarity_code, name=finish.rarity_name, color=finish.rarity_color),
        active=finish.active and item_type.active,
        float_min=finish.float_min,
        float_max=finish.float_max,
        float_from=float_from,
        float_to=float_to,
        seeds=seeds or [],
    )


def combo_item(combo: Combo, side: str, finish: Finish, item_type: ItemType) -> Item:
    return item(
        finish,
        item_type,
        number(getattr(combo, f"{side}_float_from")),
        number(getattr(combo, f"{side}_float_to")),
        getattr(combo, f"{side}_seeds"),
    )


def admin_out(row: ComboRow) -> AdminCombo:
    combo, glove, glove_type, knife, knife_type, created_by, updated_by = row
    return AdminCombo(
        id=combo.public_id,
        status=combo.status,
        version=combo.version,
        rating=float(combo.rating),
        description=combo.description,
        glove=combo_item(combo, "glove", glove, glove_type),
        knife=combo_item(combo, "knife", knife, knife_type),
        created_at=combo.created_at,
        created_by=created_by,
        updated_at=combo.updated_at,
        updated_by=updated_by,
        published_at=combo.published_at,
    )


def public_out(row: ComboRow) -> PublicCombo:
    combo, glove, glove_type, knife, knife_type, _, _ = row
    return PublicCombo(
        id=combo.public_id,
        rating=float(combo.rating),
        description=combo.description,
        glove=combo_item(combo, "glove", glove, glove_type),
        knife=combo_item(combo, "knife", knife, knife_type),
    )


async def find(db: AsyncSession, public_id: str) -> AdminCombo | None:
    row = (await db.execute(combos().where(Combo.public_id == public_id))).first()
    return None if row is None else admin_out(row)
