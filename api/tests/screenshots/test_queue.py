"""Which combos need a screenshot, claims and their leases, failures and releases."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.screenshots import inputs, upload
from combo_api.screenshots.images import Version
from combo_api.screenshots.models import ScreenshotJob
from combo_api.screenshots.workers import CurrentWorker, require_worker
from tests.admins.support import ClientFactory, Clock
from tests.combos.support import create, logged_in
from tests.screenshots.support import png
from tests.screenshots.workers import (
    admin_combo,
    bearer,
    claim,
    make_worker,
    send_png,
    update,
)

pytestmark = [pytest.mark.anyio, pytest.mark.usefixtures("catalog", "admin")]

PNG = png()
MOGUL = ("specialist", "mogul")
FADE = ("karambit", "fade")


@pytest.fixture(autouse=True)
def quick_versions(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip decoding and encoding: these tests are about the queue."""
    monkeypatch.setattr(
        upload,
        "make_versions",
        lambda data: [Version(w, w * 9 // 16, b"webp") for w in (640, 1280, 1920)],
    )


@dataclass
class Setup:
    client: AsyncClient
    headers: dict[str, str]
    box: AsyncClient
    token: str
    clock: Clock

    async def claim(self) -> dict[str, Any] | None:
        return await claim(self.box, self.token)

    async def store(self, job: dict[str, Any]) -> None:
        response = await send_png(self.box, self.token, job["job_id"], PNG)
        assert response.status_code == 201, response.text

    async def render(self, combo_id: str) -> None:
        """Claim the combo and store its screenshot."""
        job = await self.claim()
        assert job is not None and job["combo_id"] == combo_id
        await self.store(job)

    async def state(self, combo_id: str) -> dict[str, Any]:
        state: dict[str, Any] = (await admin_combo(self.client, combo_id))["screenshot_state"]
        return state

    async def fail(self, job: dict[str, Any], reason: str = "render_failed") -> Any:
        return await self.box.post(
            f"/worker/jobs/{job['job_id']}/fail",
            json={"reason": reason, "detail": "placeholder detail"},
            headers=bearer(self.token),
        )

    async def release(self, job: dict[str, Any], reason: str = "shutting_down") -> Any:
        return await self.box.post(
            f"/worker/jobs/{job['job_id']}/release",
            json={"reason": reason},
            headers=bearer(self.token),
        )


@pytest.fixture
async def setup(
    admin_client: AsyncClient, clients: ClientFactory, fake_clock: Clock
) -> AsyncIterator[Setup]:
    headers = await logged_in(admin_client)
    _, token = await make_worker(admin_client, headers)
    yield Setup(admin_client, headers, clients("10.0.0.20"), token, fake_clock)


async def test_due_until_stored_and_again_after_render_inputs_change(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    assert (await setup.state(combo["id"]))["state"] == "none"
    await setup.render(combo["id"])
    assert await setup.claim() is None
    done = await admin_combo(setup.client, combo["id"])
    assert done["screenshot_state"]["state"] == "done"
    shown = done["screenshot"]
    assert shown is not None

    changes: list[dict[str, Any]] = [
        {"knife": {"float_from": 0.01, "float_to": 0.03, "seeds": []}},
        {"knife": {"float_from": 0.01, "float_to": 0.03, "seeds": [12]}},
        {"glove": {"float_from": 0.1, "float_to": 0.2, "seeds": []}},
        {"screenshot_agent": 4613},
    ]
    for change in changes:
        current = await admin_combo(setup.client, combo["id"])
        changed = await update(setup.client, setup.headers, current, **change)
        assert changed["screenshot_state"]["state"] == "waiting", change
        # The current screenshot stays shown until a new one is stored.
        assert changed["screenshot"] == current["screenshot"]
        await setup.render(combo["id"])
        assert (await setup.state(combo["id"]))["state"] == "done"

    current = await admin_combo(setup.client, combo["id"])
    changed = await update(setup.client, setup.headers, current, rating=3.5, description="New.")
    assert changed["screenshot_state"]["state"] == "done"
    assert await setup.claim() is None


async def test_a_new_seed_above_the_lowest_changes_nothing(setup: Setup) -> None:
    combo = await create(
        setup.client,
        setup.headers,
        glove=MOGUL,
        knife=FADE,
        knife_conditions={"float_from": 0.0, "float_to": 0.01, "seeds": [387]},
    )
    await setup.render(combo["id"])
    current = await admin_combo(setup.client, combo["id"])
    changed = await update(
        setup.client,
        setup.headers,
        current,
        knife={"float_from": 0.0, "float_to": 0.01, "seeds": [387, 512]},
    )
    assert changed["screenshot_state"]["state"] == "done"


async def test_default_agent_change_requeues_combos_using_it(setup: Setup) -> None:
    own = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    own = await update(setup.client, setup.headers, own, screenshot_agent=4613)
    defaults = [
        await create(setup.client, setup.headers, glove=MOGUL, knife=("karambit", knife))
        for knife in ("doppler-ruby", "doppler-phase-2", "vanilla")
    ]
    waiting = await create(setup.client, setup.headers, glove=MOGUL, knife=("karambit", "night"))
    for combo in (own, *defaults):
        await setup.render(combo["id"])
    assert [(await setup.state(c["id"]))["state"] for c in (own, *defaults, waiting)] == [
        "done",
        "done",
        "done",
        "done",
        "none",
    ]

    async def change_default(def_index: int) -> dict[str, Any]:
        response = await setup.client.put(
            "/admin/screenshot-settings", json={"default_agent": def_index}, headers=setup.headers
        )
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    # The three done combos using the default are due again; the one with its own agent and
    # the one without a screenshot are not counted.
    changed = await change_default(4619)
    assert (changed["requeued"], changed["using_default"]) == (3, 4)
    assert [(await setup.state(c["id"]))["state"] for c in (own, *defaults, waiting)] == [
        "done",
        "waiting",
        "waiting",
        "waiting",
        "none",
    ]
    assert (await change_default(4619))["requeued"] == 0

    # One is drawn with the new default; switching back requeues only that one.
    await setup.render(defaults[0]["id"])
    changed = await change_default(5404)
    assert changed["requeued"] == 1
    assert [(await setup.state(c["id"]))["state"] for c in defaults] == ["waiting", "done", "done"]


async def test_raising_the_render_revision_makes_every_combo_due(
    setup: Setup, monkeypatch: pytest.MonkeyPatch
) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    await setup.render(combo["id"])
    monkeypatch.setattr(inputs, "RENDER_REVISION", inputs.RENDER_REVISION + 1)
    assert (await setup.state(combo["id"]))["state"] == "waiting"
    job = await setup.claim()
    assert job is not None
    assert job["render_revision"] == inputs.RENDER_REVISION


async def test_asking_for_a_new_screenshot(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    await setup.render(combo["id"])
    setup.clock.advance(seconds=1)
    response = await setup.client.post(
        "/admin/screenshots/request", json={"ids": [combo["id"]]}, headers=setup.headers
    )
    assert response.status_code == 200
    assert response.json() == {"changed": 1}
    assert (await setup.state(combo["id"]))["state"] == "waiting"
    await setup.render(combo["id"])
    assert (await setup.state(combo["id"]))["state"] == "done"

    unknown = await setup.client.post(
        "/admin/screenshots/request",
        json={"ids": [combo["id"], "zzzzzzzzzzzz"]},
        headers=setup.headers,
    )
    assert unknown.status_code == 422
    assert unknown.json()["detail"][0]["loc"] == ["body", "ids", 1]
    bodies: list[dict[str, Any]] = [{"ids": []}, {"ids": ["x"] * 501}]
    for body in bodies:
        response = await setup.client.post(
            "/admin/screenshots/request", json=body, headers=setup.headers
        )
        assert response.status_code == 422


async def test_job_carries_what_the_viewer_needs(setup: Setup) -> None:
    combo = await create(
        setup.client,
        setup.headers,
        glove=MOGUL,
        knife=("karambit", "doppler-phase-2"),
        knife_conditions={"float_from": 0.0, "float_to": 0.01, "seeds": [512, 387]},
    )
    job = await setup.claim()
    assert job is not None
    assert set(job) == {
        "job_id",
        "lease_expires_at",
        "combo_id",
        "image",
        "glove",
        "knife",
        "agent",
        "render_revision",
    }
    assert job["combo_id"] == combo["id"]
    assert job["image"] == {"width": 1920, "height": 1080, "type": "image/png"}
    assert job["glove"] == {
        "def_index": 5034,
        "codename": "specialist_gloves",
        "paint_index": 10064,
        "paint_codename": job["glove"]["paint_codename"],
        "name": "Specialist Gloves | Mogul",
        "float": 0.06,
        "seed": None,
        "float_from": None,
        "float_to": None,
        "seeds": [],
    }
    assert job["knife"] == {
        "def_index": 507,
        "codename": "weapon_knife_karambit",
        "paint_index": 419,
        "paint_codename": job["knife"]["paint_codename"],
        "name": "Karambit | Doppler (Phase 2)",
        "float": 0.0,
        "seed": 387,
        "float_from": 0.0,
        "float_to": 0.01,
        "seeds": [387, 512],
    }
    assert job["agent"] == {
        "def_index": 5404,
        "codename": "customplayer_ctm_st6_varianti",
        "name": job["agent"]["name"],
        "team": "ct",
        "default": True,
    }
    assert job["render_revision"] == inputs.RENDER_REVISION
    for word in ("rating", "description", "status", "created", "updated", "placeholder-admin"):
        assert word not in str(job)


async def test_vanilla_is_drawn_without_a_float(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=("karambit", "vanilla"))
    await update(setup.client, setup.headers, combo, screenshot_agent=4613)
    job = await setup.claim()
    assert job is not None
    assert (job["knife"]["float"], job["knife"]["seed"], job["knife"]["paint_index"]) == (
        None,
        None,
        0,
    )
    assert job["agent"]["def_index"] == 4613
    assert job["agent"]["default"] is False
    assert job["agent"]["team"] == "t"


async def test_published_combos_come_first_then_the_longest_waiting(setup: Setup) -> None:
    older_draft = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    setup.clock.advance(seconds=5)
    published = await create(
        setup.client, setup.headers, glove=MOGUL, knife=("karambit", "doppler-ruby")
    )
    setup.clock.advance(seconds=5)
    newer_draft = await create(
        setup.client, setup.headers, glove=MOGUL, knife=("karambit", "vanilla")
    )
    response = await setup.client.post(
        "/admin/combos/publish", json={"ids": [published["id"]]}, headers=setup.headers
    )
    assert response.status_code == 200
    order = []
    while (job := await setup.claim()) is not None:
        order.append(job["combo_id"])
    assert order == [published["id"], older_draft["id"], newer_draft["id"]]
    assert await setup.claim() is None


async def test_an_expired_lease_counts_as_a_failed_attempt(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    job = await setup.claim()
    assert job is not None
    state = await setup.state(combo["id"])
    assert (state["state"], state["rendering"]) == ("none", True)
    # Another worker asks: the same one asking again would abandon its claim.
    _, other_token = await make_worker(setup.client, setup.headers, "render-box-2")

    async def other() -> dict[str, Any] | None:
        return await claim(setup.box, other_token)

    setup.clock.advance(minutes=4, seconds=59)
    assert await other() is None

    setup.clock.advance(seconds=2)
    assert await other() is None
    state = await setup.state(combo["id"])
    assert state == {
        "state": "none",
        "rendering": False,
        "reason": "lease_expired",
        "attempts": 1,
        "made_at": None,
    }
    late = await send_png(setup.box, setup.token, job["job_id"], PNG)
    assert late.status_code == 409
    assert late.json() == {"detail": "claim_expired"}

    # Due again 1 minute after the lease ran out.
    setup.clock.advance(seconds=58)
    assert await other() is None
    setup.clock.advance(seconds=1)
    assert await other() is not None


async def test_failures_wait_then_fail_the_combo(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    job = await setup.claim()
    assert job is not None
    response = await setup.fail(job)
    assert response.status_code == 204
    state = await setup.state(combo["id"])
    assert (state["state"], state["attempts"], state["reason"]) == ("none", 1, "render_failed")

    setup.clock.advance(seconds=59)
    assert await setup.claim() is None
    setup.clock.advance(seconds=2)
    job = await setup.claim()
    assert job is not None
    assert (await setup.fail(job, "asset_missing")).status_code == 204

    setup.clock.advance(minutes=9, seconds=59)
    assert await setup.claim() is None
    setup.clock.advance(seconds=2)
    job = await setup.claim()
    assert job is not None
    assert (await setup.fail(job, "timeout")).status_code == 204
    state = await setup.state(combo["id"])
    assert (state["state"], state["attempts"], state["reason"]) == ("failed", 3, "timeout")
    setup.clock.advance(minutes=50)
    assert await setup.claim() is None

    # New render inputs start over.
    current = await admin_combo(setup.client, combo["id"])
    changed = await update(
        setup.client, setup.headers, current, knife={"float_from": 0.01, "float_to": 0.02}
    )
    assert changed["screenshot_state"]["attempts"] == 0
    assert changed["screenshot_state"]["state"] == "none"
    job = await setup.claim()
    assert job is not None
    for _ in range(2):
        assert (await setup.fail(job)).status_code == 204
        setup.clock.advance(minutes=11)
        job = await setup.claim()
        assert job is not None
    assert (await setup.fail(job)).status_code == 204
    assert (await setup.state(combo["id"]))["state"] == "failed"

    # So does asking for a new screenshot.
    response = await setup.client.post(
        "/admin/screenshots/request", json={"ids": [combo["id"]]}, headers=setup.headers
    )
    assert response.status_code == 200
    state = await setup.state(combo["id"])
    assert (state["state"], state["attempts"], state["reason"]) == ("none", 0, None)
    assert await setup.claim() is not None


async def test_release_frees_the_combo_without_counting(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    job = await setup.claim()
    assert job is not None
    response = await setup.release(job, "gpu_unavailable")
    assert response.status_code == 204
    state = await setup.state(combo["id"])
    assert (state["attempts"], state["rendering"]) == (0, False)

    # The released claim is closed.
    for answer in (setup.fail, setup.release):
        response = await answer(job)
        assert response.status_code == 409
        assert response.json() == {"detail": "claim_expired"}
    late = await send_png(setup.box, setup.token, job["job_id"], PNG)
    assert late.status_code == 409

    again = await setup.claim()
    assert again is not None and again["combo_id"] == combo["id"]
    assert again["job_id"] != job["job_id"]
    # Once the combo is claimed again, the old job id is unknown.
    assert (await setup.fail(job)).status_code == 404


async def test_answers_after_the_lease_or_from_another_worker(
    setup: Setup, clients: ClientFactory
) -> None:
    await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    _, other_token = await make_worker(setup.client, setup.headers, "render-box-2")
    other = clients("10.0.0.21")
    job = await setup.claim()
    assert job is not None
    for path, body in (
        ("fail", {"reason": "render_failed"}),
        ("release", {"reason": "shutting_down"}),
    ):
        response = await other.post(
            f"/worker/jobs/{job['job_id']}/{path}", json=body, headers=bearer(other_token)
        )
        assert response.status_code == 404
        assert response.json() == {"detail": "job_not_found"}
    stranger = await send_png(other, other_token, job["job_id"], PNG)
    assert stranger.status_code == 404
    unknown = await setup.box.post(
        "/worker/jobs/zzzzzzzzzzzz/fail", json={"reason": "timeout"}, headers=bearer(setup.token)
    )
    assert unknown.status_code == 404

    setup.clock.advance(minutes=5, seconds=1)
    for answer in (setup.fail, setup.release):
        response = await answer(job)
        assert response.status_code == 409
        assert response.json() == {"detail": "claim_expired"}


async def test_failure_reasons_and_details_are_checked(setup: Setup) -> None:
    await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    job = await setup.claim()
    assert job is not None
    for path, body in (
        ("fail", {"reason": "lease_expired"}),
        ("fail", {"reason": "render_failed", "detail": "x" * 301}),
        ("release", {"reason": "render_failed"}),
    ):
        response = await setup.box.post(
            f"/worker/jobs/{job['job_id']}/{path}", json=body, headers=bearer(setup.token)
        )
        assert response.status_code == 422, body


async def test_revoking_a_worker_releases_its_claims(setup: Setup) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    worker, token = await make_worker(setup.client, setup.headers, "render-box-3")
    job = await claim(setup.box, token)
    assert job is not None
    revoked = await setup.client.post(
        f"/admin/workers/{worker['id']}/revoke", headers=setup.headers
    )
    assert revoked.status_code == 200
    state = await setup.state(combo["id"])
    assert (state["rendering"], state["attempts"]) == (False, 0)
    again = await setup.claim()
    assert again is not None and again["combo_id"] == combo["id"]


async def test_a_worker_revoked_mid_request_cannot_claim_or_answer(
    setup: Setup, app: FastAPI, db_session: AsyncSession
) -> None:
    """A request authenticated just before a revoke commits: the claim and the answers check
    the worker again, under a lock that a revoke waits for."""
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    worker, token = await make_worker(setup.client, setup.headers, "render-box-4")
    job = await claim(setup.box, token)
    assert job is not None
    stale = CurrentWorker(id=worker["id"], name=worker["name"])
    app.dependency_overrides[require_worker] = lambda: stale
    try:
        revoked = await setup.client.post(
            f"/admin/workers/{worker['id']}/revoke", headers=setup.headers
        )
        assert revoked.status_code == 200
        response = await setup.box.post("/worker/jobs/claim", headers=bearer(token))
        assert response.status_code == 401
        assert response.json() == {"detail": "not_authenticated"}
        for path, body in (
            ("fail", {"reason": "timeout"}),
            ("release", {"reason": "shutting_down"}),
        ):
            answer = await setup.box.post(
                f"/worker/jobs/{job['job_id']}/{path}", json=body, headers=bearer(token)
            )
            assert answer.status_code == 401, path
        sent = await send_png(setup.box, token, job["job_id"], PNG)
        assert sent.status_code == 401
    finally:
        del app.dependency_overrides[require_worker]
    jobs = (await db_session.scalars(select(ScreenshotJob))).all()
    assert [(j.worker_id, j.lease_expires_at) for j in jobs] == [(worker["id"], None)]
    assert (await setup.state(combo["id"]))["attempts"] == 0


async def test_a_request_during_a_render_asks_for_another(setup: Setup) -> None:
    """A render claimed before the request does not answer it: the combo stays due."""
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    await setup.render(combo["id"])
    setup.clock.advance(seconds=5)
    response = await setup.client.post(
        "/admin/screenshots/request", json={"ids": [combo["id"]]}, headers=setup.headers
    )
    assert response.status_code == 200
    job = await setup.claim()
    assert job is not None
    setup.clock.advance(seconds=5)
    again = await setup.client.post(
        "/admin/screenshots/request", json={"ids": [combo["id"]]}, headers=setup.headers
    )
    assert again.status_code == 200
    setup.clock.advance(seconds=5)
    await setup.store(job)
    state = await setup.state(combo["id"])
    assert state["state"] == "waiting"
    await setup.render(combo["id"])
    assert (await setup.state(combo["id"]))["state"] == "done"


async def test_a_worker_holds_one_claim(setup: Setup, db_session: AsyncSession) -> None:
    """A worker that claims again gives up its earlier claim, counted as an abandoned attempt,
    so it never holds more than one, and a combo that keeps crashing it still fails."""
    first_combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    await create(setup.client, setup.headers, glove=MOGUL, knife=("butterfly", "fade"))
    first = await setup.claim()
    assert first is not None and first["combo_id"] == first_combo["id"]
    second = await setup.claim()
    assert second is not None and second["combo_id"] != first_combo["id"]

    live = (
        await db_session.scalars(
            select(ScreenshotJob.job_id).where(ScreenshotJob.lease_expires_at.is_not(None))
        )
    ).all()
    assert live == [second["job_id"]]
    state = await setup.state(first_combo["id"])
    assert (state["rendering"], state["attempts"], state["reason"]) == (False, 1, "abandoned")
    late = await setup.fail(first)
    assert late.status_code == 409
    assert late.json() == {"detail": "claim_expired"}
    stored = await send_png(setup.box, setup.token, first["job_id"], PNG)
    assert stored.status_code == 409


async def test_claiming_again_with_nothing_due_still_gives_up_the_earlier_claim(
    setup: Setup,
) -> None:
    combo = await create(setup.client, setup.headers, glove=MOGUL, knife=FADE)
    first = await setup.claim()
    assert first is not None and first["combo_id"] == combo["id"]
    # The only combo is the one held: nothing else is due, and it waits after the abandon.
    assert await setup.claim() is None
    state = await setup.state(combo["id"])
    assert (state["rendering"], state["attempts"], state["reason"]) == (False, 1, "abandoned")
    late = await setup.fail(first)
    assert late.status_code == 409
