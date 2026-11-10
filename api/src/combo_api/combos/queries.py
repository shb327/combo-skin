"""Loading combos with their finishes, types and admins, and building responses from them."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Row, Select, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from combo_api.admins import clock
from combo_api.admins.deps import refuse
from combo_api.admins.models import Admin
from combo_api.catalog.models import Agent, Finish, ItemType
from combo_api.catalog.routes import Rarity
from combo_api.combos.ids import new_public_id
from combo_api.combos.models import Combo
from combo_api.combos.schemas import (
    AdminCombo,
    Conditions,
    Item,
    PublicCombo,
    decimal,
    number,
)
from combo_api.combos.schemas import Agent as AgentOut
from combo_api.screenshots import inputs
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob
from combo_api.screenshots.shapes import screenshot_out, state_out

GloveFinish = aliased(Finish, name="glove_finish")
GloveType = aliased(ItemType, name="glove_type")
KnifeFinish = aliased(Finish, name="knife_finish")
KnifeType = aliased(ItemType, name="knife_type")
Creator = aliased(Admin, name="creator")
Updater = aliased(Admin, name="updater")

# What the public sees: the combo lists and their counts use this one condition.
PUBLISHED = Combo.status == "published"

ComboColumns = tuple[
    Combo, Finish, ItemType, Finish, ItemType, str, str, Agent | None, ComboScreenshot | None
]
ComboRow = Row[*ComboColumns]
AdminColumns = tuple[
    Combo,
    Finish,
    ItemType,
    Finish,
    ItemType,
    str,
    str,
    Agent | None,
    ComboScreenshot | None,
    ScreenshotJob | None,
    str,
    int,
]
AdminRow = Row[*AdminColumns]


def combos() -> Select[*ComboColumns]:
    """Combos with their finishes, types, admins, own agent and current screenshot."""
    return (
        select(
            Combo,
            GloveFinish,
            GloveType,
            KnifeFinish,
            KnifeType,
            Creator.username,
            Updater.username,
            Agent,
            ComboScreenshot,
        )
        .join(GloveFinish, Combo.glove_finish_id == GloveFinish.id)
        .join(GloveType, GloveFinish.item_type_id == GloveType.id)
        .join(KnifeFinish, Combo.knife_finish_id == KnifeFinish.id)
        .join(KnifeType, KnifeFinish.item_type_id == KnifeType.id)
        .join(Creator, Combo.created_by == Creator.id)
        .join(Updater, Combo.updated_by == Updater.id)
        .outerjoin(Agent, Combo.screenshot_agent_id == Agent.id)
        .outerjoin(ComboScreenshot, ComboScreenshot.combo_id == Combo.id)
    )


def admin_combos() -> Select[*AdminColumns]:
    """`combos()` with each combo's screenshot job, state and counted attempts."""
    current = inputs.current_inputs()
    return (
        combos()
        .add_columns(
            ScreenshotJob,
            inputs.state(current.c.value).label("screenshot_state"),
            inputs.attempts(current.c.value).label("screenshot_attempts"),
        )
        .outerjoin(ScreenshotJob, ScreenshotJob.combo_id == Combo.id)
        .join(current, true())
    )


def new_combo(
    glove: Finish,
    knife: Finish,
    glove_conditions: Conditions,
    knife_conditions: Conditions,
    rating: float,
    description: str | None,
    screenshot_agent_id: int | None,
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
        screenshot_agent_id=screenshot_agent_id,
        status="draft",
        version=1,
        created_at=now,
        updated_at=now,
        created_by=admin_id,
        updated_by=admin_id,
    )


# The constraints a new combo can meet when another request wrote first.
PAIRING_CONSTRAINT = "uq_combos_glove_finish_id_knife_finish_id"
PUBLIC_ID_CONSTRAINT = "uq_combos_public_id"
# Draws of public ids before a collision is an error: one is already about one in 10^18.
ID_DRAWS = 3


def violated(error: IntegrityError) -> str | None:
    """The name of the constraint a database error is about, if it names one."""
    name = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    return name if isinstance(name, str) else None


async def insert(db: AsyncSession, rows: list[Combo]) -> None:
    """Insert new combos in a savepoint, so a refusal leaves the request's transaction (and its
    locks) as it was. A pairing another request stored after this one's existence check is 409
    `combo_exists`; a public id that is already taken is drawn again."""
    for draw in range(1, ID_DRAWS + 1):
        try:
            async with db.begin_nested():
                db.add_all(rows)
        except IntegrityError as error:
            constraint = violated(error)
            if constraint == PAIRING_CONSTRAINT:
                raise refuse(409, "combo_exists") from None
            if constraint != PUBLIC_ID_CONSTRAINT or draw == ID_DRAWS:
                raise
            for row in rows:
                row.public_id = new_public_id()
        else:
            return


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
        def_index=item_type.def_index,
        paint_index=finish.paint_index,
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


def agent_out(agent: Agent) -> AgentOut:
    return AgentOut(
        def_index=agent.def_index,
        name=agent.name,
        team=agent.team,
        image_url=agent.image_url,
        rarity=Rarity(code=agent.rarity_code, name=agent.rarity_name, color=agent.rarity_color),
        active=agent.active,
    )


def admin_out(row: AdminRow, base_url: str) -> AdminCombo:
    combo, glove, glove_type, knife, knife_type, created_by, updated_by, agent, shot = row[:9]
    job, state, attempts = row[9:]
    return AdminCombo(
        id=combo.public_id,
        status=combo.status,
        version=combo.version,
        rating=float(combo.rating),
        description=combo.description,
        glove=combo_item(combo, "glove", glove, glove_type),
        knife=combo_item(combo, "knife", knife, knife_type),
        screenshot_agent=None if agent is None else agent_out(agent),
        screenshot=screenshot_out(combo.public_id, shot, base_url),
        screenshot_state=state_out(shot, job, state, attempts, clock.now()),
        created_at=combo.created_at,
        created_by=created_by,
        updated_at=combo.updated_at,
        updated_by=updated_by,
        published_at=combo.published_at,
    )


def public_out(row: ComboRow, base_url: str) -> PublicCombo:
    combo, glove, glove_type, knife, knife_type, *_, shot = row
    return PublicCombo(
        id=combo.public_id,
        rating=float(combo.rating),
        description=combo.description,
        glove=combo_item(combo, "glove", glove, glove_type),
        knife=combo_item(combo, "knife", knife, knife_type),
        screenshot=screenshot_out(combo.public_id, shot, base_url),
    )


async def find(db: AsyncSession, public_id: str, base_url: str) -> AdminCombo | None:
    row = (await db.execute(admin_combos().where(Combo.public_id == public_id))).first()
    return None if row is None else admin_out(row, base_url)
