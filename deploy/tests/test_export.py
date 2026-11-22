"""Criteria 2 and 3: the export."""

import json
from pathlib import Path

import pytest

from combo_publish.export import CHANGED, ExportError, export
from tests.support import LOCAL_IMAGES, World, combo, full_catalog, json_response


@pytest.fixture
def full(tmp_path: Path) -> World:
    return World(tmp_path, full_catalog())


def three_finishes(world: World) -> None:
    world.add(
        combo("a", ("glove-0", "finish-0"), ("knife-0", "finish-0"), rating=9.5),
        combo("b", ("glove-0", "finish-0"), ("knife-1", "finish-1"), rating=8.0),
        combo("c", ("glove-1", "finish-1"), ("knife-0", "finish-0"), screenshot=False),
    )


def test_every_finish_of_the_catalog_gets_a_file(full: World) -> None:
    three_finishes(full)
    result = export(full.http, full.settings, full_catalog(), full.api.openapi)
    assert len(result.files) == 671
    assert len([path for path in result.files if path.startswith("data/gloves/")]) == 94
    assert len([path for path in result.files if path.startswith("data/knives/")]) == 576
    assert json.loads(result.files["data/combo-counts.json"]) == full.api.counts()
    assert result.combos == 3
    assert (result.glove_finishes, result.knife_finishes) == (2, 2)

    with_combos = {
        "data/gloves/glove-0/finish-0.json": full.api.finish("gloves", "glove-0", "finish-0"),
        "data/gloves/glove-1/finish-1.json": full.api.finish("gloves", "glove-1", "finish-1"),
        "data/knives/knife-0/finish-0.json": full.api.finish("knives", "knife-0", "finish-0"),
        "data/knives/knife-1/finish-1.json": full.api.finish("knives", "knife-1", "finish-1"),
    }
    for path, answer in with_combos.items():
        expected = json.loads(json.dumps(answer).replace(LOCAL_IMAGES, "https://img.combo.skin"))
        assert json.loads(result.files[path]) == expected
    # The game's fallback pictures stay where they are.
    first = json.loads(result.files["data/gloves/glove-0/finish-0.json"])[0]
    assert first["glove"]["fallback_image_url"].startswith(
        "https://community.akamai.steamstatic.com/"
    )
    assert first["screenshot"]["images"][0]["url"] == "https://img.combo.skin/combos/a/v1/640.webp"
    others = [body for path, body in result.files.items() if path not in with_combos]
    assert others.count(b"[]") == 670 - 4
    assert result.screenshot_keys == {
        f"combos/{c}/v1/{w}.webp" for c in "ab" for w in (640, 1280, 1920)
    }


def test_the_api_order_is_kept(world: World) -> None:
    world.add(
        combo("low", ("specialist", "mogul"), ("karambit", "fade"), rating=5),
        combo("high", ("specialist", "mogul"), ("karambit", "fade"), rating=9),
    )
    result = export(
        world.http,
        world.settings,
        json.loads((world.repo / "website/src/data/catalog.json").read_text()),
        world.api.openapi,
    )
    listed = json.loads(result.files["data/gloves/specialist/mogul.json"])
    assert [one["id"] for one in listed] == ["low", "high"]


def nothing_happened(world: World) -> None:
    assert world.public.puts == []
    assert world.calls("wrangler") == []
    assert world.calls("npm") == []


def test_an_image_url_off_the_local_base_stops_the_publish(world: World) -> None:
    one = combo("a", ("specialist", "mogul"), ("karambit", "fade"))
    one["screenshot"]["images"][0]["url"] = "https://elsewhere.example.com/x.webp"
    world.add(one)
    result = world.run("publish")
    assert result.code == 1
    assert "is a URL off the local image base: https://elsewhere.example.com/x.webp" in result.err
    nothing_happened(world)


@pytest.mark.parametrize(("where", "field"), [((), "status"), (("glove",), "screenshot_agent")])
def test_an_extra_field_stops_the_publish(world: World, where: tuple[str, ...], field: str) -> None:
    one = combo("a", ("specialist", "mogul"), ("karambit", "fade"))
    target = one
    for name in where:
        target = target[name]
    target[field] = "x"
    world.add(one)
    result = world.run("publish")
    assert result.code == 1
    assert f"field {field} is not in the public schema" in result.err
    nothing_happened(world)


def test_a_list_that_differs_from_its_count_twice_stops_with_the_message(world: World) -> None:
    world.add(combo("a", ("specialist", "mogul"), ("karambit", "fade")))
    world.api.answers["/gloves/specialist/mogul/combos"] = [[], []]
    result = world.run("publish")
    assert result.code == 1
    assert result.err.strip() == CHANGED
    nothing_happened(world)


def test_one_mismatch_then_a_match_succeeds(world: World) -> None:
    world.add(combo("a", ("specialist", "mogul"), ("karambit", "fade")))
    world.api.answers["/gloves/specialist/mogul/combos"] = [[]]
    catalog = json.loads((world.repo / "website/src/data/catalog.json").read_text())
    result = export(world.http, world.settings, catalog, world.api.openapi)
    assert result.combos == 1
    assert world.api.requests.count("/combo-counts") == 2


def test_unequal_glove_and_knife_totals_are_a_mismatch(world: World) -> None:
    world.add(combo("a", ("specialist", "mogul"), ("karambit", "fade")))
    counts = world.api.counts()
    counts["knives"]["karambit"]["fade"] = 2
    world.http.override["http://127.0.0.1:8000/combo-counts"] = json_response(counts)
    catalog = json.loads((world.repo / "website/src/data/catalog.json").read_text())
    with pytest.raises(ExportError, match=CHANGED):
        export(world.http, world.settings, catalog, world.api.openapi)


def test_a_finish_missing_from_the_built_catalog_stops(world: World) -> None:
    world.add(combo("a", ("specialist", "unknown"), ("karambit", "fade")))
    result = world.run("publish")
    assert result.code == 1
    assert (
        "gloves/specialist/unknown has combos but is not in the built commit's catalog"
        in result.err
    )
