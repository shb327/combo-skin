"""Spec 021, criterion 14, and spec 026, criterion 15: `status`."""

import json

from tests.support import ACCOUNT, PAGES_TOKEN, SECRETS, World, combo, git


def publish(world: World) -> str:
    world.add(combo("a", ("specialist", "mogul"), ("karambit", "fade")))
    assert world.run("publish").code == 0
    return git(world.repo, "rev-parse", "origin/main")


def manifest_of(world: World, deployment: str) -> dict[str, str]:
    raw = (world.root / "deployments" / deployment / "data" / "manifest.json").read_bytes()
    return dict(json.loads(raw))


def data_line(world: World, deployment: str, tail: str) -> str:
    raw = manifest_of(world, deployment)
    return (
        f"Live data: data {raw['data_version'][:12]}, exported {raw['exported_at']} with commit "
        f"{raw['exported_with'][:12]}, {tail}"
    )


def merge_deploy(world: World, message: str = "Combo Skin abc merge deploy, data def") -> str:
    """CI deploys a newer commit on the live data (dep3)."""
    commit = world.commit_on_main("README.md", "fix\n", "Fix")
    return world.add_deployment("main", message, commit=commit, like="dep2")


def test_status_after_a_publish(world: World) -> None:
    commit = publish(world)
    deploys = len(world.deploys())
    seen = len(world.http.requests)
    result = world.run("status")
    assert result.code == 0, result.err
    assert result.out.splitlines() == [
        f"Live: deployment dep2, commit {commit[:12]}, 2026-11-22T03:00:02.000000Z, publish",
        data_line(world, "dep2", "the data of the last publish recorded here"),
        "Rollback: none",
        "Behind origin/main: 0 commits",
        "Merge deploys: can deploy on this data",
        "Data: the local published combos match the live site",
    ]
    # It changes nothing, and asked the Pages API with the token in a header only.
    assert len(world.deploys()) == deploys
    api = [
        (url, headers) for url, headers in world.http.requests[seen:] if "api.cloudflare.com" in url
    ]
    project = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/combo-test"
    assert api == [
        (project, {"Authorization": f"Bearer {PAGES_TOKEN}"}),
        (
            f"{project}/deployments?env=production&page=1&per_page=25",
            {"Authorization": f"Bearer {PAGES_TOKEN}"},
        ),
    ]
    assert not [method for method, _ in world.http.sent]
    for secret in SECRETS:
        assert secret not in result.out + result.err


def test_status_after_a_merge_deploy_is_not_a_rollback(world: World) -> None:
    publish(world)
    deployment = merge_deploy(world)
    commit = git(world.repo, "rev-parse", "origin/main")
    result = world.run("status")
    assert result.code == 0, result.err
    assert result.out.splitlines() == [
        f"Live: deployment {deployment}, commit {commit[:12]}, 2026-11-22T03:00:03.000000Z, "
        "merge deploy",
        data_line(world, deployment, "the data of the last publish recorded here"),
        "Rollback: none",
        "Behind origin/main: 0 commits",
        "Merge deploys: can deploy on this data",
        "Data: the local published combos match the live site",
    ]


def test_status_counts_commits_behind_and_changed_data(world: World) -> None:
    publish(world)
    world.commit_on_main("README.md", "one\n")
    world.commit_on_main("README.md", "two\n")
    world.add(combo("b", ("specialist", "mogul"), ("bayonet", "lore")))
    result = world.run("status")
    assert result.code == 0, result.err
    assert "Behind origin/main: 2 commits" in result.out
    # The counts, the mogul file and the new lore file.
    assert "Data: 3 data files differ from the live site; publish to update it" in result.out


def test_status_after_a_rollback_to_an_older_publish(world: World) -> None:
    publish(world)
    world.add(combo("b", ("specialist", "mogul"), ("bayonet", "lore")))
    assert world.run("publish").code == 0
    assert world.state()["live"]["deployment"] == "dep4"
    world.roll_back("dep2")  # the first publish, whose data lacks combo b
    result = world.run("status")
    lines = result.out.splitlines()
    assert lines[0].startswith("Live: deployment dep2,")
    assert lines[1] == data_line(world, "dep2", "not the data of the last publish recorded here")
    assert lines[2] == (
        "Rollback: production is rolled back to deployment dep2; the newest production "
        "deployment is dep4"
    )
    assert lines[4] == (
        "Merge deploys: the next one will stop: production is rolled back to older data; "
        "publish to resume"
    )
    assert "Data: 3 data files differ from the live site" in result.out


def test_status_after_a_code_rollback(world: World) -> None:
    publish(world)
    merge_deploy(world)
    world.roll_back("dep2")
    result = world.run("status")
    lines = result.out.splitlines()
    assert lines[1] == data_line(world, "dep2", "the data of the last publish recorded here")
    assert lines[2] == (
        "Rollback: production is rolled back to deployment dep2; the newest production "
        "deployment is dep3"
    )
    assert lines[4] == (
        "Merge deploys: pushes are paused while production is rolled back; run the workflow "
        "by hand on main, or publish"
    )


def test_status_names_a_pending_schema_change(world: World) -> None:
    publish(world)
    openapi = json.loads((world.repo / "api/openapi.json").read_text())
    openapi["components"]["schemas"]["PublicCombo"]["properties"]["shared"] = {"type": "boolean"}
    world.commit_on_main("api/openapi.json", json.dumps(openapi), "Schema")
    result = world.run("status")
    assert (
        "Merge deploys: the next one will stop: the public schemas of origin/main differ from "
        "the live data's (PublicCombo); publish from the Mac"
    ) in result.out.splitlines()


def test_status_of_a_deployment_without_a_manifest(world: World) -> None:
    publish(world)
    (world.root / "deployments" / "dep2" / "data" / "manifest.json").unlink()
    result = world.run("status")
    lines = result.out.splitlines()
    assert lines[1] == "Live data: no data manifest (published before merge deploys)"
    assert lines[4] == (
        "Merge deploys: the next one will stop: the live deployment has no data manifest; "
        "publish once"
    )


def test_status_without_the_pages_token_says_how_to_add_it(world: World) -> None:
    del world.keychain.values["combo-skin-pages"]
    result = world.run("status")
    assert result.code == 1
    assert "security add-generic-password -U -s combo-skin-pages" in result.err
