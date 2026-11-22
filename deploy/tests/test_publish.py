"""Criteria 4, 5, 8, 9, 11, 12 and 13: the publish, end to end on fakes."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from combo_publish import state
from tests.support import (
    ACCOUNT,
    IMAGES_KEY,
    IMAGES_SECRET,
    PAGES_TOKEN,
    SECRETS,
    World,
    combo,
    git,
)


@pytest.fixture
def ready(world: World) -> World:
    world.add(
        combo("a", ("specialist", "mogul"), ("karambit", "fade"), rating=9.5),
        combo("b", ("sport", "vice"), ("karambit", "fade"), rating=7.0),
    )
    return world


def checkout_snapshot(repo: Path) -> dict[str, str]:
    return {
        "status": git(repo, "status", "--porcelain", "--ignored"),
        "branch": git(repo, "rev-parse", "--abbrev-ref", "HEAD"),
        "head": git(repo, "rev-parse", "HEAD"),
        "stash": git(repo, "stash", "list"),
        "files": "\n".join(
            sorted(
                str(path.relative_to(repo)) for path in repo.rglob("*") if ".git" not in path.parts
            )
        ),
    }


# Criterion 4


def test_the_build_comes_from_an_archive_of_origin_main_outside_the_checkout(ready: World) -> None:
    # A local change and an unpushed commit are not what gets built.
    (ready.repo / "README.md").write_text("local edit\n")
    tip = git(ready.repo, "rev-parse", "origin/main")
    before = checkout_snapshot(ready.repo)
    result = ready.run("publish")
    assert result.code == 0, result.err
    assert checkout_snapshot(ready.repo) == before
    builds = [call for call in ready.calls("npm") if call["argv"] == ["run", "build"]]
    assert len(builds) == 1
    website = Path(builds[0]["cwd"])
    assert not website.is_relative_to(ready.repo)
    assert website.is_relative_to(ready.temp)
    # The temporary build folder is gone afterwards.
    assert not website.exists()
    commits = [call["argv"][call["argv"].index("--commit-hash") + 1] for call in ready.deploys()]
    assert commits == [tip, tip]


def test_a_production_publish_takes_no_ref(ready: World) -> None:
    tip = git(ready.repo, "rev-parse", "origin/main")
    git(ready.repo, "checkout", "-q", "-b", "side")
    (ready.repo / "README.md").write_text("side\n")
    git(ready.repo, "commit", "-q", "-am", "Side")
    side = git(ready.repo, "rev-parse", "HEAD")
    for ref in (side, tip):
        result = ready.run("publish", "--ref", ref)
        assert result.code == 1
        assert "--ref is only for --preview" in result.err
    assert ready.calls("npm") == []
    assert ready.deploys() == []


def test_a_preview_can_build_another_commit(ready: World) -> None:
    git(ready.repo, "checkout", "-q", "-b", "side")
    (ready.repo / "README.md").write_text("side\n")
    git(ready.repo, "commit", "-q", "-am", "Side")
    side = git(ready.repo, "rev-parse", "HEAD")
    result = ready.run("publish", "--preview", "--ref", side)
    assert result.code == 0, result.err
    assert [call["argv"][call["argv"].index("--commit-hash") + 1] for call in ready.deploys()] == [
        side
    ]


def test_the_build_folder_is_refused_inside_the_repository(ready: World) -> None:
    ready.temp = ready.repo / "tmp"
    ready.temp.mkdir()
    result = ready.run("publish")
    assert result.code == 1
    assert "The build folder must be outside the repository" in result.err
    assert ready.deploys() == []


# Criterion 5


def test_the_production_settings_reach_the_build_as_its_environment(ready: World) -> None:
    result = ready.run("publish")
    assert result.code == 0, result.err
    build = next(call for call in ready.calls("npm") if call["argv"] == ["run", "build"])
    assert build["env"]["VITE_IMAGE_BASE_URL"] == "https://img.combo.skin"
    assert build["env"]["VITE_VIEWER_ORIGIN"] == "https://view.combo.skin"
    assert not {"CLOUDFLARE_API_TOKEN", "AWS_ACCESS_KEY_ID", "VITE_API_BASE_URL"} & set(
        build["env"]
    )
    assert all(call["dotenv"] == [] for call in ready.calls("npm"))
    bundle = (ready.root / "deployments" / "dep1" / "assets" / "index-a1.js").read_text()
    assert "https://img.combo.skin" in bundle
    assert "https://view.combo.skin" in bundle
    for local in ("localhost", "127.0.0.1", "http://127.0.0.1:8000"):
        assert local not in bundle


@pytest.mark.parametrize("local", ["http://localhost:5173/x", "http://127.0.0.1:8000/combos"])
def test_a_local_url_in_the_build_stops_before_any_upload(ready: World, local: str) -> None:
    (ready.root / "extra.js").write_text(f'fetch("{local}")')
    result = ready.run("publish")
    assert result.code == 1
    assert "assets/index-a1.js holds a local URL" in result.err
    assert ready.public.puts == []
    assert ready.deploys() == []


# Criterion 8


def test_preview_then_smoke_test_then_production_of_the_same_folder(ready: World) -> None:
    result = ready.run("publish")
    assert result.code == 0, result.err
    deploys = ready.deploys()
    branches = [call["argv"][call["argv"].index("--branch") + 1] for call in deploys]
    assert branches == ["preview", "main"]
    assert deploys[0]["argv"][2] == deploys[1]["argv"][2]
    for call in deploys:
        assert call["argv"][3:5] == ["--project-name", "combo-test"]
    # The smoke test fetched the preview deployment's own URL before production.
    fetched = [url for url, _ in ready.http.requests if "pages.dev" in url]
    assert fetched and all(url.startswith("https://dep1.combo-test.pages.dev/") for url in fetched)
    assert ready.state()["live"]["deployment"] == "dep2"


@pytest.mark.parametrize("failing", ["preview", "smoke"])
def test_a_failed_preview_or_smoke_test_never_reaches_production(
    ready: World, failing: str
) -> None:
    ready.run("publish")
    before = ready.state()
    ready.clear_deployments()
    ready.add(combo("c", ("specialist", "mogul"), ("bayonet", "lore")))
    (ready.root / "wrangler.ndjson").unlink()
    if failing == "preview":
        ready.config["fail"] = ["preview"]
        ready.write_config()
    else:
        ready.http.drop_header = "Content-Security-Policy"
    result = ready.run("publish")
    assert result.code == 1
    branches = [call["argv"][call["argv"].index("--branch") + 1] for call in ready.deploys()]
    assert branches == ["preview"]
    assert ready.state() == before


def test_a_failed_production_deploy_exits_1_and_keeps_the_state(ready: World) -> None:
    ready.config["fail"] = ["main"]
    ready.write_config()
    result = ready.run("publish")
    assert result.code == 1
    assert "wrangler pages deploy (branch main) failed" in result.err
    assert ready.state() is None


def test_a_preview_publish_stops_after_its_smoke_test(ready: World) -> None:
    result = ready.run("publish", "--preview")
    assert result.code == 0, result.err
    assert len(ready.deploys()) == 1
    assert "Preview: https://preview.combo-test.pages.dev, deployment dep1" in result.out
    assert ready.state() is None


# Criterion 9


def test_counts_that_differ_from_the_export_fail_the_smoke_test(ready: World) -> None:
    from combo_publish.http import Response

    ready.http.override["https://dep1.combo-test.pages.dev/data/combo-counts.json"] = Response(
        200, b'{"gloves": {}, "knives": {}}', {"content-type": "application/json"}
    )
    result = ready.run("publish")
    assert result.code == 1
    assert "/data/combo-counts.json differs from the export" in result.err
    assert len(ready.deploys()) == 1


@pytest.mark.parametrize(
    "header",
    [
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Cross-Origin-Opener-Policy",
        "X-Robots-Tag",
    ],
)
def test_a_missing_header_fails_the_smoke_test(ready: World, header: str) -> None:
    ready.http.drop_header = header
    result = ready.run("publish")
    assert result.code == 1
    assert header in result.err
    assert len(ready.deploys()) == 1


def test_a_missing_screenshot_on_the_image_host_fails_the_smoke_test(ready: World) -> None:
    from combo_publish.http import Response

    ready.http.override["https://img.combo.skin/combos/a/v1/640.webp"] = Response(404, b"", {})
    result = ready.run("publish")
    assert result.code == 1
    assert "img.combo.skin/combos/a/v1/640.webp failed" in result.err


# Criterion 11


def test_a_second_publish_while_the_lock_is_held_names_the_running_one(ready: World) -> None:
    with state.Lock(ready.settings.state_dir, "publish --preview"):
        result = ready.run("publish")
    assert result.code == 1
    assert "Another run is in progress: publish --preview (pid " in result.err
    assert ready.calls("npm") == []
    # Released, the next one runs.
    assert ready.run("publish").code == 0


def test_the_lock_is_held_by_a_running_process(ready: World) -> None:
    script = (
        "import sys, time\n"
        "from pathlib import Path\n"
        "from combo_publish.state import Lock\n"
        f"with Lock(Path({str(ready.settings.state_dir)!r}), 'prune-images'):\n"
        "    print('locked', flush=True)\n"
        "    time.sleep(30)\n"
    )
    holder = subprocess.Popen([sys.executable, "-c", script], stdout=subprocess.PIPE, text=True)
    try:
        assert holder.stdout is not None and holder.stdout.readline().strip() == "locked"
        result = ready.run("publish")
        assert result.code == 1
        assert f"prune-images (pid {holder.pid}" in result.err
    finally:
        holder.kill()
        holder.wait()


# Criterion 12


def test_no_credential_appears_anywhere(ready: World) -> None:
    preview = ready.run("publish", "--preview")
    result = ready.run("publish")
    assert preview.code == 0 and result.code == 0, result.err
    places = [preview.out, preview.err, result.out, result.err]
    for folder in (ready.settings.state_dir, ready.root / "deployments", ready.temp):
        places += [path.read_text(errors="replace") for path in folder.rglob("*") if path.is_file()]
    places += [json.dumps(call["argv"]) for call in ready.calls("wrangler")]
    places += [json.dumps(call) for call in ready.calls("npm")]
    for secret in SECRETS:
        assert all(secret not in place for place in places), secret
    for call in ready.deploys():
        env = call["env"]
        assert env["CLOUDFLARE_API_TOKEN"] == PAGES_TOKEN
        assert env["CLOUDFLARE_ACCOUNT_ID"] == ACCOUNT
        assert IMAGES_KEY not in json.dumps(env) and IMAGES_SECRET not in json.dumps(env)
        assert not any(name.startswith("AWS_") for name in env)
        # Its own home and config, so wrangler's login is never read.
        assert Path(env["HOME"]).is_relative_to(ready.temp)
        assert Path(env["XDG_CONFIG_HOME"]).is_relative_to(ready.temp)
    assert ready.buckets.opened == [(ACCOUNT, "images-test")] * 2


def test_a_missing_credential_stops_before_anything_is_uploaded(ready: World) -> None:
    del ready.keychain.values["combo-skin-pages"]
    result = ready.run("publish")
    assert result.code == 1
    assert "No Keychain item for combo-skin-pages" in result.err
    assert "security add-generic-password -U -s combo-skin-pages -a combo-skin -w" in result.err
    assert ready.public.puts == []
    assert ready.deploys() == []


# Criterion 13


def test_a_dry_run_prints_the_plan_and_uploads_and_deploys_nothing(ready: World) -> None:
    result = ready.run("publish", "--dry-run")
    assert result.code == 0, result.err
    tip = git(ready.repo, "rev-parse", "origin/main")
    assert result.out.splitlines() == [
        f"Commit {tip[:12]} (origin/main) to production, dry run: First",
        "Combos: 2 published; 2 glove finishes and 1 knife finishes with combos",
        "Data files: 7 written, 7 changed since the last production publish",
        "Images: 13 referenced, 13 to upload (0.0 MB), 0 already there, 0 waiting to be pruned",
        "Pages: 10 files (0.0 MB), not deployed",
        "Dry run: nothing was uploaded or deployed.",
    ]
    assert ready.public.puts == []
    assert ready.calls("wrangler") == []
    assert ready.state() is None


def test_a_dry_run_without_the_image_token_still_plans(ready: World) -> None:
    ready.keychain.values.clear()
    result = ready.run("publish", "--dry-run")
    assert result.code == 0, result.err
    assert "13 to upload (0.0 MB), bucket not checked (no image token yet)" in result.out
    assert ready.buckets.opened == []


def test_a_real_run_prints_the_lines_in_order(ready: World) -> None:
    tip = git(ready.repo, "rev-parse", "origin/main")
    result = ready.run("publish")
    assert result.code == 0, result.err
    assert result.out.splitlines() == [
        f"Commit {tip[:12]} (origin/main) to production: First",
        "Combos: 2 published; 2 glove finishes and 1 knife finishes with combos",
        "Data files: 7 written, 7 changed since the last production publish",
        "Images: 13 referenced, 13 uploaded (0.0 MB), 0 already there, 0 waiting to be pruned",
        "Pages: 10 files; preview https://dep1.combo-test.pages.dev checked",
        "Live: https://combo.skin, deployment dep2",
        "Roll back: Pages dashboard > combo-test > Deployments > an earlier production deployment "
        "> Rollback to this deployment (deploy/README.md, Rollback)",
        "Pruned: 0 images unused by production for 30 days",
    ]
    again = ready.run("publish")
    assert "Data files: 7 written, 0 changed since the last production publish" in again.out
    assert "Images: 13 referenced, 0 uploaded (0.0 MB), 13 already there" in again.out


def test_schema_drift_stops_the_publish_before_the_export(ready: World) -> None:
    schemas = ready.api.openapi["components"]["schemas"]
    schemas["ComboCounts"]["required"] = ["gloves"]
    schemas["Screenshot"]["properties"]["blur"] = {"type": "string"}
    result = ready.run("publish")
    assert result.code == 1
    assert result.err.strip() == (
        "The running API's public schemas differ from the built commit's (ComboCounts, "
        "Screenshot). Rebuild the stack first: docker compose up -d --wait --build"
    )
    assert "/combo-counts" not in ready.api.requests
    assert ready.calls("npm") == []
    assert ready.public.puts == []
