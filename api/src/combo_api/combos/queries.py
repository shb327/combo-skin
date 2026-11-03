"""Loading combos with their finishes, types and admins, and building responses from them."""

from decimal import Decimal
from typing import Any

from sqlalchemy import Row, Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from combo_api.admins.models import Admin
from combo_api.catalog.models import Finish, ItemType
from combo_api.catalog.routes import Rarity
from combo_api.combos.models import Combo
from combo_api.combos.schemas import AdminCombo, Conditions, Item, PublicCombo, decimal, number

GloveFinish = aliased(Finish, name="glove_finish")
GloveType = aliased(ItemType, name="glove_type")
KnifeFinish = aliased(Finish, name="knife_finish")
KnifeType = aliased(ItemType, name="knife_type")
Creator = aliased(Admin, name="creator")
Updater = aliased(Admin, name="updater")

ComboRow = Row[Combo, Finish, ItemType, Finish, ItemType, str, str]


def combos() -> Select[Combo, Finish, ItemType, Finish, ItemType, str, str]:
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


def stored(side: str, conditions: Conditions) -> dict[str, Any]:
    """A side's conditions as column values."""
    return {
        f"{side}_float_from": stored_float(conditions.float_from),
        f"{side}_float_to": stored_float(conditions.float_to),
        f"{side}_seeds": conditions.seeds,
    }


def stored_float(value: float | None) -> Decimal | None:
    return None if value is None else decimal(value)


def item(combo: Combo, side: str, finish: Finish, item_type: ItemType) -> Item:
    return Item(
        type_slug=item_type.slug,
        type_name=item_type.name,
        finish_slug=finish.slug,
        display_name=finish.display_name,
        image_url=finish.image_url,
        rarity=Rarity(code=finish.rarity_code, name=finish.rarity_name, color=finish.rarity_color),
        active=finish.active and item_type.active,
        float_from=number(getattr(combo, f"{side}_float_from")),
        float_to=number(getattr(combo, f"{side}_float_to")),
        seeds=getattr(combo, f"{side}_seeds"),
    )


def admin_out(row: ComboRow) -> AdminCombo:
    combo, glove, glove_type, knife, knife_type, created_by, updated_by = row
    return AdminCombo(
        id=combo.public_id,
        status=combo.status,
        version=combo.version,
        rating=float(combo.rating),
        description=combo.description,
        glove=item(combo, "glove", glove, glove_type),
        knife=item(combo, "knife", knife, knife_type),
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
        glove=item(combo, "glove", glove, glove_type),
        knife=item(combo, "knife", knife, knife_type),
    )


async def find(db: AsyncSession, public_id: str) -> AdminCombo | None:
    row = (await db.execute(combos().where(Combo.public_id == public_id))).first()
    return None if row is None else admin_out(row)
