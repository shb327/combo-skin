"""Spec 026, criteria 1 to 6: `deploy-code build`, the site of one commit on the live data,
made and checked with no credential."""

import hashlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from combo_publish.headers import generate
from combo_publish.http import Response
from tests.support import World, combo, git, key_of

LIVE = "https://combo-test.pages.dev"


@pytest.fixture
def live(world: World) -> World:
    """A world whose production deployment came from a publish: two combos on three finishes."""
    world.add(
        combo("a", ("specialist", "mogul"), ("karambit", "fade"), rating=9.5),
        combo("b", ("sport", "vice"), ("karambit", "fade"), rating=7.0),
    )
    assert world.run("publish").code == 0
    return world


def build(world: World, *extra: str) -> tuple[int, str, str, Path]:
    out = world.root / "out"
    result = world.run("deploy-code", "build", "--out", str(out), *extra)
    return result.code, result.out, result.err, out


def live_files(world: World) -> dict[str, bytes]:
    folder = world.root / "deployments" / "dep2"
    return {
        path.relative_to(folder).as_posix(): path.read_bytes()
        for path in (folder / "data").rglob("*.json")
    }


def built_files(out: Path) -> dict[str, bytes]:
    folder = out / "site"
    return {
        path.relative_to(folder).as_posix(): path.read_bytes()
        for path in (folder / "data").rglob("*.json")
    }


def npm_builds(world: World) -> int:
    return len([call for call in world.calls("npm") if call["argv"] == ["run", "build"]])


def serve(world: World, path: str, body: bytes, kind: str = "application/json") -> None:
    world.http.override[f"{LIVE}/{path}"] = Response(200, body, {"content-type": kind})


def edit_catalog(world: World, change: Callable[[Any], None]) -> str:
    path = world.repo / "website/src/data/catalog.json"
    catalog = json.loads(path.read_text())
    change(catalog)
    return world.commit_on_main("website/src/data/catalog.json", json.dumps(catalog), "Catalog")


# Criterion 1


def test_the_build_holds_the_live_data_and_a_folder_and_plan(live: World) -> None:
    seen = len(live.http.requests)
    code, _, err, folder = build(live)
    assert code == 0, err
    before = live_files(live)
    after = built_files(folder)
    assert after == before
    plan = json.loads((folder / "plan.json").read_text())
    assert plan["commit"] == git(live.repo, "rev-parse", "origin/main")
    assert plan["manifest"] == json.loads(before["data/manifest.json"])
    assert plan["warnings"] == []
    assert (folder / "site" / "index.html").is_file()
    # Every file came from the production address, and nothing asked for a credential.
    fetched = [url for url, _ in live.http.requests if url.startswith(f"{LIVE}/data/")]
    assert len(fetched) == len(before)
    mine = live.http.requests[seen:]
    assert mine and all("authorization" not in {k.lower() for k in h} for _, h in mine)
    assert not [url for url, _ in mine if "api.cloudflare.com" in url]


def test_a_file_that_changes_mid_download_starts_over_once(live: World) -> None:
    path = "data/gloves/specialist/mogul.json"
    real = live_files(live)[path]
    answers = [Response(200, b"[]", {"content-type": "application/json"})]

    def once() -> Response:
        return (
            answers.pop() if answers else Response(200, real, {"content-type": "application/json"})
        )

    live.http.override[f"{LIVE}/{path}"] = once
    code, _, err, _ = build(live)
    assert code == 0, err


def test_a_file_that_keeps_changing_stops_the_build(live: World) -> None:
    serve(live, "data/gloves/specialist/mogul.json", b"[]")
    code, _, err, folder = build(live)
    assert code == 1
    assert "The live data changed during the download; run it again." in err
    assert npm_builds(live) == 1  # only the publish's
    assert not folder.exists()


def test_a_data_file_served_as_html_stops_the_build(live: World) -> None:
    serve(live, "data/knives/karambit/fade.json", b"<!doctype html>", "text/html")
    code, _, err, _ = build(live)
    assert code == 1
    assert "data/knives/karambit/fade.json is not served as JSON (text/html)" in err


def test_a_live_deployment_without_a_manifest_needs_a_publish(live: World) -> None:
    (live.root / "deployments" / "dep2" / "data" / "manifest.json").unlink()
    code, _, err, _ = build(live)
    assert code == 1
    assert err.strip() == (
        "Needs a publish from the Mac: the live deployment has no data manifest."
    )


# Criterion 2


def test_a_public_schema_change_needs_a_publish_before_npm_runs(live: World) -> None:
    openapi = json.loads((live.repo / "api/openapi.json").read_text())
    schemas = openapi["components"]["schemas"]
    schemas["PublicCombo"]["properties"]["shared"] = {"type": "boolean"}
    schemas["ComboCounts"]["required"] = ["gloves"]
    live.commit_on_main("api/openapi.json", json.dumps(openapi), "Schema")
    code, _, err, _ = build(live)
    assert code == 1
    assert err.strip() == (
        "Needs a publish from the Mac: the merged code expects public schemas the live data "
        "doesn't have (ComboCounts, PublicCombo)."
    )
    assert npm_builds(live) == 1


def test_a_change_to_titles_and_descriptions_only_builds(live: World) -> None:
    openapi = json.loads((live.repo / "api/openapi.json").read_text())
    openapi["components"]["schemas"]["PublicCombo"]["description"] = "Reworded."
    live.commit_on_main("api/openapi.json", json.dumps(openapi), "Docs")
    code, _, err, _ = build(live)
    assert code == 0, err


# Criterion 3


def test_a_new_finish_gets_an_empty_file_and_a_manifest_entry(live: World) -> None:
    def add(catalog: Any) -> None:
        catalog["gloves"][0]["finishes"].append(
            {"id": "new-one", "name": "New One", "image": "x", "image_key": key_of("new")}
        )

    edit_catalog(live, add)
    code, _, err, folder = build(live)
    assert code == 0, err
    files = built_files(folder)
    assert files["data/gloves/specialist/new-one.json"] == b"[]"
    raw = json.loads(files["data/manifest.json"])
    assert raw["files"]["data/gloves/specialist/new-one.json"] == hashlib.sha256(b"[]").hexdigest()
    before = json.loads(live_files(live)["data/manifest.json"])
    for key in ("format", "data_version", "exported_at", "exported_with", "origins"):
        assert raw[key] == before[key]
    for path, body in live_files(live).items():
        if path != "data/manifest.json":
            assert files[path] == body, path


def test_a_finish_that_left_the_catalog_empty_is_dropped(live: World) -> None:
    def drop(catalog: Any) -> None:
        catalog["gloves"][0]["finishes"] = [
            one for one in catalog["gloves"][0]["finishes"] if one["id"] != "crimson-kimono"
        ]

    edit_catalog(live, drop)
    code, _, err, folder = build(live)
    assert code == 0, err
    files = built_files(folder)
    assert "data/gloves/specialist/crimson-kimono.json" not in files
    assert (
        "data/gloves/specialist/crimson-kimono.json"
        not in json.loads(files["data/manifest.json"])["files"]
    )


def test_a_finish_that_left_the_catalog_with_combos_needs_a_publish(live: World) -> None:
    def drop(catalog: Any) -> None:
        catalog["knives"][0]["finishes"] = [
            one for one in catalog["knives"][0]["finishes"] if one["id"] != "fade"
        ]

    edit_catalog(live, drop)
    code, _, err, _ = build(live)
    assert code == 1
    assert err.strip() == (
        "Needs a publish from the Mac: knives/karambit/fade has combos but is not in this "
        "commit's catalog."
    )


# Criterion 4


def test_the_build_uses_the_manifest_origins_and_the_publish_headers(live: World) -> None:
    code, _, err, folder = build(live)
    assert code == 0, err
    builds = [call for call in live.calls("npm") if call["argv"] == ["run", "build"]]
    assert builds[-1]["env"]["VITE_IMAGE_BASE_URL"] == "https://img.combo.skin"
    assert builds[-1]["env"]["VITE_VIEWER_ORIGIN"] == "https://view.combo.skin"
    assert (folder / "site" / "_headers").read_text() == generate(live.settings)
    published = live.root / "deployments" / "dep2" / "_headers"
    assert (folder / "site" / "_headers").read_bytes() == published.read_bytes()


def test_a_manifest_origin_that_is_not_https_stops_the_build(live: World) -> None:
    raw = json.loads(live_files(live)["data/manifest.json"])
    raw["origins"]["images"] = "http://img.combo.skin"
    serve(live, "data/manifest.json", json.dumps(raw).encode())
    code, _, err, _ = build(live)
    assert code == 1
    assert "origins.images must be an https URL" in err


def test_the_site_check_stops_the_build_as_it_stops_a_publish(live: World) -> None:
    (live.root / "extra.js").write_text('fetch("http://localhost:5173/x")')
    code, _, err, folder = build(live)
    assert code == 1
    assert "assets/index-a1.js holds a local URL" in err
    assert not folder.exists()


def test_live_data_outside_the_public_schema_stops_the_build(live: World) -> None:
    path = "data/knives/karambit/fade.json"
    combos = json.loads(live_files(live)[path])
    combos[0]["status"] = "draft"
    body = json.dumps(combos).encode()
    raw = json.loads(live_files(live)["data/manifest.json"])
    raw["files"][path] = hashlib.sha256(body).hexdigest()
    serve(live, "data/manifest.json", json.dumps(raw).encode())
    serve(live, path, body)
    code, _, err, _ = build(live)
    assert code == 1
    assert "field status is not in the public schema" in err


# Criterion 5


def test_a_missing_link_preview_image_needs_a_publish(live: World) -> None:
    (live.root / "extra.html").write_text(
        '<meta property="og:image" content="https://img.combo.skin/og/a/v1.jpg">'
        '<meta property="og:image" content="https://combo.skin/og.jpg">'
    )
    code, _, err, _ = build(live)
    assert code == 1
    assert err.strip() == (
        "Needs a publish from the Mac: 1 preview images of this code are not uploaded."
    )
    live.public.store["og/a/v1.jpg"] = (b"jpeg", "image/jpeg", None)
    code, _, err, _ = build(live)
    assert code == 0, err


def test_a_missing_catalog_copy_is_a_warning(live: World) -> None:
    missing = key_of("gloves/specialist/crimson-kimono")
    del live.public.store[missing]
    code, out, err, folder = build(live)
    assert code == 0, err
    warning = (
        "1 catalog copies are not on the image host yet; the site shows the game's pictures "
        f"until the next publish ({missing})"
    )
    assert f"Warning: {warning}" in out
    assert json.loads((folder / "plan.json").read_text())["warnings"] == [warning]


def test_the_build_never_opens_a_bucket_or_reads_a_credential(live: World) -> None:
    opened = list(live.buckets.opened)
    live.keychain.values.clear()
    code, _, err, _ = build(live)
    assert code == 0, err
    assert live.buckets.opened == opened
    heads = [url for method, url in live.http.sent if method == "HEAD"]
    assert heads and all(url.startswith("https://img.combo.skin/catalog/") for url in heads)
    assert not [method for method, _ in live.http.sent if method != "HEAD"]


def test_the_deploy_code_module_has_no_way_to_a_bucket() -> None:
    source = (Path(__file__).parents[1] / "src" / "combo_publish" / "deploy_code.py").read_text()
    for name in ("bucket", "boto3", "keychain", "local_json", "R2Bucket", "r2("):
        assert name not in source, name


# Criterion 6


def test_the_build_refuses_a_cloudflare_token_in_its_environment(live: World) -> None:
    live.environ["CLOUDFLARE_API_TOKEN"] = "anything"
    seen = len(live.http.requests)
    code, _, err, _ = build(live)
    assert code == 1
    assert "CLOUDFLARE_API_TOKEN" in err
    assert len(live.http.requests) == seen
    assert npm_builds(live) == 1


# R4: the same build on the Mac, as a dry run.


def test_a_dry_run_prints_the_plan_and_writes_nothing(live: World) -> None:
    tip = git(live.repo, "rev-parse", "origin/main")
    result = live.run("deploy-code", "build", "--dry-run")
    assert result.code == 0, result.err
    raw = json.loads(live_files(live)["data/manifest.json"])
    assert result.out.splitlines() == [
        f"Commit {tip[:12]} (origin/main): First",
        f"Live data: 2 combos, data {raw['data_version'][:12]}, exported "
        f"{raw['exported_at']} with commit {raw['exported_with'][:12]}",
        "Data files: 7 kept, 0 added, 0 dropped",
        "Images: 7 catalog copies and 0 preview images checked on the image host",
        "Site: 11 files (0.0 MB), checked",
        "Dry run: nothing written.",
    ]
    assert not (live.root / "out").exists()


def test_the_project_comes_from_the_environment_in_ci(live: World) -> None:
    live.settings_path.unlink()
    live.environ["PAGES_PROJECT"] = "combo-test"
    folder = live.root / "combo-test"
    result = live.run("deploy-code", "build", "--out", str(folder))
    assert result.code == 0, result.err
    # The project name is not a secret (spec 026, Deviations, 12): a path holding the same
    # word is printed as it is.
    assert f"Built: {folder}" in result.out.splitlines()
    assert "***" not in result.out + result.err
