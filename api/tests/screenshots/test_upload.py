"""Sending screenshots: what is stored, what is refused, and replacing a screenshot."""

import hashlib
import io
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.screenshots import images, queue, upload
from combo_api.screenshots.models import ComboScreenshot
from combo_api.screenshots.storage import IMMUTABLE, MemoryStorage
from combo_api.settings import Settings
from tests.admins.support import ClientFactory, Clock
from tests.combos.support import create, logged_in
from tests.screenshots.support import png, png_16_bit, png_header_only, png_with_metadata
from tests.screenshots.workers import admin_combo, bearer, claim, make_worker, send_png, update

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

ORIGINAL = png_with_metadata()
MOGUL = ("specialist", "mogul")
FADE = ("karambit", "fade")


@dataclass
class Setup:
    client: AsyncClient
    headers: dict[str, str]
    box: AsyncClient
    token: str
    storage: MemoryStorage
    clock: Clock
    combo: dict[str, Any]
    job: dict[str, Any]

    async def send(self, data: bytes, **headers: str) -> Any:
        return await self.box.put(
            f"/worker/jobs/{self.job['job_id']}/screenshot",
            content=data,
            headers={**bearer(self.token), "Content-Type": "image/png", **headers},
        )

    async def state(self) -> dict[str, Any]:
        state: dict[str, Any] = (await admin_combo(self.client, self.combo["id"]))[
            "screenshot_state"
        ]
        return state


@pytest.fixture
async def setup(
    admin_client: AsyncClient,
    clients: ClientFactory,
    storage: MemoryStorage,
    fake_clock: Clock,
) -> AsyncIterator[Setup]:
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    box = clients("10.0.0.30")
    combo = await create(admin_client, headers, glove=MOGUL, knife=FADE)
    job = await claim(box, token)
    assert job is not None
    yield Setup(admin_client, headers, box, token, storage, fake_clock, combo, job)


async def test_a_screenshot_is_stored_with_its_versions(
    setup: Setup, db_session: AsyncSession, test_settings: Settings
) -> None:
    response = await setup.send(ORIGINAL)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["combo_id"] == setup.combo["id"]
    images = body["screenshot"]["images"]
    assert (body["screenshot"]["width"], body["screenshot"]["height"]) == (1920, 1080)
    assert [(i["width"], i["height"], i["type"]) for i in images] == [
        (640, 360, "image/webp"),
        (1280, 720, "image/webp"),
        (1920, 1080, "image/webp"),
    ]

    shot = await db_session.scalar(select(ComboScreenshot))
    assert shot is not None
    assert shot.original_key.startswith(f"combos/{setup.combo['id']}/")
    original = await setup.storage.get("originals", shot.original_key)
    assert original.data == ORIGINAL
    assert shot.original_sha256 == hashlib.sha256(ORIGINAL).digest()
    assert setup.storage.keys("originals") == {shot.original_key}

    prefix = f"{test_settings.image_base_url}/"
    keys = {f"combos/{setup.combo['id']}/{shot.version_id}/{w}.webp" for w in (640, 1280, 1920)}
    assert setup.storage.keys("public") == keys
    for image in images:
        assert image["url"].startswith(prefix)
        blob = await setup.storage.get("public", image["url"].removeprefix(prefix))
        assert blob.content_type == "image/webp"
        assert blob.cache_control == IMMUTABLE == "public, max-age=31536000, immutable"
        decoded = Image.open(io.BytesIO(blob.data))
        assert decoded.format == "WEBP"
        assert decoded.size == (image["width"], image["height"])
        assert not decoded.getexif()
        assert not {"exif", "xmp", "icc_profile"} & set(decoded.info)
        assert b"placeholder" not in blob.data

    state = await setup.state()
    assert (state["state"], state["rendering"], state["attempts"]) == ("done", False, 0)
    assert state["made_at"] is not None
    again = await setup.send(ORIGINAL)
    assert again.status_code == 409
    assert again.json() == {"detail": "claim_expired"}


async def body_over_the_limit() -> AsyncIterator[bytes]:
    chunk = b"\x00" * (1024 * 1024)
    for _ in range(17):
        yield chunk


@pytest.fixture
def no_decoding(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse_to_decode(data: bytes) -> Any:
        raise AssertionError("decoded")

    monkeypatch.setattr(upload, "make_versions", refuse_to_decode)


@pytest.mark.usefixtures("no_decoding")
@pytest.mark.parametrize(
    ("data", "headers", "status", "code"),
    [
        (b"\x00" * (16 * 1024 * 1024 + 1), {}, 413, "too_large"),
        (png(), {"Content-Type": "image/jpeg"}, 415, "unsupported_media_type"),
        (png(), {"Content-Type": "application/octet-stream"}, 415, "unsupported_media_type"),
        (png(1280, 720), {}, 422, "wrong_size"),
        (png_16_bit(), {}, 422, "bad_pixel_format"),
        (png_header_only(50_000, 50_000), {}, 422, "wrong_size"),
        (b"\xff\xd8\xff\xe0 placeholder jpeg", {}, 422, "not_png"),
    ],
)
async def test_refusals_before_decoding(
    setup: Setup, data: bytes, headers: dict[str, str], status: int, code: str
) -> None:
    response = await setup.send(data, **headers)
    assert response.status_code == status, response.text
    assert response.json() == {"detail": code}
    assert setup.storage.objects == {}
    assert (await setup.state())["rendering"] is True


async def test_a_false_content_length_does_not_pass_the_limit(setup: Setup) -> None:
    response = await setup.box.put(
        f"/worker/jobs/{setup.job['job_id']}/screenshot",
        content=body_over_the_limit(),
        headers={**bearer(setup.token), "Content-Type": "image/png", "Content-Length": "100"},
    )
    assert response.status_code == 413
    assert response.json() == {"detail": "too_large"}
    assert setup.storage.objects == {}
    assert (await setup.state())["rendering"] is True


async def test_bodies_that_only_look_like_png(setup: Setup) -> None:
    jpeg = io.BytesIO()
    Image.new("RGB", (1920, 1080)).save(jpeg, format="JPEG")
    whole = png()
    for data in (jpeg.getvalue(), whole[: len(whole) // 2], png_header_only(1920, 1080)):
        response = await setup.send(data)
        assert response.status_code == 422
        assert response.json() == {"detail": "not_png"}
    assert setup.storage.objects == {}
    assert (await setup.state())["rendering"] is True


async def test_too_late_or_for_changed_inputs(setup: Setup, fake_clock: Clock) -> None:
    current = await admin_combo(setup.client, setup.combo["id"])
    await update(setup.client, setup.headers, current, knife={"float_from": 0.01, "float_to": 0.02})
    response = await setup.send(ORIGINAL)
    assert response.status_code == 409
    assert response.json() == {"detail": "inputs_changed"}
    assert setup.storage.objects == {}
    state = await setup.state()
    assert (state["state"], state["rendering"], state["attempts"]) == ("none", False, 0)

    job = await claim(setup.box, setup.token)
    assert job is not None and job["combo_id"] == setup.combo["id"]
    fake_clock.advance(minutes=5, seconds=1)
    late = await send_png(setup.box, setup.token, job["job_id"], ORIGINAL)
    assert late.status_code == 409
    assert late.json() == {"detail": "claim_expired"}
    assert setup.storage.objects == {}


async def test_inputs_changed_while_processing(
    setup: Setup, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The combo changes after the first check: the new objects are deleted again."""
    real = images.make_versions
    combo = await admin_combo(setup.client, setup.combo["id"])

    async def changed_inputs(*args: Any) -> Any:
        return {"changed": True}

    def make_and_change(data: bytes) -> Any:
        monkeypatch.setattr(queue, "inputs_now", changed_inputs)
        return real(data)

    monkeypatch.setattr(upload, "make_versions", make_and_change)
    response = await setup.send(ORIGINAL)
    assert response.status_code == 409
    assert response.json() == {"detail": "inputs_changed"}
    assert setup.storage.objects == {}
    assert (await admin_combo(setup.client, combo["id"]))["screenshot"] is None


async def test_a_new_screenshot_replaces_the_old_one(
    setup: Setup, db_session: AsyncSession
) -> None:
    assert (await setup.send(ORIGINAL)).status_code == 201
    first = await db_session.scalar(select(ComboScreenshot))
    assert first is not None
    old_original, old_version = first.original_key, first.version_id
    old_keys = setup.storage.keys("public")

    second = await request_and_send(setup, png())
    shot = await db_session.scalar(select(ComboScreenshot))
    assert shot is not None
    assert shot.version_id != old_version and shot.original_key != old_original
    assert setup.storage.keys("originals") == {shot.original_key}
    assert setup.storage.keys("public").isdisjoint(old_keys)
    assert len(setup.storage.keys("public")) == 3
    assert all(shot.version_id in image["url"] for image in second["screenshot"]["images"])


async def request_and_send(setup: Setup, data: bytes) -> dict[str, Any]:
    setup.clock.advance(seconds=1)
    response = await setup.client.post(
        "/admin/screenshots/request", json={"ids": [setup.combo["id"]]}, headers=setup.headers
    )
    assert response.status_code == 200
    job = await claim(setup.box, setup.token)
    assert job is not None
    sent = await send_png(setup.box, setup.token, job["job_id"], data)
    assert sent.status_code == 201, sent.text
    stored: dict[str, Any] = sent.json()
    return stored


async def test_a_failed_delete_leaves_the_new_screenshot_in_place(
    setup: Setup, db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    assert (await setup.send(ORIGINAL)).status_code == 201
    old = set(setup.storage.objects)
    setup.storage.fail_deletes = True
    stored = await request_and_send(setup, png())
    assert old < set(setup.storage.objects)
    assert "object delete failed" in caplog.text
    shown = (await admin_combo(setup.client, setup.combo["id"]))["screenshot"]
    assert shown == stored["screenshot"]


async def test_removing_a_combo_deletes_its_objects(setup: Setup) -> None:
    assert (await setup.send(ORIGINAL)).status_code == 201
    assert setup.storage.objects
    combo = await admin_combo(setup.client, setup.combo["id"])
    response = await setup.client.delete(
        f"/admin/combos/{combo['id']}", params={"version": combo["version"]}, headers=setup.headers
    )
    assert response.status_code == 204
    assert setup.storage.objects == {}
