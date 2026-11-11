"""Every picture URL the API sends is our copy, with the game's URL as the fallback."""

from typing import Any

import pytest
from httpx import AsyncClient

from combo_api.catalog.images import image_key
from combo_api.settings import Settings
from tests.combos.support import create, logged_in

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

GAME_HOST = "https://community.akamai.steamstatic.com/"


def is_copy(picture: dict[str, Any], settings: Settings) -> None:
    assert picture["fallback_image_url"].startswith(GAME_HOST)
    key = image_key(picture["fallback_image_url"])
    assert picture["image_url"] == f"{settings.image_base_url}/{key}"


async def test_catalog_routes(admin_client: AsyncClient, admin_settings: Settings) -> None:
    gloves = (await admin_client.get("/gloves/specialist")).json()
    assert gloves["finishes"]
    for finish in gloves["finishes"]:
        is_copy(finish, admin_settings)
    is_copy((await admin_client.get("/knives/karambit/doppler-ruby")).json(), admin_settings)


async def test_combo_items_and_agents(admin_client: AsyncClient, admin_settings: Settings) -> None:
    headers = await logged_in(admin_client)
    combo = await create(admin_client, headers, glove=("specialist", "mogul"))
    for side in ("glove", "knife"):
        is_copy(combo[side], admin_settings)
    response = await admin_client.post(
        "/admin/combos/publish", json={"ids": [combo["id"]]}, headers=headers
    )
    assert response.status_code == 200
    [public] = (await admin_client.get("/gloves/specialist/mogul/combos")).json()
    for side in ("glove", "knife"):
        is_copy(public[side], admin_settings)
    agents = (await admin_client.get("/admin/agents")).json()
    assert agents
    for agent in agents:
        is_copy(agent, admin_settings)
    settings = (await admin_client.get("/admin/screenshot-settings")).json()
    is_copy(settings["default_agent"], admin_settings)
    query = {"glove_type": "specialist", "glove_finish": "mogul", "knife_finish": "fade"}
    candidates = (await admin_client.get("/admin/batches/candidates", params=query)).json()
    is_copy(candidates["glove"], admin_settings)
    for candidate in candidates["candidates"]:
        is_copy(candidate["knife"], admin_settings)
