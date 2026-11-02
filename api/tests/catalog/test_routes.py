import json
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.importer import import_snapshot
from combo_api.catalog.snapshot import Snapshot, load_display_order, load_snapshot
from tests.catalog.support import website_slugs
from tests.support import API_DIR

pytestmark = pytest.mark.anyio

SNAPSHOT = load_snapshot()
ORDER = load_display_order()


@pytest.fixture
async def catalog(db_session: AsyncSession) -> AsyncSession:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    return db_session


async def get(client: AsyncClient, path: str) -> Any:
    response = await client.get(path)
    assert response.status_code == 200, path
    return response.json()


@pytest.mark.usefixtures("catalog")
async def test_knife_types_in_display_order(client: AsyncClient) -> None:
    knives = await get(client, "/knives")
    expected = [w["slug"] for w in website_slugs() if w["kind"] == "knife"]
    assert [k["slug"] for k in knives] == expected
    assert (knives[0]["slug"], knives[-1]["slug"]) == ("bayonet", "kukri")
    karambit = next(k for k in knives if k["slug"] == "karambit")
    assert karambit == {
        "slug": "karambit",
        "name": "Karambit",
        "def_index": 507,
        "codename": "weapon_knife_karambit",
        "finish_count": 35,
    }


@pytest.mark.usefixtures("catalog")
async def test_glove_types_in_display_order(client: AsyncClient) -> None:
    gloves = await get(client, "/gloves")
    assert len(gloves) == 8
    assert (gloves[0]["slug"], gloves[-1]["slug"]) == ("bloodhound", "broken-fang")


@pytest.mark.usefixtures("catalog")
async def test_knife_type_with_finishes(client: AsyncClient) -> None:
    karambit = await get(client, "/knives/karambit")
    slugs = [f["slug"] for f in karambit["finishes"]]
    assert len(slugs) == karambit["finish_count"] == 35
    assert slugs[:3] == ["vanilla", "autotronic", "black-laminate"]


@pytest.mark.usefixtures("catalog")
async def test_one_finish(client: AsyncClient) -> None:
    finish = await get(client, "/knives/karambit/doppler-phase-2")
    image_url = finish.pop("image_url")
    assert image_url.startswith("https://")
    assert finish == {
        "slug": "doppler-phase-2",
        "name": "Doppler",
        "phase": "Phase 2",
        "display_name": "Doppler (Phase 2)",
        "paint_index": 419,
        "paint_codename": "am_doppler_phase2",
        "rarity": {"code": "rarity_ancient_weapon", "name": "Covert", "color": "#eb4b4b"},
        "float_min": 0.0,
        "float_max": 0.08,
        "active": True,
        "item_type": {"slug": "karambit", "name": "Karambit", "def_index": 507, "kind": "knife"},
    }
    mogul = await get(client, "/gloves/specialist/mogul")
    assert (mogul["paint_index"], mogul["item_type"]["kind"]) == (10064, "glove")


@pytest.mark.usefixtures("catalog")
@pytest.mark.parametrize(
    "path",
    [
        "/knives/specialist",
        "/gloves/karambit",
        "/knives/karambit/nope",
        "/knives/nope",
        "/gloves/specialist/doppler-phase-2",
        "/knives/specialist/mogul",
    ],
)
async def test_unknown_slugs_return_404(client: AsyncClient, path: str) -> None:
    response = await client.get(path)
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


@pytest.mark.usefixtures("catalog")
async def test_every_type_lists_finishes_in_display_order(client: AsyncClient) -> None:
    for website_type in website_slugs():
        group = "knives" if website_type["kind"] == "knife" else "gloves"
        finishes = (await get(client, f"/{group}/{website_type['slug']}"))["finishes"]
        listed = website_type["finishes"]
        assert [f["slug"] for f in finishes[: len(listed)]] == listed
        rest = [f["paint_index"] for f in finishes[len(listed) :]]
        assert rest == sorted(rest)
        if website_type["slug"] in {"driver", "specialist", "sport"}:
            assert len(rest) in {7, 8}


def without(snapshot: Snapshot, type_slug: str, finish_slug: str | None = None) -> Snapshot:
    types = []
    for item_type in snapshot.item_types:
        if item_type.slug == type_slug and finish_slug is None:
            continue
        if item_type.slug == type_slug:
            kept = tuple(f for f in item_type.finishes if f.slug != finish_slug)
            item_type = item_type.model_copy(update={"finishes": kept})
        types.append(item_type)
    return snapshot.model_copy(update={"item_types": tuple(types)})


async def test_inactive_finish_and_type(client: AsyncClient, catalog: AsyncSession) -> None:
    newer = without(without(SNAPSHOT, "karambit", "fade"), "kukri")
    finishes = {
        **ORDER.finishes,
        "knife/karambit": tuple(s for s in ORDER.finishes["knife/karambit"] if s != "fade"),
    }
    finishes.pop("knife/kukri")
    types = {**ORDER.types, "knife": tuple(s for s in ORDER.types["knife"] if s != "kukri")}
    await import_snapshot(
        catalog, newer, ORDER.model_copy(update={"finishes": finishes, "types": types})
    )

    karambit = await get(client, "/knives/karambit")
    assert "fade" not in [f["slug"] for f in karambit["finishes"]]
    assert karambit["finish_count"] == 34
    fade = await get(client, "/knives/karambit/fade")
    assert fade["active"] is False
    assert "kukri" not in [k["slug"] for k in await get(client, "/knives")]
    assert (await client.get("/knives/kukri")).status_code == 404


def test_schema_lists_catalog_operations() -> None:
    schema = json.loads((API_DIR / "openapi.json").read_text())
    operations = {
        (path, operation["operationId"])
        for path, item in schema["paths"].items()
        for operation in item.values()
        if "catalog" in operation.get("tags", [])
    }
    assert operations == {
        ("/knives", "list_knife_types"),
        ("/knives/{type_slug}", "get_knife_type"),
        ("/knives/{type_slug}/{finish_slug}", "get_knife_finish"),
        ("/gloves", "list_glove_types"),
        ("/gloves/{type_slug}", "get_glove_type"),
        ("/gloves/{type_slug}/{finish_slug}", "get_glove_finish"),
    }
