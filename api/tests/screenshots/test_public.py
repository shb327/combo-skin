"""Screenshots in the public combo lists."""

import re

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.screenshots.models import ComboScreenshot
from combo_api.settings import Settings
from tests.admins.support import ClientFactory
from tests.combos.support import create, logged_in
from tests.screenshots.support import png
from tests.screenshots.workers import admin_combo, claim, make_worker, send_png, update

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

LIST = "/gloves/specialist/mogul/combos"


async def test_public_combos_carry_their_screenshot_only(
    admin_client: AsyncClient,
    clients: ClientFactory,
    db_session: AsyncSession,
    test_settings: Settings,
) -> None:
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.50")
    pictured = await create(
        admin_client, headers, glove=("specialist", "mogul"), knife=("karambit", "fade")
    )
    plain = await create(
        admin_client,
        headers,
        glove=("specialist", "mogul"),
        knife=("karambit", "vanilla"),
        rating=5,
    )
    job = await claim(box, token)
    assert job is not None and job["combo_id"] == pictured["id"]
    assert (await send_png(box, token, job["job_id"], png())).status_code == 201
    published = await admin_client.post(
        "/admin/combos/publish", json={"ids": [pictured["id"], plain["id"]]}, headers=headers
    )
    assert published.status_code == 200

    public = clients("10.0.0.51")
    response = await public.get(LIST)
    assert response.status_code == 200
    by_id = {combo["id"]: combo for combo in response.json()}
    assert by_id[plain["id"]]["screenshot"] is None
    screenshot = by_id[pictured["id"]]["screenshot"]
    assert (screenshot["width"], screenshot["height"]) == (1920, 1080)
    assert [image["width"] for image in screenshot["images"]] == [640, 1280, 1920]
    for image in screenshot["images"]:
        assert image["url"].startswith(f"{test_settings.image_base_url}/combos/{pictured['id']}/")
        assert image["url"].endswith(f"/{image['width']}.webp")
        assert set(image) == {"url", "width", "height", "type"}

    shot = await db_session.scalar(select(ComboScreenshot))
    assert shot is not None
    # Originals are PNGs under combos/; the catalog's pictures are PNGs under catalog/.
    assert not re.search(r"combos/[^\"]*\.png", response.text)
    for word in (
        shot.original_key,
        "originals",
        "screenshot_state",
        "state",
        "rendering",
        "attempts",
        "screenshot_agent",
        "agent",
        "worker",
        "render-box",
    ):
        assert word not in response.text, word

    # The knife finish's list carries the same screenshot and nothing more.
    knife_list = await public.get("/knives/karambit/fade/combos")
    assert knife_list.status_code == 200
    assert [c["screenshot"] for c in knife_list.json()] == [screenshot]
    assert not re.search(r"combos/[^\"]*\.png", knife_list.text)
    for word in (shot.original_key, "originals", "state", "agent", "worker"):
        assert word not in knife_list.text, word

    # Changed render inputs: the old screenshot stays until a new one is stored.
    current = await admin_combo(admin_client, pictured["id"])
    await update(admin_client, headers, current, knife={"float_from": 0.01, "float_to": 0.02})
    again = {c["id"]: c for c in (await public.get(LIST)).json()}
    assert again[pictured["id"]]["screenshot"] == screenshot
    counts = await public.get("/combo-counts")
    assert "screenshot" not in counts.text
