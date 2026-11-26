"""Spec 026, criteria 7 to 13: `deploy-code release`, from a built folder to production, with
the checks on Pages' own state around it."""

import json
from pathlib import Path

import pytest

from tests.support import ACCOUNT, SECRETS, World, combo, git

TOKEN = "fake-ci-pages-token-value-0987654321"
LIST = "/deployments?env=production"


@pytest.fixture
def ci(world: World) -> World:
    """A world with a publish live (dep2), then a merge on main, built by `deploy-code build`
    into `out/`, and CI's environment ready for the release."""
    world.add(
        combo("a", ("specialist", "mogul"), ("karambit", "fade"), rating=9.5),
        combo("b", ("sport", "vice"), ("karambit", "fade"), rating=7.0),
    )
    assert world.run("publish").code == 0
    world.commit_on_main("README.md", "a fix\n", "Fix the focus rings")
    built = world.run("deploy-code", "build", "--out", str(world.root / "out"))
    assert built.code == 0, built.err
    world.environ.update(
        {
            "CLOUDFLARE_API_TOKEN": TOKEN,
            "CLOUDFLARE_ACCOUNT_ID": ACCOUNT,
            "PAGES_PROJECT": "combo-test",
            "GITHUB_STEP_SUMMARY": str(world.root / "summary.md"),
        }
    )
    return world


def release(world: World, *extra: str) -> tuple[int, str, str]:
    result = world.run("deploy-code", "release", str(world.root / "out"), *extra)
    return result.code, result.out, result.err


def summary(world: World) -> str:
    path = world.root / "summary.md"
    return path.read_text() if path.is_file() else ""


def branches(world: World) -> list[str]:
    return [call["argv"][call["argv"].index("--branch") + 1] for call in world.deploys()]


def tip(world: World) -> str:
    return git(world.repo, "rev-parse", "origin/main")


def data_version(world: World, deployment: str) -> str:
    raw = (world.root / "deployments" / deployment / "data" / "manifest.json").read_bytes()
    return str(json.loads(raw)["data_version"])


def on_list_call(world: World, number: int, action: object, *, before: bool = False) -> None:
    """Runs `action` around the `number`th request for the production deployments."""
    calls = {"count": 0}

    def hook(url: str) -> None:
        if LIST in url:
            calls["count"] += 1
            if calls["count"] == number:
                action()  # type: ignore[operator]

    (world.http.before if before else world.http.after).append(hook)


# The run that deploys


def test_a_merge_goes_live_after_its_preview_is_checked(ci: World) -> None:
    code, out, err = release(ci)
    assert code == 0, err
    assert branches(ci) == ["preview", "main", "preview", "main"]
    assert ci.canonical_id() == "dep4"
    version = data_version(ci, "dep2")
    for deployment in ("dep3", "dep4"):
        assert data_version(ci, deployment) == version
    for name in ("combo-counts.json", "gloves/specialist/mogul.json", "knives/karambit/fade.json"):
        live = ci.root / "deployments" / "dep2" / "data" / name
        assert (ci.root / "deployments" / "dep4" / "data" / name).read_bytes() == live.read_bytes()
    exported = json.loads(
        (ci.root / "deployments" / "dep2" / "data" / "manifest.json").read_bytes()
    )["exported_at"]
    first = (
        f"Live: commit {tip(ci)[:12]}, deployment dep4, on the data of the publish of "
        f"{exported} (data {version[:12]})"
    )
    assert summary(ci).splitlines()[0] == first
    assert first in out


# Criterion 7


def test_a_live_deployment_without_a_manifest_needs_a_publish(ci: World) -> None:
    (ci.root / "deployments" / "dep2" / "data" / "manifest.json").unlink()
    code, _, err = release(ci)
    assert code == 1
    assert err.strip() == "Needs a publish from the Mac: the live deployment has no data manifest."
    assert branches(ci) == ["preview", "main"]


def test_a_live_commit_that_is_not_on_main_stops(ci: World) -> None:
    ci.add_deployment("main", "Combo Skin elsewhere", commit="f" * 40, like="dep2")
    code, _, err = release(ci)
    assert code == 1
    assert "The live commit is not on main." in err


def test_a_commit_already_live_is_not_deployed(ci: World) -> None:
    ci.add_deployment("main", "Combo Skin newer", commit=tip(ci), like="dep2")
    code, out, _ = release(ci)
    assert code == 0
    assert f"Not deployed: already live in {tip(ci)[:12]} (deployment dep3)" in out
    assert summary(ci).startswith("Not deployed: already live in")
    assert branches(ci) == ["preview", "main"]


def test_rolled_back_data_needs_a_publish(ci: World) -> None:
    ci.add(combo("c", ("specialist", "mogul"), ("bayonet", "lore")))
    ci.environ.pop("CLOUDFLARE_API_TOKEN")
    assert ci.run("publish").code == 0  # dep3, dep4: newer data
    ci.environ["CLOUDFLARE_API_TOKEN"] = TOKEN
    ci.roll_back("dep2")
    code, _, err = release(ci)
    assert code == 1
    assert err.strip().startswith(
        "Needs a publish from the Mac: production is rolled back to the data of 2026-11-22T03:00:00"
    )
    assert branches(ci) == ["preview", "main", "preview", "main"]


def test_a_code_rollback_pauses_a_push_and_a_run_by_hand_deploys(ci: World) -> None:
    assert release(ci)[0] == 0  # dep3, dep4: the merge is live
    ci.commit_on_main("README.md", "another fix\n", "Another fix")
    ci.roll_back("dep2")  # bad code: back to the publish, with the same data
    out = ci.root / "out"
    for path in sorted(out.rglob("*"), reverse=True):
        path.unlink() if path.is_file() else path.rmdir()
    token = ci.environ.pop("CLOUDFLARE_API_TOKEN")
    assert ci.run("deploy-code", "build", "--out", str(out)).code == 0
    ci.environ["CLOUDFLARE_API_TOKEN"] = token

    code, _, err = release(ci)
    assert code == 1
    assert err.strip() == (
        "Paused: production is rolled back to deployment dep2. Run this workflow by hand on "
        "main to deploy anyway, or publish from the Mac."
    )
    assert ci.canonical_id() == "dep2"
    code, _, err = release(ci, "--by-hand")
    assert code == 0, err
    assert ci.canonical_id() == "dep6"


def test_data_that_changed_since_the_build_stops(ci: World) -> None:
    newer = ci.add_deployment("main", "Combo Skin older code", commit=tip(ci), like="dep2")
    # Not yet the built commit (so not "already live"), with another publish's data.
    git_parent = git(ci.repo, "rev-parse", "origin/main~1")
    meta = ci.root / "meta" / f"{newer}.json"
    meta.write_text(json.dumps({**json.loads(meta.read_text()), "commit": git_parent}))
    manifest = ci.root / "deployments" / newer / "data" / "manifest.json"
    raw = json.loads(manifest.read_bytes())
    manifest.write_text(json.dumps({**raw, "data_version": "c" * 64}))
    code, _, err = release(ci)
    assert code == 1
    assert "A publish went live during this run; run it again." in err
    assert branches(ci) == ["preview", "main"]


# Criterion 8


@pytest.mark.parametrize("failing", ["preview", "smoke"])
def test_nothing_reaches_production_after_a_failed_preview(ci: World, failing: str) -> None:
    if failing == "preview":
        ci.config["fail"] = ["preview"]
        ci.write_config()
    else:
        ci.http.drop_header = "Content-Security-Policy"
    code, _, _ = release(ci)
    assert code == 1
    assert summary(ci).startswith("Failed: ")
    assert branches(ci) == ["preview", "main", "preview"]
    assert ci.canonical_id() == "dep2"


def test_the_order_is_preview_smoke_recheck_production_check(ci: World) -> None:
    seen = len(ci.http.requests)
    assert release(ci)[0] == 0
    asked = [url for url, _ in ci.http.requests[seen:]]
    smoke = next(i for i, url in enumerate(asked) if url.startswith("https://dep3."))
    lists = [i for i, url in enumerate(asked) if LIST in url]
    assert len(lists) == 3
    assert lists[0] < smoke < lists[1] < lists[2]
    assert any(url.endswith("/data/manifest.json") and "dep3" in url for url in asked)


# Criterion 9


def test_a_deployment_going_live_before_production_stops_it(ci: World) -> None:
    def mac_publish() -> None:
        ci.add_deployment("main", "Combo Skin newer code", like="dep2")

    on_list_call(ci, 2, mac_publish, before=True)
    code, _, err = release(ci)
    assert code == 1
    assert "A deployment went live during this run; run it again." in err
    assert branches(ci) == ["preview", "main", "preview"]


# Criterion 10


def test_a_publish_landing_during_production_is_restored(ci: World) -> None:
    landed: list[str] = []
    on_list_call(
        ci, 2, lambda: landed.append(ci.add_deployment("main", "Combo Skin newer", like="dep2"))
    )
    code, _, err = release(ci)
    assert code == 1
    assert err.strip() == (
        "Failed: A publish went live during the production deploy; production was rolled "
        f"back to it (deployment {landed[0]})."
    )
    assert ci.canonical_id() == landed[0]
    assert "dep5" not in [one["id"] for one in ci.pages_deployments()]
    assert ("POST", f"{_api(ci)}/deployments/{landed[0]}/rollback") in ci.http.sent
    assert ("DELETE", f"{_api(ci)}/deployments/dep5") in ci.http.sent


def test_a_publish_after_this_deploy_is_left_live(ci: World) -> None:
    landed: list[str] = []
    on_list_call(
        ci,
        3,
        lambda: landed.append(ci.add_deployment("main", "Combo Skin newest", like="dep2")),
        before=True,
    )
    code, out, err = release(ci)
    assert code == 0, err
    assert f"Since then, deployment {landed[0]} went live with newer data." in out
    assert ci.canonical_id() == landed[0]
    assert not [sent for sent in ci.http.sent if sent[0] in ("POST", "DELETE")]


def _api(world: World) -> str:
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/"
        f"{world.settings.pages_project}"
    )


# Criterion 11


def test_a_merge_deploy_says_so_in_its_commit_message(ci: World) -> None:
    assert release(ci)[0] == 0
    messages = [call["argv"][call["argv"].index("--commit-message") + 1] for call in ci.deploys()]
    version = data_version(ci, "dep2")
    assert messages == [
        f"Combo Skin {git(ci.repo, 'rev-parse', 'origin/main~1')[:12]}",
        f"Combo Skin {git(ci.repo, 'rev-parse', 'origin/main~1')[:12]}",
        f"Combo Skin {tip(ci)[:12]} merge deploy, data {version[:12]}",
        f"Combo Skin {tip(ci)[:12]} merge deploy, data {version[:12]}",
    ]


# Criterion 12


def test_no_secret_or_project_name_appears_anywhere(ci: World) -> None:
    code, out, err = release(ci)
    assert code == 0, err
    places = [out, err, summary(ci), (ci.root / "out" / "plan.json").read_text()]
    places += [
        path.read_text(errors="replace")
        for path in (ci.root / "out" / "site").rglob("*")
        if path.is_file()
    ]
    for value in (TOKEN, ACCOUNT, "combo-test", *SECRETS):
        assert all(value not in place for place in places), value
    for call in ci.deploys()[2:]:
        env = call["env"]
        assert env["CLOUDFLARE_API_TOKEN"] == TOKEN
        assert env["CLOUDFLARE_ACCOUNT_ID"] == ACCOUNT
        assert not any(name.startswith(("AWS_", "GITHUB_")) for name in env)
        assert "PAGES_PROJECT" not in env


def test_release_needs_the_token_account_and_project(ci: World) -> None:
    for name in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "PAGES_PROJECT"):
        saved = ci.environ.pop(name)
        code, _, err = release(ci)
        assert code == 1
        assert name in err
        ci.environ[name] = saved
    assert branches(ci) == ["preview", "main"]


# Criterion 13


def test_failures_are_annotated_on_github_actions(ci: World) -> None:
    ci.environ["GITHUB_ACTIONS"] = "true"
    (ci.root / "deployments" / "dep2" / "data" / "manifest.json").unlink()
    code, out, _ = release(ci)
    assert code == 1
    assert (
        "::error::Needs a publish from the Mac: the live deployment has no data manifest."
        in out.splitlines()
    )
    assert summary(ci) == (
        "Needs a publish from the Mac: the live deployment has no data manifest.\n"
    )


def test_a_build_that_stops_writes_the_reason_to_the_summary(ci: World) -> None:
    token = ci.environ.pop("CLOUDFLARE_API_TOKEN")
    openapi = json.loads((ci.repo / "api/openapi.json").read_text())
    openapi["components"]["schemas"]["PublicCombo"]["properties"]["shared"] = {"type": "boolean"}
    ci.commit_on_main("api/openapi.json", json.dumps(openapi), "Schema")
    result = ci.run("deploy-code", "build", "--out", str(ci.root / "again"))
    ci.environ["CLOUDFLARE_API_TOKEN"] = token
    assert result.code == 1
    assert summary(ci).splitlines()[0] == (
        "Needs a publish from the Mac: the merged code expects public schemas the live data "
        "doesn't have (PublicCombo)."
    )


def test_a_built_folder_without_a_plan_fails(ci: World, tmp_path: Path) -> None:
    result = ci.run("deploy-code", "release", str(tmp_path))
    assert result.code == 1
    assert summary(ci).startswith("Failed: ")
    assert "holds no plan.json from deploy-code build" in result.err


# Audit fixes


def test_a_folder_built_from_another_branch_is_never_deployed(ci: World) -> None:
    git(ci.repo, "checkout", "-q", "-b", "side")
    (ci.repo / "README.md").write_text("side\n")
    git(ci.repo, "commit", "-q", "-am", "Side")
    git(ci.repo, "push", "-q", "origin", "side")
    side = git(ci.repo, "rev-parse", "HEAD")
    out = ci.root / "side-out"
    token = ci.environ.pop("CLOUDFLARE_API_TOKEN")
    assert ci.run("deploy-code", "build", "--ref", side, "--out", str(out)).code == 0
    ci.environ["CLOUDFLARE_API_TOKEN"] = token
    result = ci.run("deploy-code", "release", str(out))
    assert result.code == 1
    assert f"The built commit {side[:12]} is not on main; only main deploys." in result.err
    assert branches(ci) == ["preview", "main"]


def test_a_failed_rollback_after_a_race_says_older_data_is_live(ci: World) -> None:
    landed: list[str] = []
    on_list_call(
        ci, 2, lambda: landed.append(ci.add_deployment("main", "Combo Skin newer", like="dep2"))
    )
    real = ci.pages_send

    def refuse_rollback(method: str, url: str) -> object:
        if url.endswith("/rollback"):
            from tests.support import json_response

            return json_response({"success": False}, 403)
        return real(method, url)

    ci.pages_send = refuse_rollback  # type: ignore[method-assign,assignment]
    code, _, err = release(ci)
    assert code == 1
    assert err.strip().startswith(
        f"Failed: A publish (deployment {landed[0]}) went live during the production deploy, "
        "and this deploy put older data over it. Roll back to it in the Pages dashboard now"
    )
    assert ci.canonical_id() == "dep5"
    assert not [sent for sent in ci.http.sent if sent[0] == "DELETE"]
