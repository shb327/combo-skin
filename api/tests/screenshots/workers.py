"""Helpers for screenshot tests."""

from typing import Any

from httpx import AsyncClient


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def make_worker(
    client: AsyncClient, headers: dict[str, str], name: str = "render-box-1"
) -> tuple[dict[str, Any], str]:
    """Create a worker through the admin API; returns the worker and its token."""
    response = await client.post("/admin/workers", json={"name": name}, headers=headers)
    assert response.status_code == 201, response.text
    body = response.json()
    return body["worker"], body["token"]


async def claim(box: AsyncClient, token: str) -> dict[str, Any] | None:
    """Claim a job; None when nothing is due."""
    response = await box.post("/worker/jobs/claim", headers=bearer(token))
    if response.status_code == 204:
        assert response.content == b""
        return None
    assert response.status_code == 200, response.text
    job: dict[str, Any] = response.json()
    return job


async def send_png(box: AsyncClient, token: str, job_id: str, data: bytes) -> Any:
    return await box.put(
        f"/worker/jobs/{job_id}/screenshot",
        content=data,
        headers={**bearer(token), "Content-Type": "image/png"},
    )


async def admin_combo(client: AsyncClient, combo_id: str) -> dict[str, Any]:
    response = await client.get(f"/admin/combos/{combo_id}")
    assert response.status_code == 200, response.text
    combo: dict[str, Any] = response.json()
    return combo


async def update(
    client: AsyncClient, headers: dict[str, str], combo: dict[str, Any], **change: Any
) -> dict[str, Any]:
    """Change a combo, keeping what `change` does not name."""

    def conditions(item: dict[str, Any]) -> dict[str, Any]:
        return {k: item[k] for k in ("float_from", "float_to", "seeds")}

    agent = combo["screenshot_agent"]
    body = {
        "version": combo["version"],
        "rating": combo["rating"],
        "description": combo["description"],
        "glove": conditions(combo["glove"]),
        "knife": conditions(combo["knife"]),
        "screenshot_agent": agent["def_index"] if agent else None,
        **change,
    }
    response = await client.put(f"/admin/combos/{combo['id']}", json=body, headers=headers)
    assert response.status_code == 200, response.text
    updated: dict[str, Any] = response.json()
    return updated
