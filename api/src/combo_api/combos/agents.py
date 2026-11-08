"""Admin endpoints for agents and the default screenshot agent. Every route depends on
`require_admin`."""

import logging
from typing import Any

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.admins.deps import ADMIN_RESPONSES, AdminDep, Session, error_response, refuse
from combo_api.catalog.models import Agent
from combo_api.combos import queries, rules
from combo_api.combos.models import Combo
from combo_api.combos.models import ScreenshotSettings as SettingsRow
from combo_api.combos.schemas import Agent as AgentOut
from combo_api.combos.schemas import (
    ScreenshotSettings,
    ScreenshotSettingsChanged,
    ScreenshotSettingsIn,
)
from combo_api.screenshots import queue

logger = logging.getLogger("combo_api.combos")
router = APIRouter(prefix="/admin", tags=["admin"], responses=ADMIN_RESPONSES)

# The default agent is not in the catalog: the catalog has not been imported yet.
MISSING: dict[int | str, dict[str, Any]] = {
    status.HTTP_503_SERVICE_UNAVAILABLE: error_response("`default_agent_missing`")
}


@router.get("/agents")
async def list_agents(current: AdminDep, db: Session) -> list[AgentOut]:
    """Agents still in the game: Counter-Terrorists first, then Terrorists, each by name."""
    rows = await db.scalars(select(Agent).where(Agent.active))
    ordered = sorted(rows, key=lambda a: (a.team != "ct", a.name.casefold(), a.def_index))
    return [queries.agent_out(agent) for agent in ordered]


async def settings_out(db: AsyncSession, row: SettingsRow) -> ScreenshotSettings:
    agent = await db.scalar(select(Agent).where(Agent.def_index == row.default_agent_def_index))
    if agent is None:
        raise refuse(status.HTTP_503_SERVICE_UNAVAILABLE, "default_agent_missing")
    using = await db.scalar(
        select(func.count()).select_from(Combo).where(Combo.screenshot_agent_id.is_(None))
    )
    return ScreenshotSettings(default_agent=queries.agent_out(agent), using_default=using or 0)


@router.get("/screenshot-settings", responses=MISSING)
async def get_screenshot_settings(current: AdminDep, db: Session) -> ScreenshotSettings:
    """The default screenshot agent, used by every combo without its own."""
    return await settings_out(db, await db.get_one(SettingsRow, 1))


@router.put("/screenshot-settings", responses=MISSING)
async def replace_screenshot_settings(
    change: ScreenshotSettingsIn, current: AdminDep, db: Session
) -> ScreenshotSettingsChanged:
    """Change the default screenshot agent. Combos without their own agent get a new
    screenshot; `requeued` counts those whose screenshot was done."""
    problems = rules.Problems()
    agent = await rules.resolve_agent(db, change.default_agent, ("body", "default_agent"), problems)
    if agent is None or problems.errors:
        raise problems.error()
    row = await db.get_one(SettingsRow, 1, with_for_update=True)
    done_before = await queue.done_using_default(db)
    row.default_agent_def_index = agent.def_index
    row.updated_at = clock.now()
    row.updated_by = current.id
    await db.flush()
    # Done before the change and due after it; combos drawn with the new default are done again.
    requeued = len(done_before - await queue.done_using_default(db))
    await db.commit()
    settings = await settings_out(db, row)
    logger.info(
        "default agent changed admin=%s def_index=%s using_default=%s requeued=%s",
        current.username,
        agent.def_index,
        settings.using_default,
        requeued,
    )
    return ScreenshotSettingsChanged(**settings.model_dump(), requeued=requeued)
