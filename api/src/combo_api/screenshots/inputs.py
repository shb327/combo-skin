"""Render inputs, and whether a combo needs a screenshot, as SQL.

A combo's render inputs are what its screenshot is drawn from: both items' definition and
paint indexes with the float and seed they are drawn with, the effective agent, and
`RENDER_REVISION`. They are computed in SQL, so a default agent change or a raised revision
makes combos due without touching their rows.
"""

from typing import Any

from sqlalchemy import (
    ColumnElement,
    Integer,
    Numeric,
    and_,
    case,
    cast,
    func,
    literal,
    or_,
    select,
)
from sqlalchemy.orm import aliased
from sqlalchemy.sql.selectable import LateralFromClause

from combo_api.catalog.models import Agent, Finish, ItemType
from combo_api.combos.models import Combo, ScreenshotSettings
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob

# Raised when the viewer changes how combos look: every combo is then due.
RENDER_REVISION = 1
# Failed attempts for the same render inputs after which a combo is failed.
MAX_ATTEMPTS = 3


def lowest(seeds: Any) -> Any:
    """The lowest seed of an array column, or null when it is empty."""
    seed = func.unnest(seeds).table_valued("seed").render_derived()
    return select(func.min(seed.c.seed)).select_from(seed).scalar_subquery()


def drawn_with(side: str, finish: Any, item_type: Any) -> Any:
    """Float: the start of the combo's range, else the finish's minimum (null for Vanilla).
    Seed: the combo's lowest seed, else null (the viewer's own default)."""
    return func.jsonb_build_object(
        literal("def_index"),
        item_type.def_index,
        literal("paint_index"),
        finish.paint_index,
        literal("float"),
        func.coalesce(getattr(Combo, f"{side}_float_from"), cast(finish.float_min, Numeric)),
        literal("seed"),
        lowest(getattr(Combo, f"{side}_seeds")),
    )


def current_inputs() -> LateralFromClause:
    """A lateral subquery of the outer `Combo`: `value`, its render inputs now, and `agent`,
    the effective agent's definition index."""
    glove, knife = aliased(Finish), aliased(Finish)
    glove_type, knife_type = aliased(ItemType), aliased(ItemType)
    own = aliased(Agent)
    default = (
        select(ScreenshotSettings.default_agent_def_index)
        .where(ScreenshotSettings.id == 1)
        .scalar_subquery()
    )
    agent = func.coalesce(own.def_index, default)
    return (
        select(
            func.jsonb_build_object(
                literal("glove"),
                drawn_with("glove", glove, glove_type),
                literal("knife"),
                drawn_with("knife", knife, knife_type),
                literal("agent"),
                agent,
                literal("render_revision"),
                literal(RENDER_REVISION, Integer),
            ).label("value"),
            agent.label("agent"),
        )
        .select_from(glove)
        .join(glove_type, glove.item_type_id == glove_type.id)
        .join(knife, knife.id == Combo.knife_finish_id)
        .join(knife_type, knife.item_type_id == knife_type.id)
        .outerjoin(own, own.id == Combo.screenshot_agent_id)
        .where(glove.id == Combo.glove_finish_id)
        .correlate(Combo)
        .lateral("current_inputs")
    )


def due(inputs: Any) -> ColumnElement[bool]:
    """No screenshot; one drawn from other inputs; or an admin asked after it was made."""
    return or_(
        ComboScreenshot.combo_id.is_(None),
        ComboScreenshot.inputs.is_distinct_from(inputs),
        and_(
            ScreenshotJob.requested_at.is_not(None),
            ScreenshotJob.requested_at > ComboScreenshot.created_at,
        ),
    )


def attempts(inputs: Any) -> ColumnElement[int]:
    """Failed attempts that count: those for the current inputs only."""
    return case((ScreenshotJob.attempt_inputs == inputs, ScreenshotJob.attempts), else_=literal(0))


def state(inputs: Any) -> ColumnElement[str]:
    return case(
        (~due(inputs), literal("done")),
        (attempts(inputs) >= MAX_ATTEMPTS, literal("failed")),
        (ComboScreenshot.combo_id.is_(None), literal("none")),
        else_=literal("waiting"),
    )


def claimable(inputs: Any, now: Any) -> ColumnElement[bool]:
    """Due, not failed, past its wait after a failure (unless the inputs changed since), and
    with no lease, live or waiting to be counted."""
    return and_(
        due(inputs),
        attempts(inputs) < MAX_ATTEMPTS,
        or_(
            ScreenshotJob.next_attempt_at.is_(None),
            ScreenshotJob.next_attempt_at <= now,
            ScreenshotJob.attempt_inputs.is_distinct_from(inputs),
        ),
        ScreenshotJob.lease_expires_at.is_(None),
    )


def waiting_since(inputs: Any) -> ColumnElement[Any]:
    """When the combo became due, as near as the rows tell: created, asked for, or the later
    of its last change and its screenshot."""
    return case(
        (ComboScreenshot.combo_id.is_(None), Combo.created_at),
        (
            and_(
                ScreenshotJob.requested_at.is_not(None),
                ScreenshotJob.requested_at > ComboScreenshot.created_at,
            ),
            ScreenshotJob.requested_at,
        ),
        else_=func.greatest(Combo.updated_at, ComboScreenshot.created_at),
    )
