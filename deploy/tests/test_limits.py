"""Criterion 6: Pages' limits, checked on the assembled folder before any upload."""

import json
from pathlib import Path

import pytest

from combo_publish import manifest, site
from combo_publish.headers import generate
from combo_publish.schema import PublicSchema
from combo_publish.settings import load
from tests.support import REAL_OPENAPI, World, combo


@pytest.fixture
def folder(world: World, tmp_path: Path) -> Path:
    path = tmp_path / "site"
    path.mkdir()
    (path / "index.html").write_text("<!doctype html>")
    (path / "_headers").write_text(generate(world.settings))
    (path / "data").mkdir()
    counts = b'{"gloves": {}, "knives": {}}'
    (path / "data" / "combo-counts.json").write_bytes(counts)
    (path / "data" / "manifest.json").write_bytes(
        manifest.make(
            {"data/combo-counts.json": counts},
            data_version="a" * 64,
            exported_at="2026-11-22T03:00:00",
            exported_with="b" * 40,
            origins=world.settings,
        ).encode()
    )
    return path


def check(world: World, folder: Path) -> site.Summary:
    return site.check(
        folder, world.settings.local_urls, PublicSchema(json.loads(REAL_OPENAPI.read_text()))
    )


def test_a_normal_folder_passes(world: World, folder: Path) -> None:
    assert check(world, folder).files == 4


def test_20001_files_fail(world: World, folder: Path) -> None:
    many = folder / "many"
    many.mkdir()
    for index in range(20_001 - 4):
        (many / f"{index}.txt").write_bytes(b"")
    with pytest.raises(site.SiteError, match="20001 files"):
        check(world, folder)


def test_a_26_mib_file_fails(world: World, folder: Path) -> None:
    with (folder / "big.bin").open("wb") as handle:
        handle.truncate(26 * 1024 * 1024)
    with pytest.raises(site.SiteError, match=r"big\.bin is 27262976 bytes"):
        check(world, folder)


def test_101_header_rules_fail(world: World, folder: Path) -> None:
    rules = "\n".join(f"/path-{index}/*\n  X-Test: {index}\n" for index in range(101))
    (folder / "_headers").write_text(rules)
    with pytest.raises(site.SiteError, match="101 rules"):
        check(world, folder)


def test_a_2001_character_header_line_fails(world: World, folder: Path) -> None:
    line = "  X-Long: " + "a" * (2001 - len("  X-Long: "))
    (folder / "_headers").write_text(f"/*\n{line}\n")
    with pytest.raises(site.SiteError, match="line of 2001 characters"):
        check(world, folder)


def test_a_data_file_outside_the_schema_fails(world: World, folder: Path) -> None:
    (folder / "data" / "gloves").mkdir()
    bad = combo("a", ("specialist", "mogul"), ("karambit", "fade"), screenshot=False)
    bad["glove"]["image_url"] = "https://img.combo.skin/catalog/x.png"
    bad["knife"]["image_url"] = "https://img.combo.skin/catalog/y.png"
    bad["admin_note"] = "x"
    (folder / "data" / "gloves" / "x.json").write_text(json.dumps([bad]))
    with pytest.raises(site.SiteError, match="admin_note is not in the public schema"):
        check(world, folder)


@pytest.mark.parametrize("limit", ["files", "size", "rules", "line"])
def test_each_limit_stops_the_publish_before_any_upload(world: World, limit: str) -> None:
    world.add(combo("a", ("specialist", "mogul"), ("karambit", "fade")))
    limits = {
        "files": ("MAX_FILES", 5),
        "size": ("MAX_FILE_BYTES", 10),
        "rules": ("MAX_HEADER_RULES", 2),
        "line": ("MAX_HEADER_LINE", 100),
    }
    name, value = limits[limit]
    original = getattr(site, name)
    setattr(site, name, value)
    try:
        result = world.run("publish")
    finally:
        setattr(site, name, original)
    assert result.code == 1
    assert world.public.puts == []
    assert world.deploys() == []
    assert load(world.settings_path)  # settings untouched


@pytest.mark.parametrize(
    "relative", ["assets/index-a1.css", "assets/index-a1.js", "assets/x.mjs", "index.html"]
)
def test_an_inlined_data_image_in_code_fails(world: World, folder: Path, relative: str) -> None:
    target = folder / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(".k{background:url(data:image/svg+xml;base64,PHN2Zz4=)}")
    with pytest.raises(site.SiteError, match=rf"{relative} holds an inlined data: URL"):
        check(world, folder)


def test_an_image_file_is_not_searched_for_data_urls(world: World, folder: Path) -> None:
    # Only code can inline an asset; a picture's own bytes may hold any text.
    (folder / "assets").mkdir()
    (folder / "assets" / "1-abc.png").write_bytes(b"\x89PNG\r\n\x1a\ndata:image/png;base64,")
    assert check(world, folder).files == 5
