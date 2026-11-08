"""`rebuild` and `sweep`, on in-memory storage."""

import io
from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.screenshots import commands, images
from combo_api.screenshots.models import ComboScreenshot
from combo_api.screenshots.storage import MemoryStorage
from tests.admins.support import ClientFactory, Clock
from tests.combos.support import create, logged_in
from tests.screenshots.support import png
from tests.screenshots.workers import admin_combo, claim, make_worker, send_png

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]


class Lines(list[str]):
    def __call__(self, line: str) -> None:
        self.append(line)


@pytest.fixture
async def two_screenshots(
    admin_client: AsyncClient, clients: ClientFactory, storage: MemoryStorage, fake_clock: Clock
) -> AsyncIterator[list[dict[str, Any]]]:
    """Two combos with stored screenshots; storage dates objects by the test clock."""
    storage.now = fake_clock
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.40")
    combos = [
        await create(admin_client, headers, glove=("specialist", "mogul"), knife=knife)
        for knife in (("karambit", "fade"), ("karambit", "vanilla"))
    ]
    for _ in combos:
        job = await claim(box, token)
        assert job is not None
        assert (await send_png(box, token, job["job_id"], png())).status_code == 201
    yield [await admin_combo(admin_client, combo["id"]) for combo in combos]


async def shots(db: AsyncSession) -> dict[int, tuple[str, str, int]]:
    rows = await db.scalars(select(ComboScreenshot).execution_options(populate_existing=True))
    return {s.combo_id: (s.original_key, s.version_id, s.watermark_revision) for s in rows}


async def test_rebuild_remakes_versions_from_the_originals(
    two_screenshots: list[dict[str, Any]],
    db_session: AsyncSession,
    storage: MemoryStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = await shots(db_session)
    originals = {
        key: (await storage.get("originals", key)).data for key in storage.keys("originals")
    }
    old_versions = storage.keys("public")
    # Replace one original's pixels, to see the versions are made from the original.
    red = Image.new("RGB", (1920, 1080), (200, 0, 0))
    buffer = io.BytesIO()
    red.save(buffer, format="PNG")
    first_original = next(iter(before.values()))[0]
    await storage.put("originals", first_original, buffer.getvalue(), "image/png")
    originals[first_original] = buffer.getvalue()

    monkeypatch.setattr(images, "WATERMARK_REVISION", images.WATERMARK_REVISION + 1)
    said = Lines()
    assert await commands.rebuild(db_session, storage, say=said) == 0
    assert said == ["Rebuilt 2 screenshots, 0 failed"]

    after = await shots(db_session)
    for combo_id, (original, version, revision) in after.items():
        assert original == before[combo_id][0]
        assert version != before[combo_id][1]
        assert revision == images.WATERMARK_REVISION
    assert storage.keys("public").isdisjoint(old_versions)
    assert len(storage.keys("public")) == 6
    for key, data in originals.items():
        assert (await storage.get("originals", key)).data == data

    first = next(s for s in after.values() if s[0] == first_original)
    public_id = first_original.split("/")[1]
    blob = await storage.get("public", f"combos/{public_id}/{first[1]}/640.webp")
    pixel = Image.open(io.BytesIO(blob.data)).convert("RGB").getpixel((100, 100))
    assert isinstance(pixel, tuple) and pixel[0] > 150 and pixel[1] < 50


async def test_rebuild_reports_a_missing_original(
    two_screenshots: list[dict[str, Any]], db_session: AsyncSession, storage: MemoryStorage
) -> None:
    missing = sorted(storage.keys("originals"))[0]
    await storage.delete("originals", missing)
    said = Lines()
    assert await commands.rebuild(db_session, storage, say=said) == 1
    assert said[-1] == "Rebuilt 1 screenshots, 1 failed"
    assert any(missing in line for line in said)


async def test_sweep_removes_old_unreferenced_objects_only(
    two_screenshots: list[dict[str, Any]],
    admin_client: AsyncClient,
    db_session: AsyncSession,
    storage: MemoryStorage,
    fake_clock: Clock,
) -> None:
    referenced = set(storage.objects)
    await storage.put("originals", "combos/old/orphan.png", b"x", "image/png")
    await storage.put("public", "combos/old/orphan/640.webp", b"x", "image/webp")
    # Objects outside combos/ belong to something else and are never swept.
    await storage.put("public", "finishes/other.webp", b"x", "image/webp")
    fake_clock.advance(days=1, seconds=1)
    await storage.put("public", "combos/young/orphan/640.webp", b"x", "image/webp")
    old = {("originals", "combos/old/orphan.png"), ("public", "combos/old/orphan/640.webp")}

    said = Lines()
    assert await commands.sweep(db_session, storage, dry_run=True, say=said) == 0
    assert said == [
        "originals: combos/old/orphan.png",
        "originals: 3 objects, 1 unreferenced (dry run)",
        "public: combos/old/orphan/640.webp",
        "public: 8 objects, 1 unreferenced (dry run)",
    ]
    assert old <= set(storage.objects)

    said = Lines()
    assert await commands.sweep(db_session, storage, dry_run=False, say=said) == 0
    assert said == [
        "originals: 3 objects, 1 deleted, 0 failed",
        "public: 8 objects, 1 deleted, 0 failed",
    ]
    assert set(storage.objects) == referenced | {
        ("public", "combos/young/orphan/640.webp"),
        ("public", "finishes/other.webp"),
    }


async def test_sweep_removes_what_a_failed_delete_left(
    two_screenshots: list[dict[str, Any]],
    admin_client: AsyncClient,
    clients: ClientFactory,
    db_session: AsyncSession,
    storage: MemoryStorage,
    fake_clock: Clock,
) -> None:
    combo = two_screenshots[0]
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers, "render-box-2")
    box = clients("10.0.0.41")
    fake_clock.advance(seconds=1)
    await admin_client.post(
        "/admin/screenshots/request", json={"ids": [combo["id"]]}, headers=headers
    )
    job = await claim(box, token)
    assert job is not None
    before = set(storage.objects)
    storage.fail_deletes = True
    assert (await send_png(box, token, job["job_id"], png())).status_code == 201
    storage.fail_deletes = False
    left = before & set(storage.objects)
    assert len(before) == 8 and len(storage.objects) == 12

    fake_clock.advance(days=1, seconds=1)
    assert await commands.sweep(db_session, storage, dry_run=False, say=Lines()) == 0
    assert len(storage.objects) == 8
    assert not {o for o in left if combo["id"] in o[1]} & set(storage.objects)
    await logged_in(admin_client)
    shown = (await admin_combo(admin_client, combo["id"]))["screenshot"]
    for image in shown["images"]:
        key = image["url"].split("/", 4)[-1]
        assert any(key.endswith(k) for _, k in storage.objects)


async def test_rebuild_goes_on_past_an_original_it_cannot_use(
    two_screenshots: list[dict[str, Any]], db_session: AsyncSession, storage: MemoryStorage
) -> None:
    before = await shots(db_session)
    broken = sorted(storage.keys("originals"))[0]
    await storage.put("originals", broken, b"not a png", "image/png")
    old_versions = storage.keys("public")
    said = Lines()
    assert await commands.rebuild(db_session, storage, say=said) == 1
    assert said[-1] == "Rebuilt 1 screenshots, 1 failed"
    assert any(broken in line for line in said)
    after = await shots(db_session)
    unchanged = [c for c, s in after.items() if s[0] == broken]
    assert after[unchanged[0]] == before[unchanged[0]]
    # The broken one keeps its old versions; the other has new ones only.
    assert len(storage.keys("public")) == 6
    assert len(old_versions & storage.keys("public")) == 3
