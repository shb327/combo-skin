import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.patterns.importer import import_groups
from tests.combos.support import logged_in
from tests.patterns.support import SOURCE, group, groups_file


@pytest.mark.anyio
@pytest.mark.usefixtures("admin")
async def test_list_pattern_groups(catalog: AsyncSession, admin_client: AsyncClient) -> None:
    await import_groups(
        catalog, groups_file(group("gold-gem", name="Gold Gem", sources=[]), group())
    )
    await logged_in(admin_client)
    response = await admin_client.get("/admin/pattern-groups")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == [
        {
            "slug": "gold-gem",
            "name": "Gold Gem",
            "kind": "knife",
            "finish_slug": "case-hardened",
            "seeds": {"karambit": 387, "m9-bayonet": 601},
            "sources": [],
        },
        {
            "slug": "blue-gem",
            "name": "Blue Gem",
            "kind": "knife",
            "finish_slug": "case-hardened",
            "seeds": {"karambit": 387, "m9-bayonet": 601},
            "sources": [SOURCE],
        },
    ]


@pytest.mark.anyio
async def test_list_needs_an_admin(admin_client: AsyncClient) -> None:
    response = await admin_client.get("/admin/pattern-groups")
    assert response.status_code == 401
    assert response.json() == {"detail": "not_authenticated"}
