"""Spec 026, criterion 14: the data manifest `publish` writes, its smoke test, and the check
against a merge deploy that goes live during a publish."""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from combo_publish import manifest, site
from combo_publish.headers import generate
from combo_publish.http import Response
from combo_publish.schema import PublicSchema
from tests.support import REAL_OPENAPI, World, combo, git


@pytest.fixture
def ready(world: World) -> World:
    world.add(
        combo("a", ("specialist", "mogul"), ("karambit", "fade"), rating=9.5),
        combo("b", ("sport", "vice"), ("karambit", "fade"), rating=7.0),
    )
    return world


def deployed(world: World, deployment: str) -> Path:
    return world.root / "deployments" / deployment


def test_publish_writes_the_manifest_of_its_export(ready: World) -> None:
    result = ready.run("publish")
    assert result.code == 0, result.err
    folder = deployed(ready, "dep2")
    raw = json.loads((folder / "data" / "manifest.json").read_bytes())
    tip = git(ready.repo, "rev-parse", "origin/main")
    assert list(raw) == [
        "format",
        "data_version",
        "exported_at",
        "exported_with",
        "origins",
        "files",
    ]
    assert raw["format"] == 1
    assert raw["data_version"] == ready.state()["data_sha256"]
    assert raw["exported_at"] == "2026-11-22T03:00:00"
    assert raw["exported_with"] == tip
    assert raw["origins"] == {
        "site": "https://combo.skin",
        "images": "https://img.combo.skin",
        "viewer": "https://view.combo.skin",
    }
    data = {
        path.relative_to(folder).as_posix(): path.read_bytes()
        for path in (folder / "data").rglob("*.json")
        if path.name != "manifest.json"
    }
    assert raw["files"] == {path: hashlib.sha256(body).hexdigest() for path, body in data.items()}
    assert "data/manifest.json" not in raw["files"]
    assert len(raw["files"]) == 7


def test_the_changed_files_count_leaves_the_manifest_out(ready: World) -> None:
    assert ready.run("publish").code == 0
    # A later publish writes a new export time, so the manifest changes; no data file does.
    ready.now = datetime(2026, 11, 22, 4, 30, 0)
    again = ready.run("publish")
    assert again.code == 0, again.err
    assert "Data files: 7 written, 0 changed since the last production publish" in again.out
    raw = json.loads((deployed(ready, "dep4") / "data" / "manifest.json").read_bytes())
    assert raw["exported_at"] == "2026-11-22T04:30:00"


def test_the_smoke_test_checks_the_manifest(ready: World) -> None:
    ready.http.override["https://dep1.combo-test.pages.dev/data/manifest.json"] = Response(
        200, b'{"format": 1}', {"content-type": "application/json"}
    )
    result = ready.run("publish")
    assert result.code == 1
    assert "/data/manifest.json differs from what was deployed" in result.err
    assert len(ready.deploys()) == 1


def test_a_merge_deploy_going_live_during_a_publish_stops_it(ready: World) -> None:
    assert ready.run("publish").code == 0
    before = ready.state()
    ready.add(combo("c", ("specialist", "mogul"), ("bayonet", "lore")))

    def land_a_merge_deploy(url: str) -> None:
        # While the preview is smoke-tested, CI puts another deployment live.
        if url.startswith("https://dep3.combo-test.pages.dev/"):
            ready.add_deployment("main", "Combo Skin abc merge deploy, data def")

    ready.http.after.append(land_a_merge_deploy)
    result = ready.run("publish")
    assert result.code == 1
    assert result.err.strip() == "A merge deploy went live during this publish; run it again."
    branches = [call["argv"][call["argv"].index("--branch") + 1] for call in ready.deploys()]
    assert branches == ["preview", "main", "preview"]
    assert ready.state() == before
    # The images it uploaded stay, so the next run finds them.
    assert "combos/c/v1/640.webp" in ready.public.store


def test_a_first_publish_needs_no_live_deployment(ready: World) -> None:
    assert ready.pages_deployments() == []
    result = ready.run("publish")
    assert result.code == 0, result.err


def test_a_preview_publish_does_not_read_the_live_deployment(ready: World) -> None:
    result = ready.run("publish", "--preview")
    assert result.code == 0, result.err
    assert not [url for url, _ in ready.http.requests if "api.cloudflare.com" in url]


# The manifest's own rules, which a merge deploy relies on.


def good() -> manifest.Manifest:
    from combo_publish.settings import Origins

    return manifest.make(
        {"data/combo-counts.json": b'{"gloves":{},"knives":{}}', "data/gloves/a/b.json": b"[]"},
        data_version="a" * 64,
        exported_at="2026-11-22T03:00:00+01:00",
        exported_with="b" * 40,
        origins=Origins("https://combo.skin", "https://img.combo.skin", "https://view.combo.skin"),
    )


def test_a_manifest_reads_back_as_written() -> None:
    assert manifest.parse(good().encode()) == good()


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"format": 2}, "not a format 1 manifest"),
        ({"data_version": "x"}, "no valid data_version"),
        ({"exported_with": "main"}, "no valid exported_with"),
        ({"exported_at": "yesterday"}, "no valid exported_at"),
        ({"origins": {"site": "http://combo.skin"}}, "origins.site must be an https origin"),
        ({"files": {"data/gloves/a/b.json": "0" * 64}}, "lists no data/combo-counts.json"),
        (
            {"files": {"data/combo-counts.json": "0" * 64, "../x.json": "0" * 64}},
            "a path that is not a data file",
        ),
        ({"files": {"data/combo-counts.json": "zz"}}, "no valid SHA-256"),
    ],
)
def test_a_bad_manifest_is_refused(change: dict[str, Any], message: str) -> None:
    raw: dict[str, Any] = json.loads(good().encode())
    for key, value in change.items():
        raw[key] = {**raw[key], **value} if key == "origins" else value
    with pytest.raises(manifest.ManifestError, match=message):
        manifest.parse(json.dumps(raw).encode())


def test_the_site_check_refuses_data_that_does_not_match_its_manifest(
    world: World, tmp_path: Path
) -> None:
    folder = tmp_path / "site"
    (folder / "data" / "gloves" / "a").mkdir(parents=True)
    (folder / "index.html").write_text("<!doctype html>")
    (folder / "_headers").write_text(generate(world.settings))
    (folder / "data" / "combo-counts.json").write_text('{"gloves":{},"knives":{}}')
    (folder / "data" / "gloves" / "a" / "b.json").write_text("[]")
    (folder / "data" / "manifest.json").write_bytes(good().encode())
    schema = PublicSchema(json.loads(REAL_OPENAPI.read_text()))
    assert site.check(folder, world.settings.local_urls, schema).files == 5
    (folder / "data" / "gloves" / "a" / "b.json").write_text("[ ]")
    with pytest.raises(site.SiteError, match=r"data/gloves/a/b.json does not match its SHA-256"):
        site.check(folder, world.settings.local_urls, schema)
    (folder / "data" / "manifest.json").unlink()
    with pytest.raises(site.SiteError, match=r"no data/manifest\.json"):
        site.check(folder, world.settings.local_urls, schema)


# After the production deploy: a merge deploy that went live over this publish (the Pages
# API's list can lag, so its own check after production may have missed this publish).

LIST = "/deployments?env=production"


def land_after_production(world: World, old: str) -> list[str]:
    """Before the publish's first list of production deployments, which comes right after its
    production deploy, CI puts a merge deploy of the older data live."""
    landed: list[str] = []

    def hook(url: str) -> None:
        if LIST in url and not landed:
            landed.append(
                world.add_deployment("main", "Combo Skin abc merge deploy, data def", like=old)
            )

    world.http.before.append(hook)
    return landed


def test_a_merge_deploy_over_this_publish_is_rolled_back(ready: World) -> None:
    assert ready.run("publish").code == 0  # dep1, dep2
    ready.add(combo("c", ("specialist", "mogul"), ("bayonet", "lore")))
    landed = land_after_production(ready, "dep2")
    result = ready.run("publish")  # dep3, dep4; then the merge deploy is dep5
    assert result.code == 0, result.err
    assert landed == ["dep5"]
    assert ready.canonical_id() == "dep4"
    assert "dep5" not in [one["id"] for one in ready.pages_deployments()]
    assert (
        "Merge deploy dep5 went live over this publish with older data: production was rolled "
        "back to this publish and dep5 was deleted. Run the deploy workflow by hand on main to "
        "put the newer code live."
    ) in result.out.splitlines()
    assert ready.state()["live"]["deployment"] == "dep4"


def test_a_publish_with_nothing_after_it_changes_nothing_more(ready: World) -> None:
    assert ready.run("publish").code == 0
    assert not [sent for sent in ready.http.sent if sent[0] in ("POST", "DELETE")]
    assert ready.canonical_id() == "dep2"


def test_a_failed_rollback_after_a_publish_says_what_to_do(ready: World) -> None:
    assert ready.run("publish").code == 0
    ready.add(combo("c", ("specialist", "mogul"), ("bayonet", "lore")))
    land_after_production(ready, "dep2")
    real = ready.pages_send

    def refuse(method: str, url: str) -> object:
        from tests.support import json_response

        return json_response({}, 403) if url.endswith("/rollback") else real(method, url)

    ready.pages_send = refuse  # type: ignore[method-assign,assignment]
    result = ready.run("publish")
    assert result.code == 1
    assert result.err.strip().startswith(
        "Merge deploy dep5 went live over this publish with older data. Roll back to this "
        "publish (deployment dep4) in the Pages dashboard now"
    )
    # The publish itself is recorded, so its images are protected.
    assert ready.state()["live"]["deployment"] == "dep4"
