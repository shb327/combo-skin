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
